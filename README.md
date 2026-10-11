# Section E

**Outside the building. Above the rest.** The private website of PGDM 2026–28, Section E. It gives every student three things:

| | |
|---|---|
| **My Seating Plan** | Your seat for every subject. You see only your own seat, on an anonymous room map. |
| **Live Timetable** | The official timetable, read straight from the college's workbook. Section E's classes are pulled out, and each class shows *your* seat. |
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

### Live timetable
- **Source:** a share link set in `/admin/timetable` or in `TIMETABLE_URL`. Changing it needs no redeploy. Supported sources:
  - **Google Drive / Google Sheets** links shared as *Anyone with the link → Viewer*. If `GOOGLE_API_KEY` is set, the Drive API is used and gives the sheet's exact *last edited* time. Otherwise the public download endpoints are used and changes are detected by content hash.
  - **OneDrive / SharePoint** "anyone" links.
  - Any direct `.xlsx` link.
- **Refresh:** the workbook is downloaded at most once every `TIMETABLE_TTL_SECONDS` (default 120). All visitors share one copy cached in Postgres. A *Refresh* button forces a new download (rate-limited).
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
   - optionally `TIMETABLE_URL` and `GOOGLE_API_KEY`
4. Deploy. Tables are created automatically on the first request.
5. Sign in at `/admin`, upload the seating plan and link the timetable.

Any other Node host with Postgres works too: run `npm run build && npm start`.

## Privacy notes

- The repository is public, so **no student data is committed**. `*.xlsx` and `.data/` are git-ignored. Seating data enters only through the admin upload, into the database.
- Students' pages include only their own assignments. The room map carries seat numbers and vacancy only, never names or roll numbers.
- The site is marked `noindex`.
