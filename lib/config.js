// Fixed IDs pulled live from Notion and GHL on 2026-09-12. Update here if the
// databases, pipeline, or stages are ever renamed or rebuilt.

const NOTION_LEADS_DB_ID = "3970f522-58de-801b-ba64-000b1c5ac76d";
const NOTION_CALL_NOTES_DB_ID = "ae8fdae7-f544-4d9a-a00e-348eac3a7737";

const GHL_LOCATION_ID = "qdGnF008TZuPEtVT6qoR";
const GHL_PIPELINE_ID = "JHISQl5slfiLpWQBaABv"; // Sales TSC

const GHL_STAGE = {
  BOOKED_CALL: "e81148c1-51f6-4309-a848-c4562ee47efe",
  CANCEL_RESCHEDULE: "b6265391-dd87-429a-9952-574c92a6b4c2",
  NO_SHOW: "a9367aeb-5834-45d7-9051-f8c9d1dc8d4a",
  HIGH_PRIORITY: "443eca5d-bf2b-4b63-b068-62a5a2af8e09",
  WON: "f28a7d58-e158-4567-a1b6-04fa1ff65fb1",
  DQ: "7bc36d32-a945-427b-b5f9-cb76a236ae75",
};

const GHL_TIER_FIELD_ID = "zLeUC5uAsH7yUrFYxLQJ"; // contact.tier, options: Launch, Deploy, Command

// Outcome (as scored by Claude, matches the Notion Outcome select options)
// drives the GHL pipeline stage and the opportunity status. The separate
// "qualified" yes/no/unclear signal (genuine confirmed ability to pay,
// scored directly by the rubric) drives the Qualified/Not Qualified tag,
// independently of which outcome bucket the call landed in.
const OUTCOME_TO_GHL = {
  Qualified: { stage: GHL_STAGE.BOOKED_CALL, status: "open" },
  "Hot lead": { stage: GHL_STAGE.HIGH_PRIORITY, status: "open" },
  Sale: { stage: GHL_STAGE.WON, status: "won" },
  "Not Qualified": { stage: GHL_STAGE.DQ, status: "lost" },
  "No/not interested": { stage: GHL_STAGE.DQ, status: "lost" },
  Cancelled: { stage: GHL_STAGE.CANCEL_RESCHEDULE, status: "open" },
  Reschedule: { stage: GHL_STAGE.CANCEL_RESCHEDULE, status: "open" },
  "No show": { stage: GHL_STAGE.NO_SHOW, status: "open" },
  Nurture: { stage: GHL_STAGE.BOOKED_CALL, status: "open" },
  "N/A": null, // no real sales interaction, touch nothing in GHL beyond the note
};

const QUALIFIED_TAG = { yes: "Qualified", no: "Not Qualified" };

// Package (if pitched) in Notion has more options than the GHL Tier field does.
// Only these three map cleanly, anything else (Slay AI, RZ 1:1, the $ variants) is left untouched.
const PACKAGE_TO_GHL_TIER = {
  Launch: "Launch",
  Deploy: "Deploy",
  Command: "Command",
};

// Emails to exclude when picking the "prospect" out of a meeting's invitee
// list, comma separated in the env var, falls back to this empty default.
const INTERNAL_EMAILS = (process.env.INTERNAL_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

module.exports = {
  NOTION_LEADS_DB_ID,
  NOTION_CALL_NOTES_DB_ID,
  GHL_LOCATION_ID,
  GHL_PIPELINE_ID,
  GHL_STAGE,
  GHL_TIER_FIELD_ID,
  OUTCOME_TO_GHL,
  QUALIFIED_TAG,
  PACKAGE_TO_GHL_TIER,
  INTERNAL_EMAILS,
};
