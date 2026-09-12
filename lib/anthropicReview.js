const { callReviewTool } = require("./callReviewTool");
const { SYSTEM_PROMPT } = require("./systemPrompt");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

async function scoreCallTranscript({ transcriptText, title, startTime, inviteeEmails }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = [
    `Meeting title: ${title || "unknown"}`,
    `Recording start time: ${startTime || "unknown"}`,
    `Invitee emails: ${inviteeEmails.join(", ") || "none provided"}`,
    "",
    "Full transcript:",
    transcriptText,
  ].join("\n");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || DEFAULT_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [callReviewTool],
      tool_choice: { type: "tool", name: "submit_call_review" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`anthropic_request_failed status=${response.status} body=${body.slice(0, 2000)}`);
  }

  const data = await response.json();
  const toolUse = data.content?.find((block) => block.type === "tool_use" && block.name === "submit_call_review");
  if (!toolUse) {
    throw new Error(`anthropic_no_tool_use response=${JSON.stringify(data).slice(0, 2000)}`);
  }

  return toolUse.input;
}

module.exports = { scoreCallTranscript };
