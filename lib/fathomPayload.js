// The exact top level shape of Fathom's "new meeting content ready" payload
// was not confirmed against the primary docs (network policy blocked
// developers.fathom.ai while this was built). This reads every plausible
// path found through search and logs the full raw payload on every call so
// the paths below can be corrected against a real delivery if they're wrong.
// It throws rather than guessing when the one field it cannot do without,
// the transcript, is missing.

function firstDefined(...values) {
  return values.find((v) => v !== undefined && v !== null);
}

function extractTranscriptText(transcript) {
  if (typeof transcript === "string") return transcript;
  if (!Array.isArray(transcript)) return null;
  return transcript
    .map((entry) => {
      const speaker = entry.speaker?.display_name || entry.speaker?.name || entry.speaker || "Unknown";
      const text = entry.text || entry.transcript || entry.content || "";
      const ts = entry.timestamp || entry.start_time || entry.recording_timestamp || "";
      return `[${ts}] ${speaker}: ${text}`;
    })
    .join("\n");
}

function normalizeFathomPayload(payload) {
  const meeting = payload.meeting || payload.data || payload;

  const recordingId = firstDefined(payload.recording_id, payload.id, meeting.id, meeting.recording_id);
  const title = firstDefined(payload.title, meeting.title, payload.calendar_invitees_title, meeting.calendar_invitees_title);
  const shareUrl = firstDefined(payload.url, payload.share_url, meeting.url, meeting.share_url, payload.recording_url);
  const startTime = firstDefined(
    payload.recording_start_time,
    payload.scheduled_start_time,
    meeting.recording_start_time,
    meeting.scheduled_start_time,
    payload.created_at
  );

  const invitees = firstDefined(payload.invitees, meeting.invitees, payload.calendar_invitees, meeting.calendar_invitees, []) || [];
  const inviteeEmails = invitees
    .map((inv) => (typeof inv === "string" ? inv : inv.email))
    .filter(Boolean);

  const rawTranscript = firstDefined(payload.transcript, meeting.transcript, payload.transcript_plaintext);
  const transcriptText = extractTranscriptText(rawTranscript);

  if (!transcriptText) {
    const err = new Error("fathom_payload_missing_transcript");
    err.payloadKeys = Object.keys(payload);
    err.meetingKeys = meeting === payload ? [] : Object.keys(meeting);
    throw err;
  }

  return {
    recordingId: recordingId ? String(recordingId) : null,
    title: title || null,
    shareUrl: shareUrl || null,
    startTime: startTime || null,
    inviteeEmails,
    transcriptText,
  };
}

module.exports = { normalizeFathomPayload };
