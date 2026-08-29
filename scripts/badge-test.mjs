/**
 * FR9 — the Sessions badge appears for the learner when something is waiting on
 * them, and clears on a visit to /bookings.
 *
 *   npm run dev
 *   node scripts/badge-test.mjs
 */
import { chromium } from 'playwright'
import { DEMO, idOf, mkBooking, cleanup } from './fixtures.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5173'

let failures = 0
const check = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`) }
  catch (e) { failures++; console.log(`✗ ${name}: ${(e.message ?? e).toString().split('\n')[0]}`) }
}

cleanup()
const maya = idOf(DEMO.maya)
const sam = idOf(DEMO.sam)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
const page = await ctx.newPage()

await page.goto(`${BASE}/signin`)
await page.fill('#email', DEMO.sam)
await page.fill('#password', DEMO.password)
await page.click('button[type=submit]')
await page.waitForURL('**/home', { timeout: 30_000 })

/** The count rendered on the Sessions nav item, or 0. */
const badge = async () => {
  const el = page.locator('a[href="/bookings"] span').last()
  if (await el.count() === 0) return 0
  const t = (await el.textContent() ?? '').trim()
  return /^\d+\+?$/.test(t) ? parseInt(t, 10) : 0
}

// Clear whatever the seeded data leaves behind, so the assertions are about
// the fixtures below and nothing else.
await page.goto(`${BASE}/bookings`)
await page.waitForTimeout(2000)
await check('the badge starts clear after a visit to /bookings', async () => {
  await page.goto(`${BASE}/home`)
  await page.waitForTimeout(1500)
  const n = await badge()
  if (n !== 0) throw new Error(`badge reads ${n}`)
})

// One held session and one that has happened but is unconfirmed. Both halves
// are counted against the seen marker, so both have to become true *after* the
// visit above — hence a slot that starts a few seconds from now and a wait for
// it to pass, rather than one backdated an hour.
mkBooking({
  teacher: maya, learner: sam, mode: 'online', status: 'held',
  startsAt: "now() - interval '3 hours'", heldAt: 'now()',
  autoConfirmAt: "now() + interval '48 hours'",
})
mkBooking({ teacher: maya, learner: sam, startsAt: "now() + interval '5 seconds'" })
await page.waitForTimeout(8000)

await check('FR9 the badge counts both waiting sessions', async () => {
  await page.goto(`${BASE}/home`)
  await page.waitForTimeout(2000)
  const n = await badge()
  if (n !== 2) throw new Error(`badge reads ${n}, wanted 2`)
})

await check('FR9 visiting /bookings clears it', async () => {
  await page.goto(`${BASE}/bookings`)
  await page.waitForTimeout(2000)
  await page.goto(`${BASE}/home`)
  await page.waitForTimeout(2000)
  const n = await badge()
  if (n !== 0) throw new Error(`badge still reads ${n}`)
})

await browser.close()
console.log('  cleanup:', JSON.stringify(cleanup()))
console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
