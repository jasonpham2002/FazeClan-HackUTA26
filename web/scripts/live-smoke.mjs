// Run against a fresh, seeded integration database schema.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : 'playwright')
const web = process.env.QA_URL || 'http://127.0.0.1:5189'
const api = process.env.QA_API_URL || 'http://127.0.0.1:3101'
const mailpit = process.env.QA_MAILPIT_URL || 'http://127.0.0.1:8025'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const staff = await browser.newContext()
const fan = await browser.newContext()
const errors = []
for (const context of [staff, fan]) context.on('weberror', error => errors.push(error.error().message))

async function signIn(context, email) {
  const page = await context.newPage()
  await page.goto(web + (email === 'staff@example.test' ? '/sign-in?role=staff' : '/sign-in'))
  await page.getByRole('textbox', { name: 'Email address' }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  const mailpitLink = page.getByRole('link', { name: 'Mailpit', exact: true })
  await mailpitLink.waitFor()
  assert.equal(await mailpitLink.getAttribute('href'), 'http://127.0.0.1:8025')
  const inbox = new URL('/view/latest.txt', mailpit)
  inbox.searchParams.set('query', 'to:' + email)
  const mail = await context.request.get(inbox.href)
  assert.ok(mail.ok(), 'Mailpit received the sign-in email')
  const url = (await mail.text()).match(/https?:\/\/[^\s<>]+/)?.[0]
  assert.ok(url, 'Mailpit email includes the sign-in link')
  assert.equal(new URL(url).origin, api)
  await page.goto(url)
  if (email === 'staff@example.test') {
    await page.waitForURL(web + '/admin')
  } else {
    // Wait for the setup redirect, not the intermediate /profile page.
    await page.waitForURL(web + '/profile/edit')
    await page.getByRole('textbox', { name: 'First name', exact: true }).fill('Integration')
    await page.getByRole('textbox', { name: 'Last name', exact: true }).fill('Fan')
    await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+12025550123')
    await page.getByRole('button', { name: 'Save profile', exact: true }).click()
    await page.waitForURL(web + '/profile')
  }
  await page.goto(web + '/')
  return page
}

try {
  const staffPage = await signIn(staff, 'staff@example.test')
  const staffMe = await staff.request.get(api + '/me')
  assert.equal((await staffMe.json()).role, 'staff')
  const { events: [event] } = await (await staff.request.get(api + '/admin/events')).json()
  await staffPage.goto(web + '/admin/events/' + event.id)
  await staffPage.getByRole('textbox', { name: 'Title', exact: true }).waitFor()
  await staffPage.goto(web + '/admin/events/' + event.id + '/interview')
  const { publishedVersion } = await (await staff.request.get(api + '/admin/events/' + event.id + '/interview')).json()
  const version = publishedVersion.version + 1
  const previousCounts = await (await staff.request.get(api + '/admin/events/' + event.id + '/analytics')).json()
  const greeting = staffPage.getByRole('textbox', { name: 'Opening greeting' })
  await greeting.fill(`Welcome to integration rehearsal ${version}!`)
  await staffPage.getByRole('button', { name: 'Save draft', exact: true }).click()
  await staffPage.getByRole('button', { name: `Publish version ${version}`, exact: true }).click()
  await staffPage.getByText(`Version ${version} published`, { exact: false }).waitFor()

  const fanPage = await signIn(fan, 'integration-' + randomUUID() + '@example.test')
  assert.equal((await fan.request.get(api + '/admin/events')).status(), 403)
  await fanPage.getByRole('link', { name: 'View event', exact: true }).click()
  await fanPage.getByRole('checkbox').check()
  await fanPage.getByRole('button', { name: 'Submit application', exact: true }).click()
  await fanPage.waitForURL(/\/applications\/[0-9a-f-]+$/)
  const applicationId = new URL(fanPage.url()).pathname.split('/').at(-1)
  await fanPage.getByText(`Interview version ${version}`, { exact: false }).waitFor()
  await fanPage.getByRole('button', { name: 'Run sample interview' }).click()
  await fanPage.getByText('Review pending', { exact: true }).waitFor()

  for (let attempt = 0; attempt < 30; attempt++) {
    const application = await (await fan.request.get(api + '/applications/' + applicationId)).json()
    if (application.latestAttempt?.processingStatus === 'ready') break
    await delay(200)
  }
  await staffPage.goto(web + '/admin/events/' + event.id + '/applications')
  await staffPage.locator('a[href="/admin/applications/' + applicationId + '"]').first().click()
  await staffPage.getByText('Note: Synthetic fixture interview.', { exact: true }).waitFor()
  await staffPage.getByRole('button', { name: /^Invite\s/ }).click()
  await staffPage.getByRole('button', { name: 'Save decision: Invite', exact: true }).click()
  await staffPage.getByText('Decision saved.', { exact: true }).waitFor()

  await fanPage.getByRole('button', { name: 'Refresh status' }).click()
  await fanPage.getByRole('button', { name: 'Accept invitation', exact: true }).click()
  await fanPage.getByText('Invitation accepted', { exact: true }).waitFor()
  await fanPage.reload()
  await fanPage.getByText('Invitation accepted', { exact: true }).waitFor()
  await fanPage.getByRole('navigation', { name: 'Fan navigation' }).getByRole('link', { name: 'My profile' }).click()
  await fanPage.getByText('Application submitted', { exact: true }).waitFor()
  await staffPage.reload()
  await staffPage.getByText('Invitation accepted', { exact: true }).first().waitFor()
  await staffPage.goto(web + '/admin')
  await staffPage.getByText('Connection rate', { exact: true }).waitFor()
  const analytics = await (await staff.request.get(api + '/admin/events/' + event.id + '/analytics')).json()
  assert.equal(analytics.callsConnected, previousCounts.callsConnected + 1)
  assert.equal(analytics.accepted, previousCounts.accepted + 1)
  assert.deepEqual(errors, [])
  console.log('PASS: separate staff and fan sessions through email magic links, publish, apply, sample interview, review, invite, accept, and persisted analytics.')
} finally {
  await browser.close()
}
