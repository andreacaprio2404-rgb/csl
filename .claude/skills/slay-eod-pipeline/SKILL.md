---
name: slay-eod-pipeline
description: Andrea Caprio's automated end of day pipeline for the SLAY closer role. Cross checks Notion, the lead tracker, and the Sales and Commission tabs against today's actual GHL calls, flags any gaps, then generates the two standard EOD reports. Use when Andrea says "EOD" or "run EOD" in chat, or when a scheduled check finds her last SLAY call of the day has ended. Read only against Notion, Sheets, GHL, and Fathom; the only write is a Slack draft, never a post.
---

# SLAY closer EOD pipeline

Two ways in: Andrea says "EOD" or "run EOD" (manual, run immediately regardless of
calendar state), or a scheduled check (see Trigger detection) finds her last call of
the day has ended (automatic). Both run the identical pipeline below.

If Andrea names a specific date ("run EOD for 9/14/26", "check 9/14/26 for testing"),
treat that date as "today" everywhere below (calendar query window, Notion date match,
Sales/Commission/Tracking date match). Say plainly in the output that this is a test
run for that date, not a live EOD, and still draft (never send) the Slack report.

## Known IDs, do not re-discover these each run

* Notion RZ Leads DB data source: `collection://3970f522-58de-801b-ba64-000b1c5ac76d`
* GHL location: `qdGnF008TZuPEtVT6qoR`
* GHL userId for Andrea Caprio: `xsy6Wq6moVVWolyrY1IB` (confirm with `get-user` only if a
  call fails on identity, not on every run)
* GHL calendars to exclude (Firm Leverage Audit / professional track, matched by calendar
  name containing "Leverage Audit" or "Case Command Leverage Strategist"):
  `OoJxXLrVsTQbcQYnfSgt` (Case Leverage Audit with Andrea), `AdGOCNa4cT9vhT0u1LeK`
  ("(Book with us) Consultation With a Case Command Leverage Strategist", a round robin
  audit calendar shared with another team member, first seen 9/17/26), and
  `71l7oMtcLv9s0BP5lF5Z` ("Case Leverage Audit with Natalia", a round robin audit
  calendar assigned to a different team member with Andrea as a secondary team member,
  first seen 9/21/26), plus any further sibling audit calendar that shows up assigned to
  her. When an unrecognized calendarId appears, check its name via `get-calendars` before
  counting it, rather than assuming it is a SLAY calendar. Everything confirmed non-audit
  counts as a SLAY call.
* TSC RZ Master spreadsheet (Google Sheets): file id
  `1d1L7iBqdj0R66sIGsU3jpo54-pYrJRzwaDQgk8C_SM0`. Contains, among other tabs: Sales,
  Commission, and Tracking. There is no reliable API to list literal tab titles through
  the Drive connector, so locate each tab by its header row signature, not by name:
  * Sales tab header starts: `Date, Name, GHL link, Email, Tel, Origin, Call, Follow up
    call date, Follow up call, Pitched, Notes, ... START DATE, Amount, Onboarding, ...`
    Package = `Pitched`, close amount = `Amount`, intake date = `START DATE`.
  * Commission tab: 8 unlabeled columns read as `Date, Name, [blank], Package, Amount,
    Commission $, Notes, Deposit note`, with `Total <Month>` rows summing each month.
  * Tracking tab header: `C1 Date, Name, GHL link, Email, Tel, Origin, C1 Status, C2
    date, C2 Status, C3 date, C3 Status, Package (if pitched), Notes, Objection /
    Blocker, Deadline, Outcome, Score, Case Summary, To do, Last follow up, Follow up,
    Call 1, Call 2, Call 3, Feedback`. This mirrors the Notion schema and is also where
    the EOD scorecard rollup rows live.
* Slack channel `#end-of-day-reports`: `C07JA9XR84U` (Slack Connect channel, posting is
  blocked for this integration, drafts only).

## Trigger detection (automatic mode only, skip for manual "EOD")

The scheduled Routine driving this only fires hourly on weekdays, 12:00 to 20:00 UTC
(2pm to 10pm CEST), and never on weekends. That schedule is the actual on/off switch,
not a filter Claude needs to reapply itself.

1. Call GHL `get-calendar-events` with `userId=xsy6Wq6moVVWolyrY1IB` and no
   `calendarId`, `startTime`/`endTime` spanning today in Europe/Rome (Andrea's
   timezone). This returns events across all her calendars in one call. Confirmed by
   testing: this endpoint's `startTime`/`endTime` bounds are not reliable when
   `calendarId` is omitted, it can return events from adjacent days outside the
   requested window. Never trust the window alone, always also filter client side:
   parse each event's own `startTime`, convert to Europe/Rome, and keep only events
   whose calendar date equals the target date. Do this filter before step 2.
2. Drop events whose `calendarId` matches the Leverage Audit exclusion list above.
3. Drop events with `appointmentStatus = cancelled`.
4. If no events remain, there were no SLAY calls today, do nothing (no report, no
   message, this is a normal quiet day, not an error).
5. Otherwise take the max `endTime` of what remains. If the current time has not
   passed it yet, do nothing this check.
6. If the current time has passed it, re run steps 1 to 3 once more before acting. If
   a new event appeared with a later end time (a same day reschedule or late add on),
   treat that as the new last call and wait for it instead. Otherwise proceed to Step
   1 of the pipeline below.
7. Before running, check this conversation's own history for today's date: if the EOD
   pipeline already ran today, do not run it again, this prevents double firing across
   repeated scheduled checks. If unsure, ask Andrea rather than silently skip or
   silently re-run.

## Pipeline step 1, data hygiene sweep (always runs first, before any report)

Identify every call Andrea had today using the GHL event list from trigger detection
(for manual "EOD", run steps 1 to 3 above right now to get today's call list, ignoring
the end of day wait). For each call, cross check:

1. **Notion RZ Leads DB.** Find the lead's page (match by email or GHL link). Confirm:
   correct `C1 Status`/`C2 Status`/`C3 Status` for the call that happened, a Fathom
   recording link present in `Call 1`/`Call 2`/`Call 3` (cross reference against
   Fathom `list_meetings`/`search_meetings` for today if the link looks missing),
   `Feedback` and `Score` recorded, and `Notes` or `Case Summary` present.
2. **Tracking tab** (TSC RZ Master). Confirm a row exists for every call that was a
   sale or commission event today, closed or paid. Calls that were not sales (no
   show, disqualified, still qualifying) do not need a Tracking row, Notion alone
   covers those, do not flag their absence here.
3. **Sales tab.** Confirm every closed deal today has a row with package (`Pitched`),
   amount (`Amount`), and intake date (`START DATE`).
4. **Commission tab.** Confirm PIF closes are logged at the full amount today, and
   payment plan closes have each future installment scheduled as its own future row
   (matching the pattern of existing multi installment entries, e.g. "3 x 2149").

List anything missing or mismatched as flags, plainly, before the reports. Never
silently patch, backfill, or guess a value, there is no write path to Notion or Sheets
in this skill regardless. A flag never blocks report generation, flag and proceed.

## Pipeline step 2, generate both EOD reports

Booked Calls and Live Calls count C1 only. Offers count only a newly pitched package
today (`Package (if pitched)` set for the first time), not a C2/C3 revisit of an
existing pitch.

**Report A, tracking window, full internal format:**
Total Revenue Generated, Total Collected, Booked Calls, Live Calls, Offers,
Enrollments, Deposits, Show rate, Close rate, then Today's Call Results as a numbered
list, then the ten category Performance Scorecard out of 10 each, Total out of 100,
and Daily Score out of 10.

**Report B, Slack window, condensed format:**
Total Revenue Generated, Total Collected, Booked Calls, Live Calls, Offers,
Enrollments, Deposits, Today's Call Results (C1 calls only, prospect emails not
names, if a C2/C3 got booked off a C1 today add that date inline on the C1 line), and
Daily Score.

Create Report B as a Slack draft with `slack_send_message_draft` into channel
`C07JA9XR84U`. Never send or post it. Tell Andrea it is a draft waiting in
`#end-of-day-reports` and that she needs to send it herself, never say it was
posted or sent.

## Formatting rules, apply to both reports and all chat output from this skill

No dash characters anywhere, no hyphens, no em dashes, use commas, colons, bullets, or
numbers instead.
