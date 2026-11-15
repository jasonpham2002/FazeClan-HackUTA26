// Optional QA tool. The application itself has no npm dependency.
// Start the static server separately, then run this with Playwright installed.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { scenarios } from './fixtures.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const output = resolve(process.env.QA_OUTPUT || '.qa/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
const base = process.env.QA_URL || 'http://127.0.0.1:5187';
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
// Make this repeatable offline; use the designed system font fallback.
await context.route('https://fonts.googleapis.com/**', route => route.abort());
await context.route('https://fonts.gstatic.com/**', route => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', failure => errors.push(failure.message));
async function scenario(name) {
  const details = page.locator('.demo-controls');
  if (!await details.evaluate(item => item.open)) await details.locator('summary').click();
  await page.locator('#scenario').selectOption(name);
  await page.waitForFunction(() => !document.querySelector('#scenario')?.disabled);
}
async function noOverflow(label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `No horizontal overflow: ${label}`);
}
try {
  await page.goto(base);
  await page.getByRole('link', { name: /Apply for access/ }).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip-link').evaluate(link => link === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#app').evaluate(main => main === document.activeElement), true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(`event ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'event-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: /Apply for access/ }).click();
  await page.getByRole('button', { name: /Submit application/ }).click();
  await page.locator('#error-summary').waitFor();
  assert.equal(await page.locator('[aria-invalid=true]').count(), 4);
  await page.getByLabel('Display name', { exact: true }).fill('Demo Fan');
  await page.getByLabel('Email', { exact: true }).fill('fan@example.com');
  await page.getByLabel('FaceTime phone number', { exact: true }).fill('+1 (202) 555-0123');
  await page.locator('#field-consent').check();
  await page.locator('.demo-controls summary').click();
  await page.getByRole('button', { name: 'Simulate network error', exact: true }).click();
  await page.getByRole('button', { name: /Submit application/ }).click();
  await page.locator('#error-summary').waitFor();
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), 'Demo Fan');
  assert.equal(await page.getByLabel('FaceTime phone number', { exact: true }).inputValue(), '+1 (202) 555-0123');
  assert.equal(await page.locator('#field-consent').isChecked(), true);
  await page.getByRole('button', { name: /Submit application/ }).click();
  await page.getByRole('heading', { name: "Let's meet you." }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Simulate call request/ }).isDisabled(), true);
  await page.locator('#confirm-destination').check();
  await page.getByRole('button', { name: /Simulate call request/ }).click();
  await page.getByText('Preparing the AI host.', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Missed call', exact: true }).click();
  assert.equal(await page.locator('#confirm-destination').isChecked(), false);
  await page.locator('#confirm-destination').check();
  await page.getByRole('button', { name: /Simulate call request/ }).click();
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await page.getByRole('button', { name: /Accept invitation/ }).click();
  await page.getByRole('heading', { name: 'See you there.' }).waitFor();
  console.log('PASS: validation, draft retention after network failure, confirmation, missed-call retry, invitation acceptance');
  await page.getByRole('link', { name: 'My profile', exact: true }).click();
  await page.getByRole('heading', { name: 'Recorded activity', exact: true }).waitFor();
  await page.locator('.history-list h3').filter({ hasText: 'Invitation accepted' }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Attendance confirmed', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'My profile', exact: true }).getAttribute('aria-current'), 'page');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('heading', { name: 'No activity recorded yet.', exact: true }).waitFor();
  console.log('PASS: profile records actual demo actions; acceptance does not imply attendance; reset empties history');

  for (const name of Object.keys(scenarios)) {
    await scenario(name);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow(`${name} ${width}`);
    }
    if (['expired', 'capacity_claimed'].includes(name)) assert.equal(await page.getByRole('button', { name: /Accept invitation/ }).isDisabled(), true);
    if (['closed', 'full', 'deadline_passed'].includes(name)) assert.equal(await page.getByRole('button', { name: 'Applications unavailable' }).isDisabled(), true);
    if (name === 'processing_failed') await page.getByText(/processing needs staff attention/).first().waitFor();
  }
  console.log(`PASS: ${Object.keys(scenarios).length} scenarios at 320, 390, 768 and 1440 pixels`);
  await scenario('returning_fan');
  await page.getByRole('heading', { name: 'Attendance confirmed', exact: true }).waitFor();
  assert.ok(await page.getByText('Demo record', { exact: true }).count() >= 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'profile-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: resolve(output, 'profile-desktop.png'), fullPage: true });
  await scenario('ready');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'readiness-mobile.png'), fullPage: true });
  await scenario('fresh');
  // Keyboard validation: error links move focus to their matching input.
  await page.locator('#field-name').fill('');
  await page.getByRole('button', { name: /Submit application/ }).click();
  await page.locator('[data-focus="field-name"]').click();
  assert.equal(await page.locator('#field-name').evaluate(input => input === document.activeElement), true);

  // Live adapter/UI contract using intercepted local responses, not a real backend.
  const live = await context.newPage();
  live.on('pageerror', failure => errors.push(failure.message));
  let sessionExpired = false;
  await live.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: "window.FAZE_CONFIG={mode:'live',apiBase:'/api',eventId:'community-night-demo',signInUrl:'/sign-in'};" }));
  await live.route('**/api/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/me' && sessionExpired) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED', message: 'Sign in required.' } } });
    if (pathname === '/api/me') return route.fulfill({ json: scenarios.fresh.user });
    if (route.request().method() === 'POST') return route.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Wait before retrying.' } } });
    return route.fulfill({ json: scenarios.fresh.event });
  });
  await live.goto(`${base}/#application`);
  await live.locator('#field-consent').check();
  await live.getByRole('button', { name: /Submit application/ }).click();
  await live.locator('#error-summary').filter({ hasText: 'Too many requests' }).waitFor();
  assert.equal(await live.locator('#field-consent').isChecked(), true);
  assert.equal(await live.locator('.demo-controls').count(), 0);
  sessionExpired = true;
  await live.getByRole('button', { name: /Submit application/ }).click();
  await live.getByRole('heading', { name: 'Sign in to continue' }).waitFor();
  await live.getByRole('link', { name: /Sign in ↗/ }).waitFor();
  console.log('PASS: mocked live 429 and expired session; live never shows simulation controls');

  const restored = await context.newPage();
  restored.on('pageerror', failure => errors.push(failure.message));
  let activityAttempts = 0;
  const remoteApplication = { ...scenarios.review.application, id: 'app_remote', eventName: 'Remote community event' };
  await restored.route('**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: "window.FAZE_CONFIG={mode:'live',apiBase:'/api',eventId:'community-night-demo',signInUrl:'/sign-in',features:{applicationHistory:true,activityHistory:true}};" }));
  await restored.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/me') return route.fulfill({ json: scenarios.fresh.user });
    if (url.pathname.startsWith('/api/events/')) return route.fulfill({ json: scenarios.fresh.event });
    if (url.pathname.startsWith('/api/applications/')) return route.fulfill({ json: remoteApplication });
    if (url.pathname === '/api/me/applications') return route.fulfill({ json: {
      items: url.searchParams.has('cursor') ? [remoteApplication, { id: 'app_older', eventId: 'past', eventName: 'Older community night', status: 'accepted' }] : [remoteApplication],
      nextCursor: url.searchParams.has('eventId') || url.searchParams.has('cursor') ? null : 'page-2',
    } });
    if (url.pathname === '/api/me/activity') {
      activityAttempts++;
      if (activityAttempts === 1) return route.fulfill({ status: 503, json: { error: { message: 'Activity temporarily unavailable.' } } });
      return route.fulfill({ json: { items: [], nextCursor: null } });
    }
    return route.fulfill({ status: 404, json: { error: { message: 'Not found' } } });
  });
  await restored.goto(`${base}/#application`);
  await restored.getByRole('heading', { name: "You're in the queue." }).waitFor();
  await restored.getByRole('link', { name: 'My profile', exact: true }).click();
  await restored.getByText('Activity temporarily unavailable.').waitFor();
  await restored.getByRole('button', { name: 'Load more', exact: true }).click();
  await restored.getByRole('heading', { name: 'Older community night', exact: true }).waitFor();
  assert.equal(await restored.locator('.history-item').count(), 2);
  await restored.getByRole('button', { name: 'Try again', exact: true }).click();
  await restored.getByRole('heading', { name: 'No activity recorded yet.', exact: true }).waitFor();
  console.log('PASS: new-tab restoration, deduplicated paginated history, independent activity failure and retry');
  assert.deepEqual(errors, []);
  console.log('PASS: no browser JavaScript errors');
} finally { await browser.close(); }
