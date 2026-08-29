/**
 * Playwright walk-through of the new-user setup journey:
 * signup → Home setup card → skills → availability → card gone,
 * plus the header account menu and the ?tab= deep links.
 *
 *   node scripts/journey-test.mjs            # against http://localhost:5173
 *   BASE=https://blocks-syncs.vercel.app node scripts/journey-test.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const email = `journey+${Date.now()}@blocks.demo`
const PASSWORD = 'blocks1234'

let failures = 0
const check = async (name, fn) => {
  try {
    await fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    failures++
    console.log(`✗ ${name}: ${(e.message ?? e).toString().split('\n')[0]}`)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 160)) })

// ─── sign up a brand new account ────────────────────────────────────────────
await check('sign up lands in the app', async () => {
  await page.goto(`${BASE}/signup`)
  await page.fill('#name', 'Journey Tester')
  await page.fill('#email', email)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/home', { timeout: 30_000 })
})

const setupCard = page.locator('text=/Finish setting up/')

await check('Home shows the setup card at 0 of 3', async () => {
  await setupCard.waitFor({ timeout: 15_000 })
  const t = await setupCard.innerText()
  if (!t.includes('0 of 3')) throw new Error(`expected "0 of 3", saw "${t}"`)
})

await check('primary CTA is the teach step and deep-links to the skills tab', async () => {
  await page.getByRole('button', { name: /Add a teach skill/ }).click()
  await page.waitForURL('**/profile?tab=skills', { timeout: 10_000 })
  await page.locator('text=What you can teach').waitFor()
})

// ─── fill both lists ────────────────────────────────────────────────────────
const addSkill = async (kind) => {
  const select = page.locator(`#add-${kind}`)
  await select.waitFor()
  const value = await select.locator('option:not([value=""])').first().getAttribute('value')
  await select.selectOption(value)
  await page.locator(`#add-${kind}`).locator('xpath=ancestor::div[contains(@class,"block-card")][1]')
    .getByRole('button', { name: 'Add' }).click()
  await page.locator('text=Added.').first().waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1200) // let the toast clear before the next add
}

await check('add a teach skill', () => addSkill('teach'))
await check('add a learn skill', () => addSkill('learn'))

await check('Home now reports 2 of 3 and points at availability', async () => {
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.waitForURL('**/home')
  await setupCard.waitFor({ timeout: 15_000 })
  const t = await setupCard.innerText()
  if (!t.includes('2 of 3')) throw new Error(`expected "2 of 3", saw "${t}"`)
  await page.getByRole('button', { name: /Publish an hour/ }).click()
  await page.waitForURL('**/profile?tab=slots', { timeout: 10_000 })
})

await check('the availability tab is the one actually shown on a deep link', async () => {
  await page.locator('text=Publish an hour').first().waitFor()
  const active = await page.locator('[role=tab][data-state=active]').innerText()
  if (active.trim() !== 'Availability') throw new Error(`active tab was "${active}"`)
})

// ─── publish an hour ────────────────────────────────────────────────────────
await check('publish a slot', async () => {
  const value = await page.locator('#slot-skill option:not([value=""])').first().getAttribute('value')
  await page.selectOption('#slot-skill', value)
  const d = new Date(Date.now() + 3 * 864e5)
  await page.fill('#slot-date', d.toISOString().slice(0, 10))
  await page.fill('#slot-time', '18:00')
  await page.fill('#slot-url', 'https://meet.google.com/journey-test')
  await page.getByRole('button', { name: /Publish slot/ }).click()
  await page.locator('text=/Slot published/').waitFor({ timeout: 15_000 })
})

await check('setup card disappears once all three are done', async () => {
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.waitForURL('**/home')
  await page.locator('h2', { hasText: 'Perfect swaps for you' }).waitFor({ timeout: 15_000 })
  await page.waitForTimeout(1500)
  if (await setupCard.count()) throw new Error('setup card still rendered')
})

// ─── header account menu ────────────────────────────────────────────────────
await check('account chip opens a menu', async () => {
  const trigger = page.getByRole('button', { name: 'Your account' })
  await trigger.click()
  await page.getByRole('menu').waitFor({ timeout: 5000 })
  for (const item of ['Skills you teach & learn', 'Your availability', 'About you', 'Sign out']) {
    if (!(await page.getByRole('menuitem', { name: item }).count())) throw new Error(`missing item: ${item}`)
  }
})

await check('menu → Your availability lands on the slots tab', async () => {
  await page.getByRole('menuitem', { name: 'Your availability' }).click()
  await page.waitForURL('**/profile?tab=slots', { timeout: 10_000 })
  const active = await page.locator('[role=tab][data-state=active]').innerText()
  if (active.trim() !== 'Availability') throw new Error(`active tab was "${active}"`)
})

await check('switching tabs by hand rewrites the URL', async () => {
  await page.getByRole('tab', { name: 'About you' }).click()
  await page.waitForURL('**/profile?tab=about', { timeout: 10_000 })
})

await check('a bad ?tab= value falls back to Skills', async () => {
  await page.goto(`${BASE}/profile?tab=nonsense`)
  await page.locator('[role=tab][data-state=active]').waitFor()
  const active = await page.locator('[role=tab][data-state=active]').innerText()
  if (active.trim() !== 'Skills') throw new Error(`active tab was "${active}"`)
})

// ─── mobile drawer ──────────────────────────────────────────────────────────
await check('mobile drawer exposes skills and availability separately', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/home`)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('link', { name: 'Your availability' }).click()
  await page.waitForURL('**/profile?tab=slots', { timeout: 10_000 })
})

await browser.close()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
