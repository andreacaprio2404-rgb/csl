// The forced tool schema Claude must fill in. Using tool_choice this way
// gets reliable structured output instead of parsing prose.

const NOTION_OUTCOME_OPTIONS = [
  "Qualified",
  "Not Qualified",
  "Reschedule",
  "Cancelled",
  "No show",
  "No/not interested",
  "Sale",
  "N/A",
  "Hot lead",
  "Nurture",
];

const NOTION_PACKAGE_OPTIONS = [
  "Slay AI",
  "Deploy",
  "Launch",
  "Command",
  "RZ 1:1",
  "Command $9,997",
  "Deploy $5,997",
];

const callReviewTool = {
  name: "submit_call_review",
  description: "Submit the scored, formatted review of a single SLAY sales call transcript.",
  input_schema: {
    type: "object",
    properties: {
      prospect_name: { type: "string" },
      call_date: { type: "string", description: "MM/DD/YYYY" },
      call_number: { type: "integer", enum: [1, 2, 3] },
      overall_score: {
        type: ["integer", "null"],
        description: "0 to 100, calibrated so most working calls land 40 to 90. Null only if outcome is N/A.",
      },
      subscores: {
        type: "object",
        properties: {
          urgency_coi: { type: "integer", minimum: 0, maximum: 10 },
          financial_qualification_timing: { type: "integer", minimum: 0, maximum: 10 },
          vision_depth: { type: "integer", minimum: 0, maximum: 10 },
          close_execution: { type: "integer", minimum: 0, maximum: 10 },
        },
        required: ["urgency_coi", "financial_qualification_timing", "vision_depth", "close_execution"],
      },
      money_reconciled_live: { type: "boolean" },
      objection_resolution: { type: "boolean" },
      outcome: { type: "string", enum: NOTION_OUTCOME_OPTIONS },
      qualified: {
        type: "string",
        enum: ["yes", "no", "unclear"],
        description: "Genuine confirmed ability to pay any package discussed, not case strength or engagement.",
      },
      package_recommended: {
        type: ["string", "null"],
        enum: [...NOTION_PACKAGE_OPTIONS, null],
      },
      deadline: {
        type: "string",
        description: "Real date/deadline from the call, or 'Not stated on the call, confirm on next contact'.",
      },
      objection_blocker: { type: "string" },
      case_summary: { type: "string", description: "2 to 4 sentences of case background." },
      notes_status_line: {
        type: "string",
        description: "Short status line for the Notion Notes property, e.g. 'C1 9/12, Deploy recommended, no card ask, C2 booked 9/15'.",
      },
      feedback_short: {
        type: "string",
        description: "1 to 2 sentences plus the score, e.g. 'No close, budget gap real but no urgency built. Score 55/100.'",
      },
      notes_body: {
        type: "string",
        description:
          "The full Imported Call Notes body. Must start with the exact header 'Call Notes • [Name] • [Date] • Andrea Caprio' on its own line, then a bolded 3 line snapshot (most urgent deadline/status, primary goal/stake, make or break factor), then prose, 3 paragraphs maximum, 150 words maximum for the prose. No dash characters of any kind anywhere in this string, use commas or colons instead.",
      },
      next_call_script: {
        type: "string",
        description:
          "Full next call script (or same call continuation script) per the SLAY script structure, including the three leverages as verbatim dialogue where applicable. Empty string if there is no next call (Sale, N/A, DQ outcomes with no follow up planned).",
      },
      follow_up_email_draft: {
        type: "string",
        description:
          "Complete email as subject line then blank line then body, ready to copy and send. Empty string if no email is warranted (e.g. N/A outcome).",
      },
    },
    required: [
      "prospect_name",
      "call_date",
      "call_number",
      "overall_score",
      "subscores",
      "money_reconciled_live",
      "objection_resolution",
      "outcome",
      "qualified",
      "package_recommended",
      "deadline",
      "objection_blocker",
      "case_summary",
      "notes_status_line",
      "feedback_short",
      "notes_body",
      "next_call_script",
      "follow_up_email_draft",
    ],
  },
};

module.exports = { callReviewTool, NOTION_OUTCOME_OPTIONS, NOTION_PACKAGE_OPTIONS };
