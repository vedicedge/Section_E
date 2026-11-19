# PPT Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Placement emails with an attendee list become an admin-approved PPT that alerts only the Section E students on the list (calendar invite, site notice, push, calendar feed, Echo).

**Architecture:** The existing homework-inbox Apps Script gains a second search for placement emails and posts them (with the `.xlsx` as base64) to a new key-protected endpoint. The site parses and stores a pending PPT; on admin approval it notifies the listed students and hands the Apps Script an "invite task" on its next check-in, which creates the Google Calendar event as the admin and confirms back. The same check-in drives the evening-before and hour-before reminders.

**Tech Stack:** Next.js 16 App Router, pg/pglite migrations in `src/lib/schema.ts`, zod, ExcelJS (`src/lib/xlsx.ts`), web-push (`src/lib/push.ts`), ICS (`src/lib/calendar/ics.ts`), vitest, Playwright, Google Apps Script (GmailApp, CalendarApp).

**Spec:** `docs/superpowers/specs/2026-11-19-ppt-alerts-design.md`

## Global Constraints

- Nothing reaches students before the admin approves.
- Time zone: `Asia/Kolkata` for parsing and display; send the Apps Script ISO times with `+05:30`.
- Placement sender default: `placement.summers@imi.edu` (a constant in the script template, editable by the admin).
- Only active Section E roster rolls are stored; other rolls in the spreadsheet are discarded.
- Roll pattern in spreadsheets: `/\b(\d{2}PGDM\d{3}R?)\b/i`, upper-cased.
- Migrations are append-only: add one new entry to `MIGRATIONS`, never edit shipped ones.
- e2e: at most 8 admin sign-ins in the suite (existing limit); reuse an existing admin page in a serial test.
- Copy follows the site's voice: plain, sentence case, no exclamation marks.

## Review Focus

1. Email without a usable attendee list, or a list with zero Section E rolls → no card, but the message id is recorded so it isn't re-sent (Task 3 test `skips lists with no Section E students`).
2. Date/time missing or in another format ("Nov 20", "7 PM", "19:00", no year) → parser returns `null` for what it can't read; Approve is refused until date and time are set (Task 2 parser tests; Task 4 `approve needs a date and time`).
3. A corrected list sent later for the same company → a new pending card marked as an update of the earlier PPT; approving it replaces the attendees and re-issues invites only to new names (Task 3 `a corrected list updates the earlier PPT`).
4. Script runs twice, or the confirm call is lost → an invite task is served at most once per 2 hours and never again once confirmed (Task 3 `invite tasks are not handed out twice`).
5. Listed students without an email → still get the notice and push; the admin card shows "3 without an email address" (Task 4 e2e).

---

### Task 1: Student emails and the placement tables

**Files:**
- Modify: `src/lib/schema.ts` (append migration)
- Create: `src/lib/placements/emails.ts`
- Create: `src/app/api/admin/students/emails/route.ts`
- Modify: `src/app/admin/(panel)/students/page.tsx` (+ a small client form component next to it)
- Test: `tests/unit/placement-emails.test.ts`

**Interfaces:**
- Produces: tables `placement_events(id TEXT PK, company TEXT, title TEXT, on_date DATE NULL, at_time TEXT NULL, end_time TEXT NULL, venue TEXT NULL, notes TEXT, source_email_id TEXT UNIQUE, thread_url TEXT NULL, replaces_id TEXT NULL, status TEXT CHECK IN ('pending','approved','dismissed','skipped'), created_at, approved_at, invite_claimed_at, invite_sent_at, calendar_event_id TEXT NULL, reminded_eve_at, reminded_hour_at)`, `placement_attendees(event_id, roll_no, PRIMARY KEY(event_id, roll_no))`, column `students.email TEXT NULL`.
- Produces: `matchEmailLines(text: string, roster: {rollNo: string; name: string}[]): { matched: {rollNo: string; email: string}[]; unmatched: string[] }` (pure) and `saveStudentEmails(text: string): Promise<{ saved: number; unmatched: string[] }>`.

- [ ] **Step 1: Write the failing test** `tests/unit/placement-emails.test.ts`: lines like `"Aarushi Nayyar,aarushi.p26@imi.edu"`, `"26PGDM256 agrim.p26@imi.edu"` and `"Name,IMI Email Id"` (header) → two matched (roll from name match or from a roll in the line), header ignored; `"Nobody Here,x@imi.edu"` → unmatched; an email with a comma typo `himanshuyadav,p26@imi.edu` is repaired to a dot; non-email junk is unmatched.
- [ ] **Step 2: Run** `npx vitest run tests/unit/placement-emails.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the migration and `matchEmailLines` (name match = all roster-name words present after lower-casing and stripping punctuation; a roll in the line wins over the name). `saveStudentEmails` updates `students.email`.
- [ ] **Step 4: Run** the unit test → PASS; `npx tsc --noEmit -p .` clean.
- [ ] **Step 5: Admin form** on the Students page: textarea "Paste names (or roll numbers) with email addresses", posts to `POST /api/admin/students/emails {text}` (`requireAdmin`), shows "Saved 63 · Not matched: …". Students table shows an email tick column.
- [ ] **Step 6: Commit** `feat(placements): store student emails and add placement tables`.

### Task 2: Reading a placement email and its attendee list

**Files:**
- Create: `src/lib/placements/parse.ts`
- Test: `tests/unit/placement-parse.test.ts`

**Interfaces:**
- Produces: `parsePlacementEmail(input: { subject: string; body: string; receivedAt: string }): { company: string | null; title: string; date: string | null; time: string | null; venue: string | null; notes: string[] }` — `date` as `YYYY-MM-DD`, `time` as `HH:MM` 24-hour.
- Produces: `attendeeRolls(grids: Grid[]): string[]` — unique, upper-cased, in sheet order.

- [ ] **Step 1: Write the failing tests** with the Godrej email verbatim (subject `Pre-Placement Talk || Finals 2025-27 || SIP 2026-28 || Godrej Properties`, body as received on 18 Nov 2026) expecting `{ company: 'Godrej Properties', title: 'Godrej Properties PPT', date: '2026-11-20', time: '19:00', venue: 'Auditorium' }` and notes including `'Business formals'` and `'Attendance is mandatory for everyone on the attendee list'`. More cases: `"Date: Nov 20"` with `receivedAt` in Nov 2026 → `2026-11-20`; `"Time: 19:00"` → `19:00`; `"Time: 10.30 AM"` → `10:30`; no venue → `null`; no date → `null` (never guessed). `attendeeRolls` on a grid with header `Sr No. | Full Name | Roll Number` and rows `24PGDM144`, `26PGDM254`, ` 26pgdm255 ` → `['24PGDM144','26PGDM254','26PGDM255']`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/placement-parse.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Company: last `||`-separated part of the subject, else the bold/"will be conducting" phrase, else `null`. Date: reuse `findDate(text, receivedOn)` from `src/lib/homework/email.ts` if it fits the cases, otherwise a local reader for `20th November 2026` / `Nov 20`; year from `receivedAt` when missing. Notes: fixed phrases detected by keyword ("formal", "mandatory").
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** `feat(placements): read PPT details and attendee rolls`.

### Task 3: Ingest endpoint, invite tasks and reminders

**Files:**
- Create: `src/lib/placements/repo.ts`
- Create: `src/lib/placements/reminders.ts`
- Create: `src/app/api/placements/inbox/route.ts`
- Create: `src/app/api/placements/invites/route.ts`
- Test: `tests/unit/placement-reminders.test.ts`, e2e in `tests/e2e/app.spec.ts` (new serial test)

**Interfaces:**
- Consumes: `parsePlacementEmail`, `attendeeRolls` (Task 2); `readWorkbook` (`src/lib/xlsx.ts`); `verifyInboxKey` (`src/lib/homework/inbox.ts`); `sendPush` (`src/lib/push.ts`).
- Produces: `ingestPlacementEmails(emails: PlacementEmail[]): Promise<{ added: number; skipped: number }>` where `PlacementEmail = { id; threadUrl: string|null; subject; receivedAt; body; attachments: { name: string; dataBase64: string }[] }`.
- Produces: `inviteTasks(now: Date): Promise<InviteTask[]>`, `InviteTask = { eventId; title; startIso; endIso; location: string|null; description: string; guests: string[] }`; `confirmInvite(eventId: string, calendarEventId: string): Promise<void>`.
- Produces: `remindersDue(e: { date: string; time: string; remindedEveAt: Date|null; remindedHourAt: Date|null }, now: Date): ('eve' | 'hour')[]` (pure) and `sendPlacementReminders(now: Date): Promise<number>`.
- Produces: `listPlacements()`, `approvePlacement(id, edits)`, `dismissPlacement(id)`, `placementsFor(rollNo: string, today: string)` for Tasks 4–5.

- [ ] **Step 1: Write failing unit tests** for `remindersDue`: PPT 20 Nov 19:00 IST → at 19 Nov 18:59 IST `[]`; at 19 Nov 19:10 `['eve']`; at 20 Nov 17:40 `['hour']` (window 30–90 min before); already `remindedEveAt` set → no `'eve'`; after start → `[]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `reminders.ts`; run → PASS.
- [ ] **Step 4: Write the failing e2e test** "placement emails become a PPT for the listed students only": build a 3-row `.xlsx` in the test with ExcelJS (two fixture Section E rolls, one outside roll), POST to `/api/placements/inbox` with the inbox key (create it the way the homework inbox test does), expect `{ added: 1 }`; repeat the same id → `{ added: 0 }`; a second email whose list has no Section E rolls → `added: 0` (status `skipped`).
- [ ] **Step 5: Implement** the repo and both routes. Inbox route: same Bearer-key check and rate limit as `/api/homework/inbox`, body `{ emails: PlacementEmail[] }` (max 10, max 4 MB), then `sendPlacementReminders(now)`, respond `{ added, skipped, invites: await inviteTasks(now) }`. `inviteTasks` returns approved, unconfirmed events whose `invite_claimed_at` is null or older than 2 hours, and sets `invite_claimed_at`; guests = listed students with an email. Invites route: Bearer key, body `{ eventId, calendarEventId }`, calls `confirmInvite`. A new pending email for a company that already has an approved PPT on the same date sets `replaces_id`.
- [ ] **Step 6: Add e2e assertions** for "invite tasks are not handed out twice" (approve via admin API, first inbox call returns 1 task, immediate second call returns 0, after `confirmInvite` none) and "a corrected list updates the earlier PPT".
- [ ] **Step 7: Run** `npx vitest run` and the e2e suite → PASS. **Commit** `feat(placements): ingest PPT emails, invite tasks and reminders`.

### Task 4: Admin → Placements

**Files:**
- Create: `src/app/admin/(panel)/placements/page.tsx`, `PlacementCard.tsx` (client)
- Create: `src/app/api/admin/placements/[id]/route.ts`
- Modify: `src/app/admin/(panel)/AdminNav.tsx` (add `{ href: '/admin/placements', label: 'Placements' }` after Announcements)

**Interfaces:**
- Consumes: `listPlacements`, `approvePlacement(id, edits: { title?; date?; time?; endTime?; venue?; notes? })`, `dismissPlacement` (Task 3); `sendPush`.
- Produces: `POST /api/admin/placements/[id] { action: 'approve' | 'dismiss', edits? }` → `{ status, pushed }`.

- [ ] **Step 1: Write the failing e2e steps** (in the Task 3 test, signed-in admin): the pending card shows "Godrej Properties PPT", "Fri 20 Nov", "7:00 PM", "Auditorium", "2 students" and "1 without an email address"; approving with the time cleared is refused with "Add the date and time before approving."; approving with the time set shows "Approved" and the card moves to the approved list with "Invite: waiting for the inbox script".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the page (pending first, editable fields, attendee names from the roster, Approve/Dismiss), the route (`requireAdmin`; approve requires date and time), and on approval `sendPush(rolls, { title: 'You're on the attendee list', body: 'Godrej Properties PPT · Fri 20 Nov, 7:00 PM · Auditorium', url: '/' })`.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(placements): admin review and approval`.

### Task 5: What listed students see

**Files:**
- Modify: `src/lib/coming-up.ts` (kind `'placement'`, label `'PPT'`)
- Modify: `src/app/ComingUp.tsx` (notice at the top for a listed student's next PPT)
- Modify: `src/lib/calendar/repo.ts`, `src/lib/calendar/ics.ts` (placement events with `VALARM` at -P1D and -PT1H)
- Test: `tests/unit/calendar.test.ts`, `tests/unit/v23.test.ts` (where `comingUp` is already tested), e2e

**Interfaces:**
- Consumes: `placementsFor(rollNo, today): Promise<{ id; title; date; time; venue; notes }[]>` (Task 3).
- Produces: `comingUp(..., placements?: PlacementLike[])` additional optional argument; `CalendarEvent` gains optional `alarms?: string[]` (ISO-8601 durations).

- [ ] **Step 1: Write failing tests:** `comingUp` with one placement → item `{ kind: 'placement', label: 'PPT', title: 'Godrej Properties PPT', time: '19:00' }`; `buildCalendar` with `alarms: ['-P1D','-PT1H']` → two `BEGIN:VALARM` blocks with `TRIGGER:-P1D` / `TRIGGER:-PT1H` and `ACTION:DISPLAY`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; the notice reads "You're on the attendee list for Godrej Properties PPT · Fri 20 Nov, 7:00 PM · Auditorium" plus the notes, only for listed signed-in students.
- [ ] **Step 4: e2e:** listed fixture student sees the notice and the Coming up entry; a non-listed student sees neither; the listed student's `.ics` contains the event.
- [ ] **Step 5: Run** unit + e2e → PASS. **Commit** `feat(placements): notice, Coming up and calendar feed for listed students`.

### Task 6: The Apps Script

**Files:**
- Modify: `src/lib/homework/inbox-script.ts`
- Modify: the admin page that renders the script (Admin → Homework) to mention placements
- Test: `tests/unit/inbox-script.test.ts`

**Interfaces:**
- Consumes: `POST /api/placements/inbox`, `POST /api/placements/invites` (Task 3).
- Produces: `inboxScript({ endpoint, inboxKey, sectionList, facultyDomain, placementsEndpoint, invitesEndpoint, placementFrom })`.

- [ ] **Step 1: Write the failing test:** the generated script has no `__PLACEHOLDER__` left, contains `function checkPlacements`, `CalendarApp`, `setGuestsCanSeeOtherGuests(false)`, `sendInvites: true`, and parses with `new Function(script)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `checkPlacements()` (query `from:${PLACEMENT_FROM} has:attachment filename:xlsx newer_than:7d`, seen ids under a separate `PLACEMENT_SEEN` property, attachments as `Utilities.base64Encode(blob.getBytes())`), then for each returned invite task: `CalendarApp.getDefaultCalendar().createEvent(title, new Date(startIso), new Date(endIso), { location, description, guests: guests.join(','), sendInvites: true })`, `setGuestsCanSeeOtherGuests(false)`, POST `{ eventId, calendarEventId: event.getId() }` to the invites endpoint. `checkInbox()` calls `checkPlacements()` at the end so one trigger runs both.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(placements): Apps Script forwards PPT emails and sends invites`.

### Task 7: Echo knows about PPTs

**Files:**
- Modify: `src/lib/echo-feed.ts` (field `placements: { title; date; time; venue; notes; rolls: string[] }[]`, approved and upcoming only)
- Modify: `C:/Users/vivas/.section-e/echo-sync/sync.py` (render a "Placement talks" block; rolls rendered as "Listed roll numbers: …")
- Modify: both Echo pages (`echo.html`, `echo2.html`): one instruction line — answer "Am I on the list for …?" only from a given roll number, like seats.
- Test: extend the e2e feed assertions (placements present, rolls only, no names)

- [ ] **Step 1: Failing e2e assertion** on the feed, **Step 2** implement, **Step 3** run the suite → PASS, **Step 4** republish both Echos and run the sync once, **Step 5** commit `feat(echo): placement talks in Echo's feed`.

---

**After all tasks:** full `npx tsc --noEmit`, `npx vitest run`, e2e suite; push branch, PR, wait for the owner's merge; then regenerate the Apps Script in Admin → Homework and paste it into the admin's Apps Script project (one-time), and paste the email list in Admin → Students.
