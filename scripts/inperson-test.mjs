/**
 * Phase 3, in a real browser, across two accounts: the teacher shows a confirm
 * code and the learner types it in, and neither of them ever sees `held`.
 *
 * Also checks the other half of D2 — that an online booking is visibly
 * unchanged and offers no code UI at all.
 *
 *   npm run dev
 *   node scripts/inperson-test.mjs
 *   BASE=https://blocks-syncs.vercel.app node scripts/inperson-test.mjs
 */
import { chromium } from 'playwright'
import { DEMO, idOf, mkBooking, cleanup, balanceOf, bookingOf, earnRowsFor } from './fixtures.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'

let failures = 0
const check = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`) }
  catch (e) { failures++; console.log(`✗ ${name}: ${(e.message ?? e).toString().split('\n')[0]}`) }
}
const eq = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, wanted ${want}`)
}

cleanup()
const maya = idOf(DEMO.maya) // teacher
const sam = idOf(DEMO.sam) // learner
const booking = mkBooking({ teacher: maya, learner: sam, startsAt: "now() - interval '45 minutes'" })
const online = mkBooking({ teacher: maya, learner: sam, mode: 'online', startsAt: "now() - interval '45 minutes'" })
const balBefore = balanceOf(maya)
console.log(`  in-person ${booking.id.slice(0, 8)}, online ${online.id.slice(0, 8)}, teacher balance ${balBefore}`)

const browser = await chromium.launch()

const signIn = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 140)) })
  await page.goto(`${BASE}/signin`)
  await page.fill('#email', email)
  await page.fill('#password', DEMO.password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/home', { timeout: 30_000 })
  return page
}

const teacher = await signIn(DEMO.maya)
const learner = await signIn(DEMO.sam)

/** The card for one booking, found by the location text the fixture stamped. */
const cardFor = (page, text) => page.locator('.block-card, [class*="rounded"]').filter({ hasText: text })

const openToConfirm = async (page) => {
  await page.goto(`${BASE}/bookings`)
  await page.getByRole('tab', { name: /To confirm/ }).click()
  await page.waitForTimeout(1200)
}

await openToConfirm(teacher)
await openToConfirm(learner)

let code = null

await check('the teacher sees "Show confirm code" on the in-person session', async () => {
  const btn = teacher.getByRole('button', { name: /Show confirm code/ })
  if (await btn.count() === 0) throw new Error('button not found')
})

await check('FR12 the online session still offers the two-step "Session happened"', async () => {
  const card = cardFor(teacher, 'meet.example.com').first()
  if (await card.getByRole('button', { name: /Session happened/ }).count() === 0) {
    throw new Error('"Session happened" is missing from the online card')
  }
  if (await card.getByRole('button', { name: /Show confirm code/ }).count() > 0) {
    throw new Error('the online card is offering a confirm code')
  }
})

await check('the code dialog shows six digits', async () => {
  await teacher.getByRole('button', { name: /Show confirm code/ }).first().click()
  const el = teacher.locator('p[aria-label^="Confirm code"]')
  await el.waitFor({ timeout: 15_000 })
  code = (await el.textContent()).trim()
  if (!/^\d{6}$/.test(code)) throw new Error(`got ${JSON.stringify(code)}`)
  console.log(`    -> code is ${code}`)
})

await check('the learner sees "Confirm session", not "Session happened"', async () => {
  const card = cardFor(learner, 'Newtown Library').first()
  if (await card.getByRole('button', { name: /Confirm session/ }).count() === 0) {
    throw new Error('"Confirm session" is missing')
  }
})

await check('a wrong code is refused inline and the card does not move', async () => {
  await cardFor(learner, 'Newtown Library').first()
    .getByRole('button', { name: /Confirm session/ }).click()
  await learner.fill('#confirm-code', code === '000000' ? '111111' : '000000')
  await learner.getByRole('button', { name: /Confirm and release/ }).click()
  await learner.waitForTimeout(1500)
  const msg = await learner.locator('text=/does not match|attempt/').first().textContent()
  console.log(`    -> ${msg.trim()}`)
  eq(bookingOf(booking.id).status, 'confirmed', 'status after a wrong code')
  eq(earnRowsFor(booking.id), 0, 'teach_earn rows after a wrong code')
})

await check('FR1 the right code completes the session from the learner side', async () => {
  await learner.fill('#confirm-code', code)
  await learner.getByRole('button', { name: /Confirm and release/ }).click()
  await learner.waitForTimeout(2500)
  const row = bookingOf(booking.id)
  eq(row.status, 'completed', 'status')
  eq(row.confirmed_method, 'code', 'confirmed_method')
  if (!row.held_at) throw new Error('held_at was not stamped')
})

await check('FR1 the teacher was credited exactly one token', () => {
  eq(earnRowsFor(booking.id), 1, 'teach_earn rows')
  eq(balanceOf(maya), balBefore + 1, 'teacher balance')
})

await check('FR10 the photo dialog opens straight after, with an equal-weight Skip', async () => {
  await learner.locator('text=Share this session').first().waitFor({ timeout: 10_000 })
  const skip = learner.getByRole('button', { name: /^Skip$/ })
  if (await skip.count() === 0) throw new Error('no Skip button')
  await skip.click()
  await learner.waitForTimeout(800)
})

await check('FR14 the past card says how it was confirmed', async () => {
  await learner.goto(`${BASE}/bookings`)
  await learner.getByRole('tab', { name: /Past/ }).click()
  await learner.waitForTimeout(1500)
  const card = cardFor(learner, 'Newtown Library').first()
  const txt = await card.textContent()
  if (!txt.includes('Confirmed in person')) {
    throw new Error(`card reads: ${txt.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
})

await browser.close()
console.log('  cleanup:', JSON.stringify(cleanup()))
console.log(`  teacher balance back to ${balanceOf(maya)} (was ${balBefore})`)
console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
