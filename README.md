# Section E

**Outside the building. Above the rest.** The private website of PGDM 2026–28, Section E. It gives every student four things:

| | |
|---|---|
| **My Seating Plan** | Your seat for every subject. You see only your own seat, on an anonymous room map. |
| **Homework** | What's due and when — due the next class of that subject or on a set date — with a phone reminder the evening before. |
| **Live Timetable** | The official timetable, synced from the college's workbook even when it is restricted to certain email IDs. Section E's classes are pulled out, and each class shows *your* seat. The admin can switch it off. |
| **OLT Mock Tests** | Timed MCQ practice tests that the admin creates, schedules and publishes from a dashboard. |

---

## Design direction

The visual system comes from the museum-catalogue reference:

- **A vermilion plate** (`#f0360f`) with warm ink, a subtle printed grain, and paper (`#f3ece2`) for the inner pages. Dark mode switches the paper to ink and keeps the hero red.
- **Typography:**
  - *Cormorant Garamond* for display text, with tight tracking and italic accents.
  - *Pinyon Script* for flourishes: the logotype, the "Seating" accent, and the giant watermark.
  - *Inter* for small uppercase "catalogue" notes and UI.

  All fonts are self-hosted through Fontsource, so no requests go to Google.
- **The reference's index of names** ("Van Gogh⁽⁵⁾ / Gustav Klimt⁽¹²⁾ …") becomes the three feature buttons, each with an italic superscript count. Hovering turns an item bone-white and changes the script watermark behind it, as "Edgar Degas" does in the reference.
- **Engraved plates:** hand-drawn SVG line art (a pavilion for "our own building", a crown, an hourglass) instead of stock icons.
- **A monumental "E"** with a hatched engraving shadow takes the place of the reference's portrait.
- The same motifs repeat across the site. Subject codes on the seat page are a slashed index. Scores and seats are set in large serif numerals. Counts appear as superscripts.

## Features in detail

### Registration (one time, per device)
1. The student enters their roll number. It is checked against the **Section E roster**, which is built from the seating-plan upload. The admin can also add students by hand.
2. On first use, the student confirms a masked name ("Riya K.") and chooses a **4-digit PIN**. That claims the roll number. On another device, the PIN is required.
3. A signed, HTTP-only cookie keeps them signed in for 180 days. When the admin resets a PIN, the student is signed out everywhere.

Without the PIN, anyone could type a classmate's roll number and see their seat or test results. The PIN prevents that.

### Personal seating
- The admin uploads the official seating workbook. Each sheet is one subject (`SM`, `DAM`, `CF`, `DT`, `OM`, `TOD`, `MM II` …), laid out in `Row N` blocks of `Seat No.` / `Roll No.` / `Name`. The parser finds these labels by their text, not by fixed cell positions, so small layout changes still work.
- Plans can be **class** or **exam** plans. Each can have a room, a valid-from/until window (for date-specific or exam arrangements), timetable aliases, and a note for students.
- Students see their row and seat in large numerals, their position ("2nd row from the front · seat 4 of 13"), and a **room map drawn from seat counts only**. No other student's name or roll number is ever sent to the browser.
- Data problems are reported, not hidden. If a roll number appears twice on a sheet, the admin preview warns about it, and the affected student sees a note asking them to confirm with their CR.
- If the timetable can be read, the seat page also shows a **"Next class"** strip with your seat for that class.

### Homework
- **Admin, every evening:** `/admin/homework` lists every subject. Subjects that had class that day come first. Type the homework next to each subject and choose when it's due:
  - **Next class:** resolved against the live timetable, so if the class is moved, the deadline moves with it. The last known date is kept in case the timetable later becomes unavailable.
  - **On a date:** any specific date.

  Post one row, or all filled rows at once. Optionally notify everyone immediately.
- **Students:** `/homework` groups work into *Due tomorrow*, *Due today*, *Coming up*, *Date to be confirmed* and *Past*. Each item can be ticked off. Ticks are private and also stop reminders for that item. The landing page shows what's due tomorrow, and the menu shows a count.
- **Reminders:** students can turn on notifications on their phone (Web Push). It works on Android, desktop browsers, and on iPhone once Section E is added to the Home Screen; the page explains how. Every evening around 7 pm IST, each student gets one notification listing what's due tomorrow that they haven't ticked off. The admin can also send it on demand, and can copy a ready-made list for the class WhatsApp group.
- Homework is visible only to registered Section E students.

### Live timetable
- **Sources** (chosen in `/admin/timetable`, no redeploy needed):
  - **Apps Script relay**, for sheets restricted to specific email IDs. A ~30-line Google Apps Script, generated for you in the admin page, runs in *your* Google account (the one that can open the timetable). Every 10 minutes it checks the sheet's version and sends the workbook only when it changed. It needs no Google Cloud project, no API keys, and no change to the sheet's sharing. If it goes quiet for 2 hours, the site flags the copy as possibly out of date, and Google emails you if the script starts failing. On Vercel a request body can be at most ~4.5 MB, so the relay handles workbooks up to about 3.3 MB (they travel base64-encoded); a timetable sheet is normally far smaller.
  - **Public share link:** Google Drive / Sheets shared as *Anyone with the link → Viewer*, OneDrive / SharePoint "anyone" links, or any direct `.xlsx` link. The server downloads it at most once every `TIMETABLE_TTL_SECONDS` (default 120). A *Refresh* button forces a new download. `GOOGLE_API_KEY` adds exact "last edited" times for Drive files.
  - **Manual upload:** upload the `.xlsx` whenever it changes.
- **On/off switch:** if you'd rather not have a timetable, switch it off. The tab, the landing schedule and the next-class hints disappear, and homework uses fixed due dates.
- All visitors share one parsed copy cached in Postgres.
- **Who can see it:** a copy that arrives through the relay or an upload comes from a restricted sheet, so it is shown only to registered students. A public share link is shown to everyone.
- **States:** a loading skeleton, *Live · synced 2 min ago*, *Sheet last edited …*, an error state, and a *stale copy* warning if the source can't be reached but an earlier copy exists.
- **Change detection:** when the content changes, every Section E session is compared with the previous version. Changes from the last 72 hours are listed ("CF → OM"), and the affected classes are badged.
- **Layout detection** (`src/lib/timetable/parse.ts`) reads:
  - time slots across the top or down the side;
  - dates or weekdays on the other axis;
  - Section E through any of: a *Section* column, a *Sec E* column header, a *SECTION E* block heading, a per-section sheet, or *Sec E* markers inside cells.

  It also pulls out faculty, room and status (cancelled, rescheduled, extra class, exam, struck-through cells).
- **No guessing:** if the layout can't be split by section with confidence, the parser does not guess. The page shows the **official sheet exactly as published** (merged cells, bold, fills, strike-through), with a search box. That "Official sheet" tab is always available so students can check the source.

### OLT mock tests
- **Admin side:** create, edit, schedule (opens/closes), publish, unpublish and delete tests. Each test has:
  - an optional duration;
  - attempts per student;
  - negative marking (¼, ⅓, ½ or full);
  - shuffling of questions and/or options;
  - when answers are revealed: after submitting, after the test closes, or never.

  Questions support single or multiple correct answers, marks per question and explanations. A **bulk paste** format imports a whole test at once:
  ```
  1. Which ratio measures liquidity?
  a) Debt-equity
  b) Current ratio *
  c) ROE
  Explanation: Current assets ÷ current liabilities.
  ```
- **Student side:** a list of live, upcoming and past tests, with an attractive empty state when none exist. Taking a test includes:
  - a rules page;
  - a **server-owned timer** that auto-submits;
  - autosave every few seconds, with a local backup if the connection drops;
  - a question navigator with flagging;
  - keyboard shortcuts;
  - a submit confirmation showing answered, unanswered and flagged counts.

  The results page shows the score, a short verdict, and a per-question review.
- Correct answers never leave the server while an attempt is open. Answers sent after the deadline (plus a 20-second grace period) are ignored.
- **Results for the admin:** averages, the highest score, a CSV export, and *Allow retake*.

## Architecture

- **Next.js 16** (App Router, React 19, TypeScript). Server components handle data, route handlers handle mutations, and CSS Modules plus a token file (`src/app/globals.css`) handle styling.
- **Postgres** via `DATABASE_URL` in production. Locally, an embedded **PGlite** database (Postgres in WASM) lives in `.data/` with nothing to install. Both share the same SQL. Migrations live in `src/lib/schema.ts`.
- **ExcelJS** reads workbooks into plain "grids", so the seating and timetable parsers are pure functions with unit tests.
- **Security:**
  - HMAC-signed HTTP-only cookies;
  - scrypt-hashed PINs and admin password;
  - rate limiting stored in Postgres;
  - same-origin checks on every write;
  - zod validation on every input;
  - security headers;
  - no secrets or student data in client bundles.

```
src/
  app/
    page.tsx                 landing (hero, manifesto, "Today in E")
    (main)/seat|timetable|tests|register
    (focus)/tests/attempt    distraction-free test runner
    admin/                   login + protected dashboard
    api/                     route handlers (auth, tests, timetable, admin/*)
  lib/
    seating/  timetable/  quizzes/   domain logic (parsers are pure)
    db.ts  schema.ts  session.ts  http.ts  rate-limit.ts  time.ts
  components/                header, menu, footer, engravings, session list
tests/unit                   parsers, matching, grading, bulk import
tests/e2e                    full flows against synthetic data
```

## Setting up reminders (one time)

1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
2. Set these environment variables:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (the public key)
   - `VAPID_PRIVATE_KEY` (the private key)
   - `VAPID_SUBJECT=mailto:you@example.com`
   - `CRON_SECRET` (any long random string)
3. On Vercel, `vercel.json` already schedules `GET /api/cron/homework-reminders` daily at 13:30 UTC (7 pm IST). Vercel sends `CRON_SECRET` as the bearer token automatically. On another host, have any scheduler call that URL with `Authorization: Bearer <CRON_SECRET>`.

## Running it locally

```bash
npm install
cp .env.example .env.local      # set ADMIN_PASSWORD (or _HASH); the rest is optional locally
npm run dev                     # http://localhost:3000
```

Then open `/admin` and:
1. **Seating plans:** upload the seating workbook. You can also load it from the CLI with `npm run import-seating -- path/to/file.xlsx`.
2. **Timetable:** paste the timetable share link.
3. **Mock tests:** create a test.

Checks:
```bash
npm run typecheck
npm test                        # unit tests
npx playwright install chromium  # once
npm run e2e                     # end-to-end (synthetic fixtures, fresh DB)
```

## Deploying (Vercel + Neon, free tiers)

1. Import the repository into Vercel.
2. Under **Storage**, add a **Neon Postgres** database. It sets `DATABASE_URL`.
3. Add these environment variables:
   - `SESSION_SECRET`
   - `ADMIN_PASSWORD_HASH` (from `npm run hash-password`)
   - for reminders: the VAPID keys and `CRON_SECRET` (see above)
   - optionally `TIMETABLE_URL`, `GOOGLE_API_KEY` and `NEXT_PUBLIC_SITE_URL`
4. Deploy. Tables are created automatically on the first request.
5. Sign in at `/admin`, upload the seating plan and link the timetable.

Any other Node host with Postgres works too: run `npm run build && npm start`.

## Privacy notes

- The repository is public, so **no student data is committed**. `*.xlsx` and `.data/` are git-ignored. Seating data enters only through the admin upload, into the database.
- Students' pages include only their own assignments. The room map carries seat numbers and vacancy only, never names or roll numbers.
- The site is marked `noindex`.
