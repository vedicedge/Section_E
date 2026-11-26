import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const FIXTURES = join(import.meta.dirname, '.fixtures');

async function adminLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Password').fill('e2e-admin-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

async function signIn(page: Page, roll: string, pin: string) {
  await page.goto('/register');
  await page.getByLabel('College roll number').fill(roll);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Your 4-digit PIN').fill(pin);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/seat/);
}

let recoveryCode = '';
let adminState: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>> | undefined;

async function register(page: Page, roll: string, pin: string) {
  await page.goto('/register');
  await page.getByLabel('College roll number').fill(roll);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Is this you?')).toBeVisible();
  await page.getByLabel('Choose a 4-digit PIN').fill(pin);
  await page.getByLabel('Repeat the PIN').fill(pin);
  await page.getByRole('button', { name: /register/i }).click();
  // The recovery code is shown once, before moving on.
  await expect(page.getByText('Your recovery code')).toBeVisible();
  recoveryCode = (await page.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!.trim();
  await page.getByRole('button', { name: /saved it, continue/ }).click();
  await expect(page).toHaveURL(/\/seat/);
}

test.describe.serial('Section E', () => {
  test('landing page shows the features', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Outside the building');
    // Echo is featured right under the hero, ahead of the feature tiles.
    const echo = page.getByRole('region', { name: /Ask Echo/ });
    await expect(echo.getByRole('link', { name: 'Ask Echo' })).toHaveAttribute('href', '/echo');
    // Not signed in: /echo asks you to register first, then brings you back.
    const anon = await page.request.get('/echo', { maxRedirects: 0 });
    expect(anon.status()).toBe(307);
    expect(anon.headers()['location']).toContain('/register?next=/echo');
    const nav = page.getByRole('navigation', { name: 'Features' });
    expect((await echo.boundingBox())!.y).toBeLessThan((await nav.boundingBox())!.y);
    await expect(nav.getByRole('link', { name: /My seat/ })).toHaveAttribute('href', '/seat');
    await expect(nav.getByRole('link', { name: /Live timetable/ })).toHaveAttribute('href', '/timetable');
    await expect(nav.getByRole('link', { name: /mock tests/i })).toHaveAttribute('href', '/tests');
    await expect(nav.getByRole('link', { name: /Homework/ })).toHaveAttribute('href', '/homework');
    await expect(nav.getByRole('link', { name: /Attendance/ })).toHaveAttribute('href', '/attendance');
  });

  test('empty states before any data exists', async ({ page }) => {
    await page.goto('/tests');
    await expect(page.getByText('No mock tests have been published yet')).toBeVisible();
    await page.goto('/timetable');
    await expect(page.getByText('Not connected')).toBeVisible();
  });

  test('admin pages are protected', async ({ page, request }) => {
    await page.goto('/admin/tests');
    await expect(page).toHaveURL(/\/admin\/login/);
    const res = await request.post('/api/admin/quizzes', { data: { title: 'x', questions: [] }, headers: { Origin: 'http://localhost:3200' } });
    expect(res.status()).toBe(401);
  });

  test('admin uploads the seating plan', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/seating');
    await page.locator('input[type=file]').setInputFiles(join(FIXTURES, 'seating.xlsx'));
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('5 students (5 new to the roster)')).toBeVisible();
    await page.getByRole('button', { name: /Import 2 plan/ }).click();
    await expect(page.getByText(/Imported 2 plan/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Current plans' })).toBeVisible();
  });

  test('registration validates roll numbers and protects them with a PIN', async ({ page, browser }) => {
    await page.goto('/register');
    await page.getByLabel('College roll number').fill('26PGDM999');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/isn’t on the Section E roster/)).toBeVisible();

    await register(page, '26PGDM902', '2468');

    // A second device must know the PIN.
    const other = await browser.newPage();
    await other.goto('/register');
    await other.getByLabel('College roll number').fill('26pgdm902');
    await other.getByRole('button', { name: 'Continue' }).click();
    await expect(other.getByText('Welcome back')).toBeVisible();
    await other.getByLabel('Your 4-digit PIN').fill('1111');
    await other.getByRole('button', { name: 'Sign in' }).click();
    await expect(other.getByText(/PIN doesn’t match/)).toBeVisible();
    await other.close();
  });

  test('a student resets a forgotten PIN without the admin', async ({ page, browser }) => {
    expect(recoveryCode).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    // Signed out everywhere: the roll number plus the recovery code sets a new PIN.
    const other = await browser.newPage();
    await other.goto('/register');
    await other.getByLabel('College roll number').fill('26PGDM902');
    await other.getByRole('button', { name: 'Continue' }).click();
    await other.getByRole('button', { name: 'Forgot PIN?' }).click();
    await other.getByLabel('Recovery code').fill('AAAA-BBBB-CCCC');
    await other.getByLabel('New 4-digit PIN').fill('1357');
    await other.getByLabel('Repeat the new PIN').fill('1357');
    await other.getByRole('button', { name: 'Set new PIN and sign in' }).click();
    await expect(other.getByText(/recovery code doesn’t match/)).toBeVisible();
    // Typing it in lower case with spaces still works.
    await other.getByLabel('Recovery code').fill(recoveryCode.toLowerCase().replace(/-/g, ' '));
    await other.getByRole('button', { name: 'Set new PIN and sign in' }).click();
    await expect(other.getByText(/^New PIN set,/)).toBeVisible();
    const fresh = (await other.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent())!.trim();
    expect(fresh).not.toBe(recoveryCode);
    await other.getByRole('button', { name: /saved it, continue/ }).click();
    await expect(other).toHaveURL(/\/seat/);

    // The registration device was signed out by the reset, and the old code is used up.
    await page.goto('/register');
    await expect(page.getByLabel('College roll number')).toBeVisible();
    const res = await page.request.post('/api/auth/recover', {
      data: { rollNo: '26PGDM902', code: recoveryCode, pin: '9999' },
      headers: { Origin: 'http://localhost:3200' },
    });
    expect(res.status()).toBe(401);

    // Still signed in on the other device: change the PIN there, no old PIN needed.
    await other.goto('/register');
    await expect(other.getByText('Registered on this device')).toBeVisible();
    await expect(other.getByText(/You have one/)).toBeVisible();
    await other.getByLabel('New 4-digit PIN').fill('2468');
    await other.getByLabel('Repeat the new PIN').fill('2468');
    await other.getByRole('button', { name: 'Change PIN' }).click();
    await expect(other.getByText(/PIN changed/)).toBeVisible();
    await other.reload();
    await expect(other.getByText('Registered on this device')).toBeVisible();
    await other.close();

    await signIn(page, '26PGDM902', '2468');
  });

  test('a student sees only their own seat', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('College roll number').fill('26PGDM902');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Your 4-digit PIN').fill('2468');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/seat/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Your seats');
    // SM: 26PGDM902 is Row 2, seat 2 in the fixture.
    await page.getByRole('button', { name: /^Strategic Management: Row 2, seat 2/ }).click();
    await expect(page.getByLabel(/Room map: your seat is Row 2, seat 2/)).toBeVisible();
    // Seats are numbered from the right, as in the room: seat 1 sits right of seat 2.
    const mine = await page.getByLabel(/^Your seat, 2$/).boundingBox();
    const seatOne = await page.getByLabel(/^Your seat, 2$/).locator('xpath=preceding-sibling::*[1]').boundingBox();
    expect(seatOne!.x).toBeGreaterThan(mine!.x);
    // No other student's identity is rendered anywhere on the page.
    const html = await page.content();
    for (const other of ['26PGDM901', '26PGDM903', '26PGDM904', '26PGDM905', 'Test Student 901']) expect(html).not.toContain(other);
  });

  test('admin builds, publishes and grades a mock test', async ({ page, browser }) => {
    await adminLogin(page);
    await page.goto('/admin/tests/new');
    await page.getByLabel('Title').fill('OLT Mock 1');
    await page.getByLabel('Duration (minutes)').fill('10');
    await page.getByRole('button', { name: 'Paste questions in bulk' }).click();
    await page.getByLabel('Questions to import').fill(
      ['1. 2 + 2 = ?', 'a) 3', 'b) 4 *', 'c) 5', '', '2. Pick the primes', 'a) 2 *', 'b) 4', 'c) 7 *', 'Points: 2'].join('\n'),
    );
    await page.getByRole('button', { name: 'Add 2 questions' }).click();
    await page.getByRole('button', { name: 'Save & publish' }).first().click();
    await expect(page.getByText('Saved and published.')).toBeVisible();

    const student = await browser.newPage();
    await student.goto('/register');
    await student.getByLabel('College roll number').fill('26PGDM902');
    await student.getByRole('button', { name: 'Continue' }).click();
    await student.getByLabel('Your 4-digit PIN').fill('2468');
    await student.getByRole('button', { name: 'Sign in' }).click();
    await expect(student).toHaveURL(/\/seat/);

    await student.goto('/tests');
    await student.getByRole('link', { name: /OLT Mock 1/ }).click();
    // Two tabs starting at the same moment get the same attempt, never two.
    await expect(student.getByRole('button', { name: 'Start test →' })).toBeVisible();
    const quizId = new URL(student.url()).pathname.split('/').pop();
    const starts = await Promise.all(
      [1, 2].map(() => student.request.post(`/api/tests/${quizId}/start`, { headers: { Origin: 'http://localhost:3200' } })),
    );
    const [first, second] = await Promise.all(starts.map((r) => r.json()));
    expect(first.attemptId, JSON.stringify(first)).toBeTruthy();
    expect(second.attemptId).toBe(first.attemptId);
    await student.getByRole('button', { name: 'Start test →' }).click();
    await student.getByRole('button', { name: 'Start the timer' }).click();
    await expect(student.getByRole('timer')).toBeVisible();
    await student.getByRole('radio', { name: /4/ }).click();
    await student.getByRole('button', { name: 'Next →' }).click();
    await student.getByRole('checkbox', { name: /2/ }).first().click();
    await student.getByRole('button', { name: 'Finish & submit' }).click();
    await expect(student.getByRole('heading', { name: 'Submit your test?' })).toBeVisible();
    await student.getByRole('button', { name: 'Submit now' }).click();
    await expect(student).toHaveURL(/\/tests\/result\//);
    // Q1 correct (1), Q2 wrong (picked only one of two primes) → 1 / 3.
    await expect(student.getByText('/ 3')).toBeVisible();
    await expect(student.locator('p', { hasText: /^1\s*\/ 3$/ })).toBeVisible();
    await student.close();

    await page.goto('/admin/tests');
    await expect(page.getByRole('link', { name: '1', exact: true })).toBeVisible();

    // Instant feedback: each answer is revealed (and locked) as soon as the student checks it.
    const created = await page.request.post('/api/admin/quizzes', {
      data: {
        title: 'Instant Mock',
        showAnswers: 'after_each',
        maxAttempts: 0,
        questions: [
          { prompt: 'Instant: 3 + 3 = ?', options: [{ id: 'a', text: 'Five' }, { id: 'b', text: 'Six' }], correct: ['b'], explanation: 'Three plus three is six.' },
          { prompt: 'Instant: capital of France?', options: [{ id: 'a', text: 'Lyon' }, { id: 'b', text: 'Paris' }], correct: ['b'], explanation: 'Paris is the capital.' },
        ],
      },
    });
    expect(created.status()).toBe(200);
    const { id: instantId } = await created.json();
    expect((await page.request.post(`/api/admin/quizzes/${instantId}/status`, { data: { status: 'published' } })).status()).toBe(200);

    const learner = await browser.newPage();
    await signIn(learner, '26PGDM902', '2468');
    await learner.goto(`/tests/${instantId}`);
    await learner.getByRole('button', { name: 'Start test →' }).click();
    await expect(learner.getByRole('heading', { name: 'Instant: 3 + 3 = ?' })).toBeVisible();
    const check = learner.getByRole('button', { name: 'Check answer' });
    await expect(check).toBeDisabled();
    await learner.getByRole('radio', { name: /Six/ }).click();
    await check.click();
    await expect(learner.getByRole('status').filter({ hasText: 'Correct' })).toContainText('Three plus three is six.');
    // The checked answer is final: clicking another option changes nothing.
    await learner.getByRole('radio', { name: /Five/ }).click({ force: true });
    await learner.keyboard.press('a');
    await expect(learner.getByRole('radio', { name: /Six/ })).toHaveAttribute('aria-checked', 'true');
    await expect(learner.getByRole('radio', { name: /Five/ })).toHaveAttribute('aria-checked', 'false');
    await expect(learner.getByRole('button', { name: 'Check answer' })).toHaveCount(0);

    await learner.getByRole('button', { name: 'Next →' }).click();
    await learner.getByRole('radio', { name: /Lyon/ }).click();
    await learner.getByRole('button', { name: 'Check answer' }).click();
    await expect(learner.getByRole('status').filter({ hasText: 'Not quite' })).toContainText('Paris is the capital.');
    await expect(learner.getByRole('radio', { name: /Paris/ })).toContainText('Correct answer');

    // A question that is not part of the attempt is refused.
    const attemptId = learner.url().split('/').pop()!;
    const stray = await learner.request.post(`/api/attempts/${attemptId}/check`, { data: { questionId: 'not-a-question', chosen: ['b'] } });
    expect(stray.status()).toBe(404);

    await learner.getByRole('button', { name: 'Finish & submit' }).click();
    await learner.getByRole('button', { name: 'Submit now' }).click();
    await expect(learner).toHaveURL(/\/tests\/result\//);
    await expect(learner.locator('p', { hasText: /^1\s*\/ 2$/ })).toBeVisible();
    await learner.close();
  });

  test('timetable syncs from the linked workbook', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/timetable');
    await page.getByRole('textbox', { name: 'Share link' }).fill('http://localhost:3299/timetable.xlsx');
    await page.getByRole('button', { name: 'Save & test' }).click();
    await expect(page.getByText('Saved — the timetable downloaded successfully.')).toBeVisible();
    await expect(page.getByText('Recognised')).toBeVisible();

    await signIn(page, '26PGDM902', '2468');
    await page.goto('/timetable');
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByText('Strategic Management').first()).toBeVisible();
    // Section D's classes (OM, TOD) are filtered out of the Section E schedule.
    await expect(page.getByText('OM', { exact: true })).toHaveCount(0);
    await expect(page.getByText('TOD', { exact: true })).toHaveCount(0);
    // Classes are matched to seating plans: 26PGDM902 sits in SM Row 2 · Seat 2.
    await expect(page.getByRole('link', { name: /Your seat\s*Row 2 · Seat 2/ }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Official sheet' }).click();
    await expect(page.getByRole('table')).toContainText('SAMPLE TIMETABLE');
  });
  test('admin posts homework; students see it, privately tick it off', async ({ page, browser }) => {
    await adminLogin(page);
    await page.goto('/admin/homework');
    await expect(page.getByRole('heading', { name: 'Post homework' })).toBeVisible();

    // SM meets again tomorrow in the fixture timetable, so "Next class" resolves to tomorrow.
    await page.getByRole('textbox', { name: 'Homework for SM', exact: true }).fill('Read case 4 and answer Q1–3');
    await expect(page.getByRole('radio', { name: /Next class/ }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Post homework for SM' }).click();
    await expect(page.getByText(/Posted 1/)).toBeVisible();

    // CF with a fixed date three days out.
    const due = await page.evaluate(() => {
      const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      d.setDate(d.getDate() + 3);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await page.getByRole('textbox', { name: 'Homework for CF', exact: true }).fill('Solve the WACC problem set');
    await page.getByLabel('Due date for CF').fill(due);
    await page.getByRole('button', { name: 'Post homework for CF' }).click();
    await expect(page.getByText(/Posted 1/)).toBeVisible();

    // Not registered → no homework content.
    const anon = await browser.newPage();
    await anon.goto('/homework');
    await expect(anon.getByRole('link', { name: /Register/ }).first()).toBeVisible();
    expect(await anon.content()).not.toContain('Read case 4');
    await anon.close();

    await signIn(page, '26PGDM902', '2468');
    await page.goto('/homework');
    const tomorrow = page.getByRole('region', { name: /Due tomorrow/ });
    await expect(tomorrow).toContainText('Read case 4 and answer Q1–3');
    await expect(page.getByRole('region', { name: /Coming up/ })).toContainText('Solve the WACC problem set');
    const tick = tomorrow.getByRole('checkbox').first();
    // Wait for the server to confirm the tick (the route may compile on first use in dev).
    const saved = page.waitForResponse((r) => r.url().includes('/api/homework/') && r.url().endsWith('/done') && r.request().method() === 'POST');
    await tick.check();
    await expect(tick).toBeChecked();
    expect((await saved).ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole('region', { name: /Due tomorrow/ }).getByRole('checkbox').first()).toBeChecked();

    // Landing shows what's due tomorrow for the signed-in student.
    await page.goto('/');
    await expect(page.getByText('Read case 4 and answer Q1–3')).toBeVisible();
  });

  test('reminder endpoints are protected and work', async ({ page, request }) => {
    await signIn(page, '26PGDM902', '2468');
    const sub = await page.request.post('/api/push/subscribe', {
      data: { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-test-device', keys: { p256dh: 'BOq1GdWMUM-E7d6qtQMa4cgOUsm27hxx', auth: 'e2e-auth-secret' } } },
    });
    expect(sub.status()).toBe(200);
    const bad = await request.post('/api/push/subscribe', {
      data: { subscription: { endpoint: 'http://169.254.169.254/latest', keys: { p256dh: 'x', auth: 'y' } } },
    });
    expect([401, 422]).toContain(bad.status());

    expect((await request.get('/api/cron/homework-reminders')).status()).toBe(401);
    expect((await request.get('/api/cron/homework-reminders', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);
    const ok = await request.get('/api/cron/homework-reminders', { headers: { Authorization: 'Bearer e2e-cron-secret' } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toHaveProperty('date');
  });

  test('restricted sheet: the Apps Script relay pushes the timetable', async ({ page, request }) => {
    await adminLogin(page);
    const put = await page.request.put('/api/admin/timetable', {
      data: { mode: 'relay', url: 'https://docs.google.com/spreadsheets/d/1E2eRestrictedSheetId_abcdefgh/edit?usp=sharing' },
    });
    expect(put.status()).toBe(200);
    const keyRes = await page.request.post('/api/admin/timetable/relay-key', { data: {} });
    expect(keyRes.status()).toBe(200);
    const { key, script } = await keyRes.json();
    expect(script).toContain('1E2eRestrictedSheetId_abcdefgh');
    expect(script).toContain(key);
    expect(script).toContain('/api/timetable/ingest');

    const endpoint = '/api/timetable/ingest';
    const modifiedAt = new Date().toISOString();
    expect((await request.post(endpoint, { data: { modifiedAt } })).status()).toBe(401);
    const auth = { Authorization: `Bearer ${key}` };
    const hb1 = await request.post(endpoint, { headers: auth, data: { fileName: 'Timetable.xlsx', modifiedAt } });
    expect(hb1.status()).toBe(200);
    expect((await hb1.json()).needFile).toBe(true);
    const { readFile } = await import('node:fs/promises');
    const data = (await readFile(join(FIXTURES, 'timetable.xlsx'))).toString('base64');
    const push = await request.post(endpoint, { headers: auth, data: { fileName: 'Timetable.xlsx', modifiedAt, data } });
    expect(push.status()).toBe(200);
    const hb2 = await request.post(endpoint, { headers: auth, data: { fileName: 'Timetable.xlsx', modifiedAt } });
    expect((await hb2.json()).needFile).toBe(false);

    // A copy of a restricted sheet is for registered students only.
    await page.goto('/timetable');
    await expect(page.getByRole('heading', { name: /For Section E only/ })).toBeVisible();
    await expect(page.getByText('Strategic Management')).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByText(/shared with Section E only/)).toBeVisible();

    await signIn(page, '26PGDM902', '2468');
    await page.goto('/timetable');
    await expect(page.getByText(/relay/i).first()).toBeVisible();
    await expect(page.getByText('Strategic Management').first()).toBeVisible();
  });

  test('the timetable can be switched off', async ({ page }) => {
    await adminLogin(page);
    expect((await page.request.put('/api/admin/timetable', { data: { enabled: false } })).status()).toBe(200);
    await page.goto('/timetable');
    await expect(page.getByText(/switched off/i).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Features' }).getByRole('link', { name: /Live timetable/i })).toHaveCount(0);
    // The bar at the top lists the pages; a switched-off one is left out.
    const bar = page.getByRole('navigation', { name: 'Main' });
    await expect(bar.getByRole('link', { name: /Homework/ })).toBeVisible();
    await expect(bar.getByRole('link', { name: /Timetable/ })).toHaveCount(0);
    expect((await page.request.put('/api/admin/timetable', { data: { enabled: true } })).status()).toBe(200);
  });

  test('attendance: students strike hearts privately; admin sets the rule', async ({ page, browser }) => {
    // The default term (course facts only): ids are stable subject keys.
    const subjects = (tod: number) =>
      (
        [
          ['DMA', 'DMA', 20],
          ['DT', 'DT', 10],
          ['CF', 'CF', 20],
          ['OM', 'OM', 20],
          ['MMII', 'MM II', 15],
          ['TOD', 'TOD', tod],
          ['SM', 'SM', 20],
        ] as const
      ).map(([id, code, total]) => ({ id, code, title: '', total, aliases: [] }));
    const settings = (enabled: boolean, tod: number, baseUpdatedAt: string | null) => ({
      baseUpdatedAt,
      enabled,
      minPercent: 80,
      termLabel: 'Term II',
      subjects: subjects(tod),
    });

    // 1. Anonymous: a teaser with a demo heart row, nothing personal.
    await page.goto('/attendance');
    await expect(page.getByText('Members only')).toBeVisible();
    await expect(page.getByRole('link', { name: /Register to start counting/ })).toBeVisible();
    await page.getByRole('button', { name: /DMA heart 4 of 4: intact/ }).click();
    await expect(page.getByRole('button', { name: /DMA heart 4 of 4: struck off/ })).toBeVisible();

    // 2. Admin: the default term is 23 hearts; TOD at 4 sessions leaves none.
    await adminLogin(page);
    await page.goto('/admin/attendance');
    await expect(page.getByText('23 hearts across 7 subjects at 80%')).toBeVisible();
    await page.getByLabel('Sessions for TOD', { exact: true }).fill('4');
    await expect(page.getByText(/TOD: 4 sessions leave no hearts/)).toBeVisible();
    page.on('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved — students see it/)).toBeVisible();
    await expect(page.getByText('21 hearts across 7 subjects at 80%')).toBeVisible();

    // 3. A student strikes, undoes, spends and overspends CF's hearts.
    await signIn(page, '26PGDM902', '2468');
    await page.goto('/attendance');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('(21)');
    await page.getByRole('button', { name: /CF heart 1 of 4: intact/ }).click();
    await expect(page.getByText('Struck a CF heart — 3 left.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'CF hearts: 3 of 4 left', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('group', { name: 'CF hearts: 4 of 4 left', exact: true })).toBeVisible();

    const savedFour = page.waitForResponse(
      async (r) => r.url().endsWith('/api/attendance/hearts') && r.ok() && (await r.json()).record?.missed === 4,
    );
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Took a CF leave', exact: true }).click();
    await savedFour;
    await page.reload();
    await expect(page.getByRole('group', { name: 'CF hearts: 0 of 4 left', exact: true })).toBeVisible();
    await expect(page.getByText('Mind the line', { exact: true }).first()).toBeVisible();

    const savedOver = page.waitForResponse(
      async (r) => r.url().endsWith('/api/attendance/hearts') && r.ok() && (await r.json()).record?.missed === 5,
    );
    await page.getByRole('button', { name: 'Mark another CF leave, past the limit', exact: true }).click();
    await page.getByRole('button', { name: 'Mark it', exact: true }).click();
    await expect(page.getByText('In the red', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'CF hearts: 0 of 4 left, 1 over the limit', exact: true })).toBeVisible();
    await savedOver;

    // The student's own session count: 25 sessions → 5 hearts, all spent, none over.
    const cf = page.getByRole('article').filter({ has: page.getByRole('group', { name: /^CF hearts:/ }) });
    await cf.getByRole('button', { name: /Adjust numbers/ }).click();
    await cf.getByLabel('Sessions this term', { exact: true }).fill('25');
    await cf.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('CF numbers saved.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'CF hearts: 0 of 5 left', exact: true })).toBeVisible();

    // TOD has no hearts at 4 sessions: hard mode.
    await expect(page.getByText(/every TOD class counts/).first()).toBeVisible();

    // 4. Privacy: another student starts from a full set.
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await register(other, '26PGDM904', '1357');
    await other.goto('/attendance');
    await expect(other.getByRole('group', { name: 'CF hearts: 4 of 4 left', exact: true })).toBeVisible();
    expect(await other.content()).not.toContain('26PGDM902');
    await otherContext.close();

    // 5. The admin sees aggregates only; fewer than 5 students counting → hidden.
    await page.goto('/admin/attendance');
    const counting = page.getByRole('table', { name: 'Students counting, by subject' });
    await expect(counting.getByRole('row', { name: /^CF\b/ })).toContainText('—');
    expect(await page.content()).not.toContain('26PGDM902');

    // 6. Switched off: the tab and its links disappear; then restore the defaults.
    const base = await page.locator('input[name="updatedAt"]').inputValue();
    expect(base).not.toBe('');
    const off = await page.request.put('/api/admin/attendance', { data: settings(false, 4, base) });
    expect(off.status()).toBe(200);
    const { updatedAt } = (await off.json()) as { updatedAt: string };
    await page.goto('/attendance');
    await expect(page.getByText(/switched off/).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Features' }).getByRole('link', { name: /Attendance/ })).toHaveCount(0);
    // The bar at the top lists the pages; a switched-off one is left out.
    const bar = page.getByRole('navigation', { name: 'Main' });
    await expect(bar.getByRole('link', { name: /Homework/ })).toBeVisible();
    await expect(bar.getByRole('link', { name: /Attendance/ })).toHaveCount(0);
    const on = await page.request.put('/api/admin/attendance', { data: settings(true, 14, updatedAt) });
    expect(on.status()).toBe(200);
  });

  test('calendar link: classes with seats for the phone calendar, private to the student', async ({ page, request }) => {
    await signIn(page, '26PGDM902', '2468');
    await page.goto('/seat');
    await page.getByRole('button', { name: 'Get my calendar link' }).click();
    const field = page.getByLabel('Your calendar link');
    await expect(field).toHaveValue(/\/api\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);
    const url = await field.inputValue();
    await expect(page.getByRole('link', { name: 'Add to iPhone Calendar' })).toHaveAttribute('href', /^webcal:\/\//);

    const res = await request.get(url);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/calendar');
    const ics = await res.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toMatch(/LOCATION:Row \d+\\, Seat \d+/);
    expect(ics).not.toContain('26PGDM');

    // A new link retires the old one.
    await page.getByRole('button', { name: 'Shared it by mistake? Make a new link' }).click();
    await page.getByRole('button', { name: 'Make a new link', exact: true }).click();
    await expect(field).not.toHaveValue(url);
    expect((await request.get(url)).status()).toBe(404);
    expect((await request.get(`/api/calendar/${'x'.repeat(32)}.ics`)).status()).toBe(404);
  });

  // One admin sign-in covers all of /admin/extras (sign-ins are rate-limited).
  test('study material is listed for registered students; posters show on the home page and /posters; Claude mock tests are listed', async ({ page, browser }) => {
    await adminLogin(page);
    await page.goto('/admin/extras');
    const refused = await page.request.post('/api/admin/study-materials', { data: { title: 'Bad', url: 'http://example.com/x' } });
    expect(refused.status()).toBe(422);
    await page.getByLabel('Subject (optional)').fill('tod');
    await page.getByLabel('Title').nth(2).fill('E2E Notes');
    await page.getByLabel('Link', { exact: true }).fill('https://drive.google.com/file/d/e2eNotesFileId0001/view');
    await page.getByRole('button', { name: 'Add study material' }).click();
    await expect(page.getByText('Study material added.')).toBeVisible();
    await page.getByLabel('Subject (optional)').fill('TOD');
    await page.getByLabel('Title').nth(2).fill('E2E Video');
    await page.getByLabel('Link', { exact: true }).fill('https://youtu.be/L48uKyFLrMs');
    await page.getByRole('button', { name: 'Add study material' }).click();
    await expect(page.getByRole('link', { name: /E2E Video/ })).toBeVisible();

    // Visitors are asked to register; nothing is listed for them.
    const guest = await browser.newPage();
    await guest.goto('/study');
    await expect(guest.getByRole('link', { name: 'Register to see it' })).toBeVisible();
    await expect(guest.getByText('E2E Notes')).toHaveCount(0);
    expect((await guest.request.post('/api/admin/study-materials', { data: { title: 'x', url: 'https://example.com' } })).status()).toBe(401);
    await guest.close();

    const student = await browser.newPage();
    await signIn(student, '26PGDM902', '2468');
    await student.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Study material' }).click();
    await expect(student.getByRole('heading', { level: 1, name: 'Study material' })).toBeVisible();
    await expect(student.getByRole('heading', { level: 2, name: /TOD/ })).toBeVisible();
    const notes = student.getByRole('link', { name: /E2E Notes/ });
    await expect(notes).toHaveAttribute('href', 'https://drive.google.com/file/d/e2eNotesFileId0001/view');
    await expect(notes).toHaveAttribute('target', '_blank');
    await expect(notes).toContainText('Google Drive');
    const video = student.getByRole('link', { name: /E2E Video/ });
    await expect(video).toHaveAttribute('href', 'https://youtu.be/L48uKyFLrMs');
    await expect(video.locator('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/L48uKyFLrMs/hqdefault.jpg');

    await student.close();

    // The admin can take one down again.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('listitem').filter({ hasText: 'E2E Notes' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('link', { name: /E2E Notes/ })).toHaveCount(0);

    await page.getByLabel('Title').first().fill('E2E Fest');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.getByLabel(/Poster image/).setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Add poster' }).click();
    await expect(page.getByText('(showing now)')).toBeVisible();
    await page.getByLabel('Title').nth(1).fill('E2E Mock');
    await page.getByLabel('Artifact link').fill('https://claude.ai/public/artifacts/e2e-mock');
    await page.getByRole('button', { name: 'Add mock test' }).click();
    await expect(page.getByRole('link', { name: 'E2E Mock' })).toBeVisible();

    const visitor = await browser.newPage();
    await visitor.goto('/tests');
    // Posters never pop up over a page: they live in the home page's Events row and on /posters.
    await expect(visitor.getByRole('dialog')).toHaveCount(0);
    await expect(visitor.getByRole('link', { name: 'E2E Mock' })).toHaveAttribute('href', 'https://claude.ai/public/artifacts/e2e-mock');
    await visitor.goto('/');
    const strip = visitor.getByTestId('poster-strip');
    await expect(strip.getByRole('img', { name: 'E2E Fest' })).toBeVisible();
    await strip.getByRole('link', { name: /E2E Fest/ }).click();
    await expect(visitor).toHaveURL(/\/posters#poster-/);
    await expect(visitor.getByTestId('posters').getByRole('img', { name: 'E2E Fest' })).toBeVisible();
    await expect(visitor.getByRole('dialog')).toHaveCount(0);
    await visitor.close();

    // Subject groups: the admin pastes a list (still signed in; the suite's admin sign-ins are rate limited).
    await page.goto('/admin/groups');
    await page.getByLabel('Subject').fill('CF');
    await page.getByLabel('Title (optional)').fill('Project groups');
    await page
      .getByLabel('…or paste the list')
      .fill(['Roll No\tGroup\tTopic', '26PGDM901\t1\tTata Steel', '26PGDM902\t\t', '26PGDM903\t2\tInfosys', '26PGDM999\t2\t'].join('\n'));
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('2 groups, 4 roll numbers')).toBeVisible();
    await expect(page.getByText(/Not on the roster.*26PGDM999/)).toBeVisible();
    await page.getByRole('button', { name: 'Save 2 groups' }).click();
    await expect(page.getByText(/Saved CF · Project groups: 2 groups, 3 students/)).toBeVisible();
    await expect(page.getByText('CF · Project groups', { exact: true })).toBeVisible();

    // Topics handed out later go up on their own and land on the matching groups.
    await page.getByLabel('Subject').fill('CF');
    await page.getByLabel('Title (optional)').fill('Project groups');
    await page.getByLabel('…or paste the list').fill(['Group\tTopic', '1\tSteel sector strategy', '7\tNobody'].join('\n'));
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText(/Not in that list.*Group 7/)).toBeVisible();
    await page.getByRole('button', { name: 'Save 1 topic' }).click();
    await expect(page.getByText(/Added topics to 1 group /)).toBeVisible();

    // Re-uploading the same subject and title replaces the list in one go.
    const again = await page.request.post('/api/admin/groups', {
      headers: { Origin: 'http://localhost:3200' },
      multipart: {
        subject: 'CF',
        title: 'Project groups',
        text: ['Roll No\tGroup\tTopic', '26PGDM901\t1\tSteel sector strategy', '26PGDM902\t1\t', '26PGDM903\t2\t'].join('\n'),
        commit: '1',
      },
    });
    expect((await again.json()).saved).toMatchObject({ replaced: true, groups: 2, students: 3 });

    // Echo's knowledge feed: locked without the key, class-wide facts only with it.
    const noKey = await page.request.get('/api/echo/feed');
    expect(noKey.status()).toBe(401);
    const made = await page.request.post('/api/admin/echo-key', { headers: { Origin: 'http://localhost:3200' }, data: {} });
    const { key } = await made.json();
    expect(key).toMatch(/^echo_/);
    const feedRes = await page.request.get('/api/echo/feed', { headers: { Authorization: `Bearer ${key}` } });
    expect(feedRes.status()).toBe(200);
    const feedText = await feedRes.text();
    const feed = JSON.parse(feedText);
    expect(feed.quizzes.map((q: { title: string }) => q.title)).toContain('OLT Mock 1');
    expect(feed.groups.find((g: { subject: string }) => g.subject === 'CF').groups[0]).toMatchObject({ name: 'Group 1', topic: 'Steel sector strategy', size: 2 });
    // The class timetable is part of the feed, and a switched-off timetable never breaks it.
    expect(['ok', 'stale', 'unavailable']).toContain(feed.timetable.status);
    expect(Array.isArray(feed.timetable.days)).toBe(true);
    // Seating goes out as roll number -> seat (26PGDM902 sits in SM Row 2 · Seat 2), with no names.
    const sm = feed.seating.find((p: { code: string }) => p.code === 'SM');
    expect(sm.seats.find((s: { rollNo: string }) => s.rollNo === '26PGDM902')).toMatchObject({ row: 'Row 2', seat: 2 });
    for (const s of sm.seats) expect(Object.keys(s).sort()).toEqual(['rollNo', 'row', 'seat', 'seatsInRow']);
    // Roll numbers appear nowhere else, and names appear nowhere at all.
    expect(JSON.stringify({ ...feed, seating: [], placements: [] })).not.toMatch(/\d{2}PGDM\d{2,4}/i);
    expect(feedText).not.toContain('Test Student');
    const oldKey = await page.request.get('/api/echo/feed', { headers: { Authorization: 'Bearer echo_wrong' } });
    expect(oldKey.status()).toBe(401);

    // A student sees only their own group and its members.
    const member = await browser.newPage();
    await member.goto('/register');
    await signIn(member, '26PGDM902', '2468');
    await member.goto('/groups');
    const card = member.getByRole('region', { name: 'Group 1' });
    await expect(card).toContainText('Steel sector strategy');
    await expect(card).toContainText('26PGDM901');
    await expect(card).toContainText('26PGDM902');
    expect(await member.content()).not.toContain('26PGDM903');
    await member.close();

    // The next test reuses this admin session (the suite's admin sign-ins are rate limited).
    adminState = await page.context().storageState();
  });

  test('v2.3: announcements, dates and the exam countdown, the mistakes notebook, offline pages', async ({ browser }) => {
    const admin = await browser.newPage({ storageState: adminState });
    const istDay = (offset: number) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);

    // Announcements: posted with a notification to every subscribed device.
    await admin.goto('/admin/announcements');
    await expect(admin.getByRole('heading', { name: 'Announcements' })).toBeVisible();
    await admin.getByLabel('Title').fill('E2E: no class on Friday');
    await admin.getByLabel('Details (optional)').fill('CF moves to Saturday, 10 am.');
    admin.once('dialog', (d) => d.accept());
    await admin.getByRole('button', { name: 'Post announcement' }).click();
    await expect(admin.getByRole('status').filter({ hasText: /^Posted/ })).toBeVisible();
    await expect(admin.getByTestId('seen-count').first()).toContainText('seen by 0/');
    const guestPost = await browser.newPage();
    expect((await guestPost.request.post('/api/admin/announcements', { data: { title: 'x' } })).status()).toBe(401);
    await guestPost.close();

    // Dates: a pasted exam schedule plus one presentation.
    await admin.goto('/admin/dates');
    await admin.getByLabel('Schedule').fill(`${istDay(3)}, CF, End-term exam, 10:00
${istDay(5)}, MM II, End-term exam`);
    await admin.getByRole('button', { name: 'Add all' }).click();
    await expect(admin.getByText('2 dates added.')).toBeVisible();
    const bad = await admin.request.post('/api/admin/key-dates', { data: { mode: 'paste', text: 'someday, CF' } });
    expect(bad.status()).toBe(422);
    const one = await admin.request.post('/api/admin/key-dates', {
      data: { mode: 'one', kind: 'presentation', subject: 'TOD', title: 'Group 1 presents', onDate: istDay(1), atTime: '', details: '' },
    });
    expect(one.status()).toBe(200);
    await admin.reload();
    await expect(admin.getByTestId('admin-date')).toHaveCount(3);

    const student = await browser.newPage();
    await student.goto('/register');
    await signIn(student, '26PGDM902', '2468');
    // "Ask Echo" sends a signed-in student to the Echo copy they were invited to (26PGDM902 is on the second).
    const toEcho = await student.request.get('/echo', { maxRedirects: 0 });
    expect(toEcho.status()).toBe(307);
    expect(toEcho.headers()['location']).toMatch(/^https:\/\/claude\.ai\/artifact\/AthRNRtiNRX7GWFgDCzfsQ$/);
    await student.goto('/');
    const banner = student.getByTestId('announcement-banner');
    await expect(banner).toContainText('E2E: no class on Friday');
    const countdown = student.getByTestId('exam-countdown');
    await expect(countdown).toContainText('3');
    await expect(countdown).toContainText('days to the first exam');
    await expect(countdown).toContainText('MM II');
    const up = student.getByTestId('coming-up');
    await expect(up).toContainText('Group 1 presents');
    await expect(up).toContainText('Tomorrow');
    await expect(up).toContainText('End-term exam');

    await banner.getByRole('button', { name: 'Got it' }).click();
    await expect(banner).toHaveCount(0);
    await expect.poll(async () => (await admin.reload(), await admin.goto('/admin/announcements'), admin.getByTestId('seen-count').first().textContent())).toContain('seen by 1/');
    await student.reload();
    await expect(student.getByTestId('announcement-banner')).toHaveCount(0);
    await student.goto('/announcements');
    await expect(student.getByTestId('announcement')).toContainText('CF moves to Saturday, 10 am.');

    // Mistakes notebook: the wrong answers from the two mock tests taken earlier.
    await student.goto('/tests');
    await student.getByRole('link', { name: 'Revise your mistakes notebook' }).click();
    await expect(student.getByRole('heading', { level: 1, name: 'Mistakes notebook' })).toBeVisible();
    const mistakes = student.getByTestId('mistake');
    await expect(mistakes).toHaveCount(2);
    await expect(student.getByText('Pick the primes')).toBeVisible();
    await expect(mistakes.filter({ hasText: 'Instant: capital of France?' })).toContainText('Paris is the capital.');
    const saved = student.waitForResponse((r) => r.url().endsWith('/api/mistakes') && r.ok());
    await mistakes.filter({ hasText: 'Pick the primes' }).getByRole('button', { name: 'Got it' }).click();
    await expect(mistakes).toHaveCount(1);
    await saved;
    await student.reload();
    await expect(student.getByTestId('mistake')).toHaveCount(1);
    await expect(student.getByText('1 marked “Got it”.')).toBeVisible();

    // Offline: pages opened while online still open without a connection.
    await student.goto('/seat');
    await student.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await student.reload(); // now controlled by the worker, so this copy is saved
    await expect.poll(() => student.evaluate(async () => Boolean(await caches.match(new URL('/seat', location.href).href)))).toBe(true);
    // (Playwright's offline switch doesn't reach the service worker's own requests, so what it
    // serves with no connection is covered by tests/unit/service-worker.test.ts instead.)

    // Signing out deletes the saved pages.
    await student.goto('/register');
    await student.getByRole('button', { name: /Sign out/ }).click();
    await expect.poll(() => student.evaluate(async () => Boolean(await caches.match(new URL('/seat', location.href).href)))).toBe(false);
    await student.close();
    await admin.close();
  });
  test('placement emails become a PPT for the listed students only', async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const issued = await admin.request.post('/api/admin/homework/inbox-key', {
      data: { sectionList: 'pgdm2026sec-e@imi.edu', facultyDomain: 'imi.edu' },
      headers: { Origin: 'http://localhost:3200' },
    });
    expect(issued.status()).toBe(200);
    const key = /const INBOX_KEY = "([^"]+)"/.exec((await issued.json()).script)?.[1];
    expect(key).toBeTruthy();

    const ExcelJS = (await import('exceljs')).default;
    async function list(rolls: string[]) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Attendees');
      ws.addRow(['Roll No', 'Name']);
      rolls.forEach((r, i) => ws.addRow([r, `Student ${i}`]));
      return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    }
    const body = ['We are pleased to inform you that Acme Corp will be conducting its Pre-Placement Talk.', '- Date: 20th November 2026', '- Time: 7:00 PM', '- Venue: Auditorium'].join('\n');
    const mail = (id: string, dataBase64: string) => ({
      id,
      threadUrl: null,
      subject: 'Pre-Placement Talk || Acme Corp',
      receivedAt: '2026-11-18T05:39:42Z',
      body,
      attachments: [{ name: 'attendees.xlsx', dataBase64 }],
    });
    const send = async (emails: unknown[]) => {
      const res = await request.post('/api/placements/inbox', { data: { emails }, headers: { Authorization: `Bearer ${key}` } });
      expect(res.status()).toBe(200);
      return res.json();
    };

    const noKey = await request.post('/api/placements/inbox', { data: { emails: [] } });
    expect(noKey.status()).toBe(401);

    const mixed = await list(['26PGDM901', '26PGDM902', '99PGDM999']);
    expect(await send([mail('ppt-e2e-1', mixed)])).toMatchObject({ added: 1, skipped: 0, invites: [] });
    // The same email again changes nothing.
    expect(await send([mail('ppt-e2e-1', mixed)])).toMatchObject({ added: 0, skipped: 0 });
    // A list with nobody from Section E is set aside.
    expect(await send([mail('ppt-e2e-2', await list(['99PGDM998', '99PGDM999']))])).toMatchObject({ added: 0, skipped: 1 });
    // An attachment that is not a readable spreadsheet stays visible to the admin instead of being skipped.
    const broken = { ...mail('ppt-e2e-3', Buffer.from('not a spreadsheet').toString('base64')), subject: 'Pre-Placement Talk || Broken Co', attachments: [{ name: 'Attendee List.xlsx', dataBase64: Buffer.from('not a spreadsheet').toString('base64') }] };
    expect(await send([broken])).toMatchObject({ added: 1, skipped: 0 });
    // A brochure is not an attendee list: with no spreadsheet at all the email is set aside.
    const brochure = { ...mail('ppt-e2e-4', ''), attachments: [{ name: 'brochure.pdf', dataBase64: Buffer.from('%PDF-1.4').toString('base64') }] };
    expect(await send([brochure])).toMatchObject({ added: 0, skipped: 1 });
    await admin.close();
  });
  test('admin reviews, approves and corrects a PPT', async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const origin = { Origin: 'http://localhost:3200' };
    const issued = await admin.request.post('/api/admin/homework/inbox-key', {
      data: { sectionList: 'pgdm2026sec-e@imi.edu', facultyDomain: 'imi.edu' },
      headers: origin,
    });
    const key = /const INBOX_KEY = "([^"]+)"/.exec((await issued.json()).script)?.[1];
    expect(key).toBeTruthy();
    // Only the first listed student has an address; 26PGDM904 never gets one.
    expect((await admin.request.post('/api/admin/students/emails', { data: { text: '26PGDM901 p901@imi.edu' }, headers: origin })).status()).toBe(200);

    // A name no earlier run has used, so this run finds only its own cards in the shared database.
    const stamp = Date.now().toString(36).replace(/\d/g, (c) => 'abcdefghij'[Number(c)]!);
    const company = `Godrej Properties ${stamp}`;
    const title = `${company} PPT`;
    const ExcelJS = (await import('exceljs')).default;
    async function list(rolls: string[]) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Attendees');
      ws.addRow(['Roll No', 'Name']);
      rolls.forEach((r, i) => ws.addRow([r, `Student ${i}`]));
      return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    }
    const mail = async (id: string, rolls: string[]) => ({
      id,
      threadUrl: null,
      subject: `Pre-Placement Talk || ${company}`,
      receivedAt: '2026-11-18T05:39:42Z',
      body: [`${company} will be conducting its Pre-Placement Talk.`, '- Date: 20th November 2037', '- Time: 7:00 PM', '- Venue: Auditorium'].join('\n'),
      attachments: [{ name: 'attendees.xlsx', dataBase64: await list(rolls) }],
    });
    const checkIn = async (emails: unknown[] = []) => {
      const res = await request.post('/api/placements/inbox', { data: { emails }, headers: { Authorization: `Bearer ${key}` } });
      expect(res.status()).toBe(200);
      return (await res.json()) as { added: number; invites: { eventId: string; title: string; guests: string[] }[] };
    };
    const mine = <T extends { title: string }>(r: { invites: T[] }) => r.invites.filter((i) => i.title === title);
    const card = (page: import('@playwright/test').Page, status: string) =>
      page.locator(`[data-testid=placement-card][data-status=${status}]`, { hasText: title });

    expect(await checkIn([await mail(`ppt-e2e-gp-${stamp}`, ['26PGDM901', '26PGDM904'])])).toMatchObject({ added: 1 });

    const page = await admin.newPage();
    await page.goto('/admin/placements');
    const pending = card(page, 'pending');
    await expect(pending).toContainText(company);
    await expect(pending).toContainText('Fri 20 Nov');
    await expect(pending).toContainText('7:00 PM');
    await expect(pending).toContainText('Auditorium');
    await expect(pending).toContainText('2 students');
    await expect(pending).toContainText('1 without an email address');

    // The date and time are needed before a PPT can be approved.
    await pending.getByLabel('Starts').fill('');
    await pending.getByRole('button', { name: 'Approve' }).click();
    await expect(pending).toContainText('Add the date and time before approving.');
    await pending.getByLabel('Starts').fill('19:00');
    await pending.getByRole('button', { name: 'Approve' }).click();
    const approved = card(page, 'approved');
    await expect(approved).toContainText('Approved');
    await expect(approved).toContainText('Invite: waiting for the inbox script');
    await expect(card(page, 'pending')).toHaveCount(0);

    // The calendar invite is handed to the inbox script once, and not again after it confirms.
    const first = await checkIn();
    expect(mine(first)).toHaveLength(1);
    expect(mine(first)[0]!.guests).toEqual(['p901@imi.edu']);
    expect(mine(await checkIn())).toHaveLength(0);
    const confirm = await request.post('/api/placements/invites', {
      data: { eventId: mine(first)[0]!.eventId, calendarEventId: 'test-cal-1' },
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(confirm.status()).toBe(200);
    expect(mine(await checkIn())).toHaveLength(0);

    // A corrected list for the same company and day arrives as an update to that PPT.
    await admin.request.post('/api/admin/students/emails', { data: { text: '26PGDM902 p902@imi.edu\n26PGDM903 p903@imi.edu' }, headers: origin });
    expect(await checkIn([await mail(`ppt-e2e-gp2-${stamp}`, ['26PGDM901', '26PGDM902', '26PGDM903'])])).toMatchObject({ added: 1 });
    await page.goto('/admin/placements');
    const update = card(page, 'pending');
    await expect(update).toContainText('Updates an earlier PPT');
    await update.getByRole('button', { name: 'Approve' }).click();
    await expect(card(page, 'approved')).toHaveCount(1);
    await expect(card(page, 'dismissed')).toHaveCount(1);
    // Only students who were not on the old list are invited.
    const next = mine(await checkIn());
    expect(next).toHaveLength(1);
    expect(next[0]!.guests).toEqual(['p902@imi.edu', 'p903@imi.edu']);
    await admin.close();
  });
  test('a listed student sees the PPT notice, a Coming up entry and calendar alarms; others see nothing', async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const origin = { Origin: 'http://localhost:3200' };
    const issued = await admin.request.post('/api/admin/homework/inbox-key', { data: { sectionList: 'pgdm2026sec-e@imi.edu', facultyDomain: 'imi.edu' }, headers: origin });
    const key = /const INBOX_KEY = "([^"]+)"/.exec((await issued.json()).script)?.[1];
    expect(key).toBeTruthy();

    const stamp = Date.now().toString(36).replace(/\d/g, (c) => 'abcdefghij'[Number(c)]!);
    const company = `Notice Works ${stamp}`;
    const title = `${company} PPT`;
    // Tomorrow in India (a PPT that has already started is not shown), at a time that gets earlier with every run, so this run's PPT is always the student's next one.
    const ist = new Date(Date.now() + 330 * 60_000 + 86_400_000);
    const today = ist.toISOString().slice(0, 10);
    const minute = 1439 - (ist.getUTCHours() * 60 + ist.getUTCMinutes());
    const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const [y, m, d] = today.split('-').map(Number);
    const dateText = `${d}${d! % 10 === 1 && d !== 11 ? 'st' : d! % 10 === 2 && d !== 12 ? 'nd' : d! % 10 === 3 && d !== 13 ? 'rd' : 'th'} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m! - 1]} ${y}`;

    const ExcelJS = (await import('exceljs')).default;
    const mail = async (id: string, rolls: string[]) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Attendees');
      ws.addRow(['Roll No', 'Name']);
      rolls.forEach((r, i) => ws.addRow([r, `Student ${i}`]));
      return {
        id,
        threadUrl: null,
        subject: `Pre-Placement Talk || ${company}`,
        receivedAt: '2026-11-18T05:39:42Z',
        body: [`${company} will be conducting its Pre-Placement Talk.`, `- Date: ${dateText}`, '- Time: 7:00 PM', '- Venue: Auditorium'].join('\n'),
        attachments: [{ name: 'attendees.xlsx', dataBase64: Buffer.from(await wb.xlsx.writeBuffer()).toString('base64') }],
      };
    };
    const checkIn = async (emails: unknown[]) => {
      const res = await request.post('/api/placements/inbox', { data: { emails }, headers: { Authorization: `Bearer ${key}` } });
      expect(res.status()).toBe(200);
    };
    const page = await admin.newPage();
    const approvePending = async () => {
      await page.goto('/admin/placements');
      const pending = page.locator('[data-testid=placement-card][data-status=pending]', { hasText: title });
      await pending.getByLabel('Starts').fill(hhmm);
      await pending.getByRole('button', { name: 'Approve' }).click();
      await expect(page.locator('[data-testid=placement-card][data-status=approved]', { hasText: title })).toHaveCount(1);
    };

    // The first list leaves 26PGDM902 out.
    await checkIn([await mail(`ppt-e2e-notice-${stamp}`, ['26PGDM901'])]);
    await approvePending();

    const student = await browser.newPage();
    await student.goto('/register');
    await signIn(student, '26PGDM902', '2468');
    await student.goto('/');
    await expect(student.getByTestId('coming-up')).toBeVisible();
    await expect(student.getByText(title)).toHaveCount(0);
    const link = await student.request.post('/api/calendar/link', { data: {}, headers: origin });
    const url = (await link.json()).links.url as string;
    expect(await (await request.get(url)).text()).not.toContain(title);

    // A corrected list adds them.
    await checkIn([await mail(`ppt-e2e-notice2-${stamp}`, ['26PGDM901', '26PGDM902'])]);
    await approvePending();
    await student.goto('/');
    const notice = student.getByTestId('ppt-notice');
    await expect(notice).toContainText(`You're on the attendee list for ${title} · `);
    await expect(notice).toContainText('Auditorium');
    await expect(student.getByTestId('coming-up')).toContainText(title);
    await expect(student.getByTestId('coming-up')).toContainText('PPT');

    const ics = await (await request.get(url)).text();
    expect(ics).toContain(`SUMMARY:${title}`);
    expect(ics).toContain('LOCATION:Auditorium');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain('ACTION:DISPLAY');

    // Echo's feed carries the approved PPT once (the replaced list is gone), with roll numbers only.
    const echoKey = (await (await admin.request.post('/api/admin/echo-key', { headers: origin, data: {} })).json()).key as string;
    const feedRes = await request.get('/api/echo/feed', { headers: { Authorization: `Bearer ${echoKey}` } });
    expect(feedRes.status()).toBe(200);
    const feedText = await feedRes.text();
    const talks = (JSON.parse(feedText).placements ?? []) as { title: string; date: string; time: string; venue: string | null; notes: string; rolls: string[] }[];
    const talk = talks.filter((t) => t.title === title);
    expect(talk).toHaveLength(1);
    expect(talk[0]).toMatchObject({ date: today, venue: 'Auditorium' });
    expect(talk[0]!.rolls).toEqual(['26PGDM901', '26PGDM902']);
    for (const t of talks) for (const r of t.rolls) expect(r).toMatch(/^\d{2}PGDM\d{3}R?$/);
    expect(Object.keys(talk[0]!).sort()).toEqual(['date', 'notes', 'rolls', 'time', 'title', 'venue']);
    expect(JSON.stringify(talks)).not.toMatch(/Student \d|Test Student|@imi\.edu/);

    // Signed out, nobody sees it.
    const visitor = await browser.newPage();
    await visitor.goto('/');
    await expect(visitor.getByText(title)).toHaveCount(0);
    await expect(visitor.getByTestId('ppt-notice')).toHaveCount(0);
    await visitor.close();
    await student.close();
    await admin.close();
  });
  test('a corrected PPT updates the calendar event in place, a withdrawn one is cancelled, and a list can be pasted', async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const origin = { Origin: 'http://localhost:3200' };
    const issued = await admin.request.post('/api/admin/homework/inbox-key', { data: { sectionList: 'pgdm2026sec-e@imi.edu', facultyDomain: 'imi.edu' }, headers: origin });
    const key = /const INBOX_KEY = "([^"]+)"/.exec((await issued.json()).script)?.[1];
    expect(key).toBeTruthy();
    const auth = { Authorization: `Bearer ${key}` };
    expect((await admin.request.post('/api/admin/students/emails', { data: { text: '26PGDM901 p901@imi.edu\n26PGDM902 p902@imi.edu' }, headers: origin })).status()).toBe(200);

    const stamp = Date.now().toString(36).replace(/\d/g, (c) => 'abcdefghij'[Number(c)]!);
    const company = `Lifecycle Labs ${stamp}`;
    const title = `${company} PPT`;
    const ExcelJS = (await import('exceljs')).default;
    async function list(rolls: string[]) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Attendees');
      ws.addRow(['Roll No', 'Name']);
      rolls.forEach((r, i) => ws.addRow([r, `Student ${i}`]));
      return Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
    }
    const mail = async (id: string, name: string, rolls: string[] | null) => ({
      id,
      threadUrl: null,
      subject: `Pre-Placement Talk || ${name}`,
      receivedAt: '2026-11-18T05:39:42Z',
      body: [`${name} will be conducting its Pre-Placement Talk.`, '- Date: 20th November 2037', '- Time: 7:00 PM', '- Venue: Auditorium'].join('\n'),
      attachments: [{ name: 'attendees.xlsx', dataBase64: rolls ? await list(rolls) : Buffer.from('not a spreadsheet').toString('base64') }],
    });
    type Invite = { eventId: string; title: string; startIso: string; endIso: string; guests: string[]; updateCalendarEventId: string | null; replacesEventId: string | null };
    type Reply = { added: number; invites: Invite[]; cancels: { eventId: string; calendarEventId: string }[] };
    const checkIn = async (emails: unknown[] = []) => {
      const res = await request.post('/api/placements/inbox', { data: { emails }, headers: auth });
      expect(res.status()).toBe(200);
      return (await res.json()) as Reply;
    };
    const confirm = (data: object) => request.post('/api/placements/invites', { data, headers: auth });
    const page = await admin.newPage();
    const card = (status: string, name = title) => page.locator(`[data-testid=placement-card][data-status=${status}]`, { hasText: name });

    // The server refuses impossible values instead of failing later.
    for (const edits of [{ time: '25:99' }, { time: '24:00' }, { date: '2026-02-31' }, { endTime: '7pm' }]) {
      const res = await admin.request.post('/api/admin/placements/no-such-card', { data: { action: 'approve', edits }, headers: origin });
      expect(res.status(), JSON.stringify(edits)).toBe(422); // the site's standard validation error, with a plain message
    }

    // First PPT: approved, invited and confirmed with a calendar id.
    await checkIn([await mail(`ppt-e2e-lc1-${stamp}`, company, ['26PGDM901'])]);
    await page.goto('/admin/placements');
    await card('pending').getByRole('button', { name: 'Approve' }).click();
    await expect(card('approved')).toHaveCount(1);
    const first = (await checkIn()).invites.filter((i) => i.title === title);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ guests: ['p901@imi.edu'], updateCalendarEventId: null });
    expect((await confirm({ eventId: first[0]!.eventId, calendarEventId: 'cal-lifecycle' })).status()).toBe(200);

    // A correction with a new time and another student: the task updates the event students already have.
    await checkIn([await mail(`ppt-e2e-lc2-${stamp}`, company, ['26PGDM901', '26PGDM902'])]);
    await page.goto('/admin/placements');
    const update = card('pending');
    await update.getByLabel('Starts').fill('18:30');
    await update.getByLabel('Ends (optional)').fill('17:00'); // before the start: the invite falls back to 90 minutes
    await update.getByRole('button', { name: 'Approve' }).click();
    await expect(card('approved')).toHaveCount(1);
    const second = (await checkIn()).invites.filter((i) => i.title === title);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      updateCalendarEventId: 'cal-lifecycle',
      replacesEventId: first[0]!.eventId,
      guests: ['p902@imi.edu'],
      startIso: '2037-11-20T13:00:00.000Z',
      endIso: '2037-11-20T14:30:00.000Z',
    });
    expect((await confirm({ eventId: second[0]!.eventId, calendarEventId: 'cal-lifecycle' })).status()).toBe(200);
    expect((await checkIn()).invites.filter((i) => i.title === title)).toHaveLength(0);
    // The replaced PPT's own row already has its event id, so a late confirm for it changes nothing.
    expect((await confirm({ eventId: first[0]!.eventId, calendarEventId: 'cal-late' })).status()).toBe(404);

    // Withdrawing asks first, then stops the PPT and hands the script a cancel task, once.
    await page.goto('/admin/placements');
    await card('approved').getByRole('button', { name: 'Withdraw' }).click();
    await expect(card('approved')).toContainText('Withdraw this PPT?');
    await card('approved').getByRole('button', { name: 'Keep it' }).click();
    await expect(card('approved')).toHaveCount(1);
    await card('approved').getByRole('button', { name: 'Withdraw' }).click();
    await card('approved').getByRole('button', { name: 'Yes, withdraw' }).click();
    await expect(card('approved')).toHaveCount(0);
    await expect(card('dismissed')).toHaveCount(2);
    expect((await checkIn()).cancels).toEqual([{ eventId: second[0]!.eventId, calendarEventId: 'cal-lifecycle' }]);
    expect((await checkIn()).cancels).toHaveLength(0); // claimed: not handed out again at once
    expect((await confirm({ eventId: second[0]!.eventId, cancelled: true })).status()).toBe(200);
    // Only an approved PPT can be withdrawn, and only a pending one dismissed.
    expect((await admin.request.post(`/api/admin/placements/${second[0]!.eventId}`, { data: { action: 'withdraw' }, headers: origin })).status()).toBe(409);
    expect((await admin.request.post(`/api/admin/placements/${second[0]!.eventId}`, { data: { action: 'dismiss' }, headers: origin })).status()).toBe(409);

    // A spreadsheet that cannot be read leaves an empty card; pasting the list fills it in.
    const pasteCompany = `Paste Partners ${stamp}`;
    const pasteTitle = `${pasteCompany} PPT`;
    await checkIn([await mail(`ppt-e2e-paste-${stamp}`, pasteCompany, null)]);
    await page.goto('/admin/placements');
    const empty = card('pending', pasteTitle);
    await expect(empty).toContainText('0 students');
    await empty.getByLabel(/Paste the attendee list/).fill('nothing useful here');
    await empty.getByRole('button', { name: 'Use this list' }).click();
    await expect(empty).toContainText('No Section E roll numbers found');
    await empty.getByLabel(/Paste the attendee list/).fill('26pgdm905, 26PGDM902\n99PGDM999 and 26PGDM905 again');
    await empty.getByRole('button', { name: 'Use this list' }).click();
    await expect(empty).toContainText('Attendee list replaced: 2 students.');
    await expect(empty).toContainText('2 students');
    await empty.getByLabel('Starts').fill('19:00');
    await empty.getByRole('button', { name: 'Approve' }).click();
    await expect(card('approved', pasteTitle)).toHaveCount(1);
    // Only students with an address are invited: 26PGDM902 has an address, 26PGDM905 does not yet.
    const pasted = (await checkIn()).invites.filter((i) => i.title === pasteTitle);
    expect(pasted).toHaveLength(1);
    expect(pasted[0]!.guests).toEqual(['p902@imi.edu']);
    expect((await confirm({ eventId: pasted[0]!.eventId, calendarEventId: 'cal-paste' })).status()).toBe(200);

    // A PPT whose students have no addresses says so, and is offered again as soon as an address is added.
    const noMailCompany = `Quiet Quarters ${stamp}`;
    const noMailTitle = `${noMailCompany} PPT`;
    await checkIn([await mail(`ppt-e2e-nomail-${stamp}`, noMailCompany, ['26PGDM905'])]);
    await page.goto('/admin/placements');
    await card('pending', noMailTitle).getByRole('button', { name: 'Approve' }).click();
    await expect(card('approved', noMailTitle)).toBeVisible();
    expect((await checkIn()).invites.filter((i) => i.title === noMailTitle)).toHaveLength(0);
    await page.goto('/admin/placements');
    await expect(card('approved', noMailTitle)).toContainText('No invites (no email addresses)');
    expect((await admin.request.post('/api/admin/students/emails', { data: { text: '26PGDM905 p905@imi.edu' }, headers: origin })).status()).toBe(200);
    const later = (await checkIn()).invites.filter((i) => i.title === noMailTitle);
    expect(later).toHaveLength(1);
    expect(later[0]!.guests).toEqual(['p905@imi.edu']);
    await admin.close();
  });

  test('revision mode: hidden until it opens, then students write, check and nail answers privately', async ({ browser }) => {
    const admin = await browser.newPage({ storageState: adminState });
    const student = await browser.newPage();
    await student.goto('/register');
    await signIn(student, '26PGDM902', '2468');
    const stamp = Date.now().toString(36);
    const visibility = admin.getByTestId('revision-visibility');

    // Hidden: students get a plain 404 and no menu link; the admin can still preview it.
    await admin.goto('/admin/revision');
    await admin.getByLabel('Hidden').check();
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(visibility).toContainText('Hidden from students.');
    // (The (main) loading screen streams the page, so the not-found page arrives with a 200 status.)
    await student.goto('/revision');
    await expect(student.getByText('This page could not be found.')).toBeVisible();
    await expect(student.getByRole('heading', { name: 'Revision' })).toHaveCount(0);
    await student.goto('/seat');
    await expect(student.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Revision' })).toHaveCount(0);

    // A date in the future keeps it hidden, and says until when.
    await admin.getByLabel('Opening date').fill('2099-12-15');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(visibility).toContainText('Hidden from students until');

    // One question through the form, two pasted (all or nothing), one edited, one deleted (asks first).
    const title = `Five forces ${stamp}`;
    const form = admin.locator('#revision-form');
    await form.getByLabel('Subject').fill('sm');
    await form.getByLabel('Time to write (minutes)').fill('12');
    await form.getByLabel('Short title').fill(title);
    await form.getByLabel('Question or case').fill('A D2C skincare brand wants to enter tier-2 cities. Advise it.');
    await form.getByLabel('Model answer').fill(`MODEL-${stamp}: entrants, buyers, then a recommendation.`);
    await form.getByLabel(/Key points/).fill('- Threat of new entrants\n- Buyer power');
    await form.getByRole('button', { name: 'Add question' }).click();
    await expect(admin.getByText('Question added.')).toBeVisible();

    const bulk = admin.getByLabel('Questions', { exact: true });
    await bulk.fill(`Question: Broken one\n---\nQuestion: Fine\nModel answer: ok`);
    await admin.getByLabel('Subject for questions without one (optional)').fill('CF');
    await admin.getByRole('button', { name: 'Add all' }).click();
    await expect(admin.getByText('Question 1: Add the model answer.')).toBeVisible();
    await bulk.fill(`Title: NPV ${stamp}\nQuestion: What is NPV?\nModel answer: PV of flows minus investment.\n---\nTitle: Drop me ${stamp}\nQuestion: q\nModel answer: a`);
    await admin.getByRole('button', { name: 'Add all' }).click();
    await expect(admin.getByText('2 questions added.')).toBeVisible();

    const item = (name: string) => admin.getByTestId('revision-admin-item').filter({ hasText: name });
    await item(`NPV ${stamp}`).getByRole('button', { name: 'Edit' }).click();
    await form.getByLabel('Short title').fill(`NPV explained ${stamp}`);
    await form.getByRole('button', { name: 'Save changes' }).click();
    await expect(admin.getByText('Question updated.')).toBeVisible();
    await expect(item(`NPV explained ${stamp}`)).toHaveCount(1);

    await item(`Drop me ${stamp}`).getByRole('button', { name: 'Delete' }).click();
    await expect(item(`Drop me ${stamp}`)).toHaveCount(1); // first click only asks
    await item(`Drop me ${stamp}`).getByRole('button', { name: 'Confirm delete' }).click();
    await expect(item(`Drop me ${stamp}`)).toHaveCount(0);

    // Students' API is closed too while it's hidden.
    expect((await student.request.post('/api/revision/whatever', { data: { draft: 'x' }, headers: { Origin: new URL(student.url()).origin } })).status()).toBe(404);

    // Open now: the menu link appears and the questions are listed.
    await admin.getByLabel('Open now').check();
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(visibility).toContainText('Students can see it now.');
    await student.goto('/revision');
    await expect(student.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Revision' })).toBeVisible();
    await expect(student.getByTestId('revision-item').filter({ hasText: title })).toContainText('Not started');
    await expect(student.getByTestId('revision-item').filter({ hasText: `NPV explained ${stamp}` })).toBeVisible();

    // Write against the clock; the draft is saved and comes back after a reload.
    await student.getByTestId('revision-item').filter({ hasText: title }).click();
    await expect(student.getByRole('heading', { level: 1, name: title })).toBeVisible();
    expect(await student.content()).not.toContain(`MODEL-${stamp}`); // the model answer stays on the server until asked for
    await expect(student.getByTestId('revision-clock')).toHaveText('12:00');
    await student.getByRole('button', { name: 'Start the clock' }).click();
    await expect(student.getByTestId('revision-clock')).not.toHaveText('12:00');
    await student.getByRole('button', { name: 'Pause' }).click();
    await student.getByTestId('revision-answer').fill(`New entrants face low barriers (draft ${stamp}).`);
    await expect(student.getByText('Saved, only you can see it')).toBeVisible();
    await student.reload();
    await expect(student.getByTestId('revision-answer')).toHaveValue(`New entrants face low barriers (draft ${stamp}).`);

    // Check: model answer and key points appear; ticks and "Nailed it" are saved.
    await student.getByRole('button', { name: 'Check against the model answer' }).click();
    await expect(student.getByText(`MODEL-${stamp}`)).toBeVisible();
    await student.getByLabel('Threat of new entrants').check();
    await expect(student.getByTestId('revision-covered')).toHaveText('(1 of 2 covered)');
    await student.getByRole('button', { name: 'Nailed it' }).click();
    await expect(student.getByRole('button', { name: /Nailed it \(undo\)/ })).toBeVisible();
    await student.reload();
    await expect(student.getByText(`MODEL-${stamp}`)).toBeVisible();
    await expect(student.getByLabel('Threat of new entrants')).toBeChecked();
    await student.goto('/revision');
    await expect(student.locator('#to-revise').locator('..').getByTestId('revision-item').filter({ hasText: title })).toHaveCount(0);
    await student.locator('summary', { hasText: 'Nailed' }).click();
    await expect(student.getByTestId('revision-item').filter({ hasText: title })).toContainText('Nailed it');

    // The admin sees only counts, never the answer; visitors without a roll number are asked to register.
    await admin.goto('/admin/revision');
    await expect(item(title)).toContainText('started by 1, nailed by 1');
    expect(await admin.content()).not.toContain(`draft ${stamp}`);
    const visitor = await browser.newPage();
    await visitor.goto('/revision');
    await expect(visitor.getByRole('link', { name: 'Register to start' })).toBeVisible();

    // Back to hidden, as it will be on the live site until 15 Dec.
    await admin.getByLabel('Open on a date').check();
    await admin.getByLabel('Opening date').fill('2099-12-15');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(visibility).toContainText('Hidden from students until');
    await Promise.all([visitor.close(), student.close(), admin.close()]);
  });
});
