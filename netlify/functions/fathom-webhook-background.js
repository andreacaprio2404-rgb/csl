const { verifyFathomSignature } = require("../../lib/verifyFathomSignature");
const { normalizeFathomPayload } = require("../../lib/fathomPayload");
const { scoreCallTranscript } = require("../../lib/anthropicReview");
const { INTERNAL_EMAILS } = require("../../lib/config");
const notion = require("../../lib/notion");
const ghl = require("../../lib/ghl");

// Background function: Netlify acks the caller with 202 before this body
// runs, and allows up to 15 minutes of execution, which the signature
// verification plus one LLM call plus several Notion/GHL writes needs.
// Because the ack already went out, a bad signature cannot be reflected
// back to Fathom as a 4xx, we can only refuse to process and log it.
exports.handler = async (event) => {
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const h = lowercaseHeaders(event.headers);

  const verdict = verifyFathomSignature({
    id: h["webhook-id"],
    timestamp: h["webhook-timestamp"],
    signatureHeader: h["webhook-signature"],
    rawBody,
    secret: process.env.FATHOM_WEBHOOK_SECRET,
  });

  if (!verdict.valid) {
    console.error("fathom_signature_rejected", verdict.reason);
    return { statusCode: 401, body: "invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("fathom_payload_not_json", String(err), rawBody.slice(0, 2000));
    return { statusCode: 400, body: "invalid json" };
  }

  // Logged in full so the parsing in lib/fathomPayload.js can be corrected
  // against a real delivery, since the schema wasn't confirmed against the
  // primary docs when this was written.
  console.log("fathom_payload_received", JSON.stringify(payload));

  let meeting;
  try {
    meeting = normalizeFathomPayload(payload);
  } catch (err) {
    console.error("fathom_payload_normalize_failed", String(err), err.payloadKeys, err.meetingKeys);
    return { statusCode: 200, body: "logged, could not parse transcript, see function logs" };
  }

  const prospectEmail =
    meeting.inviteeEmails.find((e) => !INTERNAL_EMAILS.includes(e.toLowerCase())) || meeting.inviteeEmails[0] || null;

  let review;
  try {
    review = await scoreCallTranscript({
      transcriptText: meeting.transcriptText,
      title: meeting.title,
      startTime: meeting.startTime,
      inviteeEmails: meeting.inviteeEmails,
    });
  } catch (err) {
    console.error("anthropic_scoring_failed", String(err));
    return { statusCode: 500, body: "scoring failed, see function logs" };
  }

  console.log("call_review_result", JSON.stringify(review));

  const isoDate = toIsoDate(review.call_date) || toIsoDate(meeting.startTime) || new Date().toISOString().slice(0, 10);

  const notionResult = await writeToNotion({ review, meeting, prospectEmail, isoDate });
  const ghlResult = await writeToGhl({ review, prospectEmail });

  console.log("pipeline_complete", JSON.stringify({ notionResult, ghlResult }));
  return { statusCode: 200, body: "ok" };
};

async function writeToNotion({ review, meeting, prospectEmail, isoDate }) {
  try {
    let leadPage = await notion.findLeadPageByEmail(prospectEmail);
    if (!leadPage) {
      leadPage = await notion.createLeadPage({ name: review.prospect_name, email: prospectEmail });
    }

    const callNumber = notion.nextCallSlot(leadPage);
    const leadProps = notion.buildLeadUpdateProperties({
      callNumber,
      review,
      callDate: isoDate,
      shareUrl: meeting.shareUrl,
    });
    await notion.updateLeadPage(leadPage.id, leadProps);

    const callNotesPage = await notion.createCallNotesPage({
      review,
      leadPageId: leadPage.id,
      email: prospectEmail,
      shareUrl: meeting.shareUrl,
      callDate: isoDate,
    });

    await notion.linkLeadToCallNotes(leadPage.id, callNotesPage.id);

    return { leadPageId: leadPage.id, callNotesPageId: callNotesPage.id, callNumber };
  } catch (err) {
    console.error("notion_write_failed", String(err));
    return { error: String(err) };
  }
}

async function writeToGhl({ review, prospectEmail }) {
  try {
    const contact = await ghl.findContactByEmail(prospectEmail);
    if (!contact) {
      return { skipped: "no matching GHL contact for " + prospectEmail };
    }

    await ghl.addNote(
      contact.id,
      `${review.notes_status_line}\n\n${review.feedback_short}\n\nObjection/Blocker: ${review.objection_blocker}\nDeadline: ${review.deadline}`
    );

    const outcomeResult = await ghl.applyOutcomeToGhl({
      contactId: contact.id,
      prospectName: review.prospect_name,
      outcome: review.outcome,
      qualified: review.qualified,
      packageRecommended: review.package_recommended,
    });

    return { contactId: contact.id, ...outcomeResult };
  } catch (err) {
    console.error("ghl_write_failed", String(err));
    return { error: String(err) };
  }
}

function lowercaseHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
  return out;
}

function toIsoDate(value) {
  if (!value) return null;
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
