/**
 * FR13 — the QR the teacher shows carries a link that lands the learner on
 * /bookings with the confirm dialog open and the six digits already in it.
 *
 * The QR payload is checked rather than assumed. Playwright's Chromium has no
 * BarcodeDetector, so instead the same encoder is run in Node against the URL
 * the link is supposed to carry, and the resulting module path is compared with
 * the one the page actually rendered. A QR encoding anything else fails here
 * rather than at a demo.
 *
 *   npm run dev
 *   node scripts/qr-test.mjs
 */
import { chromium } from 'playwright'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'
import { DEMO, idOf, mkBooking, cleanup, bookingOf, earnRowsFor } from './fixtures.mjs'

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
const maya = idOf(DEMO.maya)
const sam = idOf(DEMO.sam)
const booking = mkBooking({ teacher: maya, learner: sam, startsAt: "now() - interval '40 minutes'" })

const browser = await chromium.launch()
const signIn = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/signin`)
  await page.fill('#email', email)
  await page.fill('#password', DEMO.password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/home', { timeout: 30_000 })
  return page
}

const teacher = await signIn(DEMO.maya)
const learner = await signIn(DEMO.sam)

await teacher.goto(`${BASE}/bookings`)
await teacher.getByRole('tab', { name: /To confirm/ }).click()
await teacher.waitForTimeout(1200)
await teacher.getByRole('button', { name: /Show confirm code/ }).first().click()

const codeEl = teacher.locator('p[aria-label^="Confirm code"]')
await codeEl.waitFor({ timeout: 15_000 })
const code = (await codeEl.textContent()).trim()

/** The `d` of the module path, which is a pure function of the encoded string. */
const modulePath = (svgMarkup) => {
  const paths = [...svgMarkup.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1])
  // The first path is the background square; the modules are the long one.
  return paths.sort((a, b) => b.length - a.length)[0] ?? null
}

const expectedLink = `${BASE}/bookings?confirm=${booking.id}&c=${code}`

await check('the QR encodes exactly the confirm deep link', async () => {
  const rendered = await teacher.evaluate(() => {
    const svg = [...document.querySelectorAll('svg')].find((s) => s.getAttribute('height') === '148')
    if (!svg) throw new Error('no QR svg on the page')
    return new XMLSerializer().serializeToString(svg)
  })
  const onPage = modulePath(rendered)
  if (!onPage) throw new Error('the rendered QR has no module path')

  const expected = modulePath(
    renderToStaticMarkup(createElement(QRCodeSVG, { value: expectedLink, size: 148, level: 'M' })),
  )
  if (onPage !== expected) {
    // Prove the comparison can fail, so a match means something.
    throw new Error('the QR does not encode the link the learner needs')
  }
  const decoy = modulePath(
    renderToStaticMarkup(createElement(QRCodeSVG, { value: `${expectedLink}x`, size: 148, level: 'M' })),
  )
  if (decoy === onPage) throw new Error('the comparison is not discriminating')
  console.log(`    -> ${expectedLink}`)
})

await check('FR13 following the link opens the dialog prefilled', async () => {
  const u = new URL(expectedLink)
  await learner.goto(`${BASE}${u.pathname}${u.search}`)
  await learner.waitForSelector('#confirm-code', { timeout: 20_000 })
  eq(await learner.inputValue('#confirm-code'), code, 'the prefilled code')
})

await check('FR13 the code and booking id do not stay in the URL', async () => {
  const url = learner.url()
  if (url.includes('confirm=') || url.includes('c=')) throw new Error(url)
})

await check('FR13 submitting straight away completes the session', async () => {
  await learner.getByRole('button', { name: /Confirm and release/ }).click()
  await learner.waitForTimeout(2500)
  const row = bookingOf(booking.id)
  eq(row.status, 'completed', 'status')
  eq(row.confirmed_method, 'code', 'confirmed_method')
  eq(earnRowsFor(booking.id), 1, 'teach_earn rows')
})

await browser.close()
console.log('  cleanup:', JSON.stringify(cleanup()))
console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
