// Optional Playwright regression: run Vite on port 5189 first.
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright')
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Chicago' })
const page = await context.newPage()
const base = process.env.QA_URL || 'http://127.0.0.1:5189'
const errors = []
context.on('page', current => current.on('pageerror', error => errors.push(error.message)))
page.on('pageerror', error => errors.push(error.message))
const output = resolve(process.env.QA_OUTPUT || '.qa/screenshots')
await mkdir(output, { recursive: true })
async function noOverflow(label) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow: ${label}`) }
try {
  await page.goto(base)
  await page.getByRole('link', { name: 'View event', exact: true }).click()
  await page.getByRole('button', { name: 'Submit application', exact: true }).waitFor()
  await noOverflow('mobile event')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Submit application', exact: true }).click()
  await page.waitForURL(/\/applications\/app_/)
  const id = new URL(page.url()).pathname.split('/').at(-1)
  await page.getByRole('button', { name: 'Simulate call request', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Simulate call request', exact: true }).isDisabled(), true)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simulate call request', exact: true }).click()
  await page.getByRole('button', { name: 'Simulate missed call', exact: true }).click()
  await page.getByRole('checkbox').waitFor()
  assert.equal(await page.getByRole('checkbox').isChecked(), false)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Simulate call request', exact: true }).click()
  await page.getByRole('button', { name: 'Simulate completed interview', exact: true }).click()
  await page.getByText('Review pending', { exact: true }).waitFor()
  await noOverflow('mobile application')
  const staff = await context.newPage()
  await staff.setViewportSize({ width: 1440, height: 1000 })
  await staff.goto(`${base}/admin/applications/${id}`)
  await staff.getByText('Synthetic demo interview. No real call or AI evaluation occurred.', { exact: true }).waitFor()
  await staff.getByRole('button', { name: /^Invite\s/ }).click()
  await staff.getByRole('button', { name: 'Save decision: Invite', exact: true }).click()
  await staff.getByText('Decision saved.', { exact: true }).waitFor()
  // No reload on the fan tab: the shared-storage event refreshes its query.
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
  await page.getByText('Invitation accepted', { exact: true }).waitFor()
  await staff.getByText('Invitation accepted', { exact: true }).first().waitFor()
  await page.reload()
  await page.getByText('Invitation accepted', { exact: true }).waitFor()
  console.log('PASS: shared apply → missed/retry → synthetic Q&A → staff invite → fan accepts → staff updates, including cross-tab sync and reload')
  await staff.screenshot({ path: resolve(output, 'staff-connected.png'), fullPage: true })
  await page.screenshot({ path: resolve(output, 'fan-connected-mobile.png'), fullPage: true })
  await page.getByRole('navigation', { name: 'Fan navigation' }).getByRole('link', { name: 'My profile', exact: true }).click()
  await page.getByText('Shared fixture platform', { exact: false }).first().waitFor()
  assert.equal(await page.getByText('Attendance confirmed', { exact: true }).count(), 0)
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(`profile ${width}`) }
  await page.getByRole('link', { name: 'View application', exact: true }).click()
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(`application ${width}`) }
  await page.getByRole('link', { name: 'Events', exact: true }).click()
  for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(`events ${width}`) }
  await page.screenshot({ path: resolve(output, 'fan-connected-desktop.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: responsive fan routes, separate attendance evidence, no JavaScript errors')
} finally { await browser.close() }
