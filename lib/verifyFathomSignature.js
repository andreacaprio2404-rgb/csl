const crypto = require("crypto");

const MAX_TIMESTAMP_SKEW_SECONDS = 300;

// Fathom signs webhooks the same way Svix does: headers webhook-id,
// webhook-timestamp, webhook-signature; signed content is
// "{id}.{timestamp}.{raw_body}"; secret is "whsec_" plus base64.
// Confirmed against Fathom's docs indirectly via search, not the primary
// page (blocked by network policy when this was built), so the first real
// delivery should be checked against logs before this is fully trusted.
function verifyFathomSignature({ id, timestamp, signatureHeader, rawBody, secret }) {
  if (!id || !timestamp || !signatureHeader || !secret) {
    return { valid: false, reason: "missing_headers_or_secret" };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  const skew = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skew > MAX_TIMESTAMP_SKEW_SECONDS) {
    return { valid: false, reason: "timestamp_out_of_range" };
  }

  const secretBase64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(secretBase64, "base64");
  const signedContent = `${id}.${timestampSeconds}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent, "utf8").digest("base64");

  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.includes(",") ? part.split(",")[1] : part));

  const expectedBuf = Buffer.from(expected, "base64");
  const valid = candidates.some((candidate) => {
    let candidateBuf;
    try {
      candidateBuf = Buffer.from(candidate, "base64");
    } catch {
      return false;
    }
    return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
  });

  return valid ? { valid: true } : { valid: false, reason: "signature_mismatch" };
}

module.exports = { verifyFathomSignature };
