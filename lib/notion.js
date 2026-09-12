const { NOTION_LEADS_DB_ID, NOTION_CALL_NOTES_DB_ID } = require("./config");

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) throw new Error("NOTION_API_KEY not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

async function notionRequest(method, path, body) {
  const response = await fetch(`${NOTION_API_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`notion_request_failed method=${method} path=${path} status=${response.status} body=${text.slice(0, 2000)}`);
  }
  return response.json();
}

const rt = (text) => ({ rich_text: [{ type: "text", text: { content: (text || "").slice(0, 2000) } }] });
const title = (text) => ({ title: [{ type: "text", text: { content: (text || "").slice(0, 2000) } }] });
const select = (name) => (name ? { select: { name } } : { select: null });
const urlProp = (u) => ({ url: u || null });
const dateProp = (isoDate) => (isoDate ? { date: { start: isoDate } } : { date: null });
const emailProp = (e) => ({ email: e || null });
const phoneProp = (p) => ({ phone_number: p || null });
const relationProp = (pageIds) => ({ relation: pageIds.map((id) => ({ id })) });

function getPlainText(prop) {
  if (!prop) return "";
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "rich_text") return (prop.rich_text || []).map((t) => t.plain_text).join("");
  if (prop.type === "title") return (prop.title || []).map((t) => t.plain_text).join("");
  return "";
}

async function findLeadPageByEmail(email) {
  if (!email) return null;
  const result = await notionRequest("POST", `/databases/${NOTION_LEADS_DB_ID}/query`, {
    filter: { property: "Email", email: { equals: email } },
    page_size: 1,
  });
  return result.results[0] || null;
}

function nextCallSlot(leadPage) {
  if (!leadPage) return 1;
  const props = leadPage.properties;
  if (!getPlainText(props["Call 1"])) return 1;
  if (!getPlainText(props["Call 2"])) return 2;
  if (!getPlainText(props["Call 3"])) return 3;
  return 3; // no Call 4 column exists, a 4th call overwrites the C3 slot
}

async function createLeadPage({ name, email, phone }) {
  const page = await notionRequest("POST", "/pages", {
    parent: { database_id: NOTION_LEADS_DB_ID },
    properties: {
      Name: title(name || email || "Unknown"),
      ...(email ? { Email: emailProp(email) } : {}),
      ...(phone ? { "Tel           ": phoneProp(phone) } : {}),
    },
  });
  return page;
}

function buildLeadUpdateProperties({ callNumber, review, callDate, shareUrl, ghlPackageMapped }) {
  const props = {
    Score: rt(review.overall_score === null ? "N/A" : `${review.overall_score}/100`),
    Feedback: rt(review.feedback_short),
    Outcome: select(review.outcome),
    "Objection / Blocker": rt(review.objection_blocker),
    Deadline: rt(review.deadline),
    Notes: rt(review.notes_status_line),
    "Case Summary": rt(review.case_summary),
  };
  if (review.package_recommended) props["Package (if pitched)"] = select(review.package_recommended);

  if (callNumber === 1) {
    props["C1 Status"] = select(mapOutcomeToCallStatus(review.outcome, 1));
    props["C1 Date"] = dateProp(callDate);
    props["Call 1"] = urlProp(shareUrl);
  } else if (callNumber === 2) {
    props["C2 Status"] = select(mapOutcomeToCallStatus(review.outcome, 2));
    props["C2 date"] = dateProp(callDate);
    props["Call 2"] = urlProp(shareUrl);
  } else {
    props["C3 Status"] = rt(mapOutcomeToCallStatus(review.outcome, 3));
    props["C3 date"] = dateProp(callDate);
    props["Call 3"] = rt(shareUrl || "");
  }
  return props;
}

// C1/C2 Status are constrained selects with their own option sets, not identical
// to the Outcome list, so outcome needs a small translation per call slot.
function mapOutcomeToCallStatus(outcome, callNumber) {
  const c1Map = {
    Qualified: "Qualified",
    "Hot lead": "Qualified",
    Sale: "Sale",
    "Not Qualified": "Disqualified",
    "No/not interested": "Disqualified",
    Cancelled: "Cancelled",
    Reschedule: "Cancelled",
    "No show": "No show",
    Nurture: "Showed up",
    "N/A": "Cancelled",
  };
  const c2Map = {
    Qualified: "Showed up",
    "Hot lead": "Showed up",
    Sale: "Sale",
    "Not Qualified": "Disqualified",
    "No/not interested": "Disqualified",
    Cancelled: "Cancelled",
    Reschedule: "Fup call booked",
    "No show": "No show",
    Nurture: "Showed up",
    "N/A": "Cancelled",
  };
  if (callNumber === 1) return c1Map[outcome] || "Showed up";
  if (callNumber === 2) return c2Map[outcome] || "Showed up";
  return outcome; // C3 Status is free text
}

async function updateLeadPage(pageId, properties) {
  return notionRequest("PATCH", `/pages/${pageId}`, { properties });
}

function buildCallNotesBody(review) {
  const parts = [review.notes_body];
  if (review.next_call_script) {
    parts.push("\n\nNEXT CALL SCRIPT\n\n" + review.next_call_script);
  }
  if (review.follow_up_email_draft) {
    parts.push("\n\nDRAFT EMAIL, NOT SENT, REVIEW AND SEND MANUALLY\n\n" + review.follow_up_email_draft);
  }
  return parts.join("");
}

async function createCallNotesPage({ review, leadPageId, email, phone, shareUrl, callDate }) {
  const summary = buildCallNotesBody(review);
  const page = await notionRequest("POST", "/pages", {
    parent: { database_id: NOTION_CALL_NOTES_DB_ID },
    properties: {
      Title: title(`Call Notes • ${review.prospect_name} • ${review.call_date} • Andrea Caprio`),
      "Call date": dateProp(callDate),
      "Claude/Fathom summary": rt(summary),
      ...(email ? { Email: emailProp(email) } : {}),
      ...(phone ? { Phone: phoneProp(phone) } : {}),
      ...(shareUrl ? { "Fathom link": urlProp(shareUrl) } : {}),
      Source: select("Fathom"),
      ...(leadPageId ? { Lead: relationProp([leadPageId]) } : {}),
    },
  });
  return page;
}

async function linkLeadToCallNotes(leadPageId, callNotesPageId, existingRelationIds = []) {
  return notionRequest("PATCH", `/pages/${leadPageId}`, {
    properties: {
      "Imported notes": relationProp([...existingRelationIds, callNotesPageId].slice(-1)), // limit 1 on this relation
    },
  });
}

module.exports = {
  findLeadPageByEmail,
  nextCallSlot,
  createLeadPage,
  buildLeadUpdateProperties,
  updateLeadPage,
  createCallNotesPage,
  linkLeadToCallNotes,
  getPlainText,
};
