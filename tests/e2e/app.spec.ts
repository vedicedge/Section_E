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

async function register(page: Page, roll: string, pin: string) {
  await page.goto('/register');
  await page.getByLabel('College roll number').fill(roll);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Is this you?')).toBeVisible();
  await page.getByLabel('Choose a 4-digit PIN').fill(pin);
  await page.getByLabel('Repeat the PIN').fill(pin);
  await page.getByRole('button', { name: /register/i }).click();
  await expect(page).toHaveURL(/\/seat/);
}

test.describe.serial('Section E', () => {
  test('landing page shows the three features', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Outside the building');
    const nav = page.getByRole('navigation', { name: 'Features' });
    await expect(nav.getByRole('link', { name: /Seating/ })).toHaveAttribute('href', '/seat');
    await expect(nav.getByRole('link', { name: /Live Timetable/ })).toHaveAttribute('href', '/timetable');
    await expect(nav.getByRole('link', { name: /Mock/ })).toHaveAttribute('href', '/tests');
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
  });

  test('timetable syncs from the linked workbook', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/timetable');
    await page.getByLabel('Share link').fill('http://localhost:3299/timetable.xlsx');
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
});
