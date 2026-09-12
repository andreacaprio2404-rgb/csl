# SLAY post call pipeline

Fathom webhook, when a call transcript is ready, scores it against your rubric with Claude, and writes formatted notes to Notion (RZ Leads DB plus Imported Call Notes) and updates the matching GHL contact and opportunity. Fully automated, no manual copy paste.

## How it works

1. Fathom sends a "new meeting content ready" webhook to `/webhooks/fathom` on your deployed Netlify site.
2. The function verifies the request really came from Fathom (HMAC signature check) before doing anything else.
3. It reads the transcript out of the payload, sends it to Claude with your scoring rubric and formatting rules, and gets back a structured score, notes, next call script, and a draft follow up email.
4. It writes to Notion: updates the matching lead row (or creates one if this is a new prospect), and creates a new Imported Call Notes page with the full notes, the next call script, and the draft email appended.
5. It writes to GHL: adds a note to the matching contact, moves the Sales TSC opportunity to the right pipeline stage and status, tags the contact Qualified or Not Qualified, and updates the Tier field when the package maps cleanly.
6. Nothing is ever emailed or texted automatically. The draft email lives in Notion for you to review and send yourself.

## One time setup

### 1. Deploy this to Netlify

Push this repo to GitHub (or wherever) and connect it as a new Netlify site. No build command needed, functions deploy automatically from `netlify/functions`.

### 2. Set environment variables

In Netlify, Site configuration, Environment variables, add everything listed in `.env.example`:

* `FATHOM_WEBHOOK_SECRET`, from the webhook's signing secret shown when you create it in Fathom
* `ANTHROPIC_API_KEY`, from console.anthropic.com
* `NOTION_API_KEY`, an internal integration token, see step 3
* `GHL_API_KEY`, a Private Integration Token, see step 4
* Optional `INTERNAL_EMAILS`, comma separated, your own email address(es) so the pipeline never mistakes you for the prospect when picking who to match in Notion and GHL

### 3. Share the Notion databases with your integration

Create an internal integration at notion.so, My integrations (or Settings, Connections, Develop or manage integrations), copy its secret into `NOTION_API_KEY`. Then open both the RZ Leads DB and the Imported Call Notes DB in Notion, and explicitly share each one with that integration (the "..." menu, Connections). Without this the API calls will fail with a permission error even though the token is valid.

### 4. Create a GHL Private Integration Token

In GHL, Settings, Private Integrations (at the sub account/location level, not agency), create a token with these scopes: contacts.readonly, contacts.write, opportunities.readonly, opportunities.write, locations/customFields.readonly. Copy it into `GHL_API_KEY`.

### 5. Point Fathom at your deployed function

In Fathom's settings, create a webhook for "new meeting content ready", pointed at `https://YOUR-SITE.netlify.app/webhooks/fathom`, with `include_transcript` turned on. Copy the signing secret it gives you into `FATHOM_WEBHOOK_SECRET`.

### 6. Verify the payload shape against a real call

The exact field names Fathom uses in the webhook body were reconstructed from search results, not the primary docs (this environment's network policy blocked `developers.fathom.ai` while this was built). The function logs the complete raw payload on every call (`fathom_payload_received` in the Netlify function log). After your first real call comes through:

1. Open the function's logs in Netlify and find that log line.
2. Compare its actual keys against what `lib/fathomPayload.js` expects (`recording_id`/`id`, `title`, `url`/`share_url`, `transcript`, `invitees`, `recording_start_time`).
3. If anything doesn't line up, adjust the `firstDefined(...)` paths in that file, they're written defensively with fallbacks but may need a real example to get exactly right.

If the transcript truly can't be found, the function logs the error and does nothing further rather than guessing or writing garbage into Notion or GHL.

## Fixed IDs baked into the code

All in `lib/config.js`, pulled live from your accounts on 2026-09-12:

* Notion RZ Leads DB: `3970f522-58de-801b-ba64-000b1c5ac76d`
* Notion Imported Call Notes DB: `ae8fdae7-f544-4d9a-a00e-348eac3a7737`
* GHL location: `qdGnF008TZuPEtVT6qoR`
* GHL Sales TSC pipeline and its stage IDs

If any of these get renamed, rebuilt, or the pipeline stages change, update `lib/config.js` to match.

## Known limitations, worth knowing before you trust this fully

* The Fathom payload shape is unverified against primary docs, see step 6 above.
* The GHL Tier custom field only has Launch, Deploy, Command as options. If Claude recommends Slay AI, RZ 1:1, or a $ variant package, that field is left untouched in GHL rather than guessing wrong (Notion's Package field still gets the real value).
* Notion's `Imported notes` relation on the lead row is limited to one link, so it always points at the most recent call's notes page, not a running list.
* A fourth call for the same prospect overwrites the C3 slot, there's no Call 4 column in the current schema.
* If no GHL contact matches the prospect's email, the GHL side is skipped entirely (logged, not an error) and only the Notion side gets written.
