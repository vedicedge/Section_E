# Pre-Placement Talk (PPT) alerts

**Status:** agreed in conversation on 19 Nov 2026; to be built later the same day.

## Intent

Placement emails (e.g. "Pre-Placement Talk || Finals 2025-27 || SIP 2026-28 || Godrej Properties",
from placement.summers@imi.edu to the batch lists) attach an attendee list. Attendance is mandatory
for everyone on it: missing it costs eligibility for that company's selection process. Section E
students on the list should get a reliable calendar alert without the admin doing it by hand.

## What it does

1. The admin's existing Apps Script (homework inbox, runs in their IMI mailbox every 30 min) also
   forwards emails from the placement sender that carry an `.xlsx` attachment.
2. The site reads company, date, time and venue from the email text, and roll numbers from the
   spreadsheet, and keeps only active Section E students. No Section E students → nothing is shown.
3. The admin sees a card in **Admin → Placements** ("Godrej Properties PPT · Fri 20 Nov, 7 PM ·
   Auditorium · 21 students"), can correct any field, and taps **Approve** (or **Dismiss**).
4. On approval, only the listed students get:
   - a **Google Calendar invite** from the admin's account (created by the Apps Script on its next
     run; guest list hidden),
   - a **"You're on the attendee list"** notice and an entry in **Coming up** on the site,
   - a **push notification** now, the **evening before** (from 7 PM) and **about an hour before**,
   - the event in their **personal calendar link** (with alarms, for calendars that honour them).
5. **Echo** learns each approved PPT (company, time, venue, listed roll numbers only).

## Constraints

- Nothing reaches students until the admin approves (dates parsed from emails can be wrong; the
  invites go out from the admin's account).
- Vercel Cron runs once a day on this plan, so timed reminders are driven by the Apps Script's
  30-minute check-in, not by cron.
- Student email addresses are stored once (pasted by the admin from the class list) and used only
  for invites. Students without an address still get the site notice and push.
- No names, emails or rolls of students outside Section E are stored.
- Times are Asia/Kolkata.

## Approaches considered

- **A. Extend the homework-inbox Apps Script (chosen).** Already authorised in the admin's mailbox,
  can read attachments and create Calendar events as the admin; one script, one setup.
- **B. Admin uploads the list by hand.** Simpler, but not automatic; kept as the fallback (the
  same admin card accepts a pasted list).
- **C. Site sends invites itself.** Would need Google OAuth or an email service on the site; more
  moving parts and secrets than A.

## Non-goals

- Other placement email types (shortlists, interview slots) — only emails with an attendee list.
- Tracking attendance at the PPT.

## Left to the builder

Admin page layout details, exact copy of notices (in the site's existing voice), and how the
parser handles formats beyond the Godrej email (it must return null fields rather than guess).
