/**
 * FR6/FR7 — the auto-confirm sweep.
 *
 * Server-side only, so it drives SQL rather than the client: the state under
 * test — held, with auto_confirm_at already past — is one no client API can
 * produce. Fixtures are torn down at the end; the seeded demo data is untouched.
 *
 *   node scripts/auto-confirm-test.mjs
 */
import { q1 } from './dbq.mjs'
import { DEMO, idOf, mkBooking, cleanup, balanceOf, bookingOf, earnRowsFor } from './fixtures.mjs'

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log(`\u2713 ${name}`) }
  catch (e) { failures++; console.log(`\u2717 ${name}: ${e.message}`) }
}
const eq = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, wanted ${want}`)
}
const sweep = () => q1('select public.run_auto_confirms() as n').n

cleanup()
const teacher = idOf(DEMO.maya)
const learner = idOf(DEMO.sam)

const overdue = { heldAt: "now() - interval '49 hours'", autoConfirmAt: "now() - interval '1 hour'", status: 'held' }
const tokenB = mkBooking({ teacher, learner, payment: 'token', ...overdue })
const swapB = mkBooking({ teacher, learner, payment: 'swap', mode: 'online', ...overdue })
const notDue = mkBooking({
  teacher, learner, payment: 'token', status: 'held',
  heldAt: 'now()', autoConfirmAt: "now() + interval '48 hours'",
})

const balBefore = balanceOf(teacher)
console.log(`  teacher balance before: ${balBefore}`)

const first = sweep()
console.log(`  first run_auto_confirms() moved ${first}`)

check('FR6 an overdue held booking completes on its own', () => {
  const b = bookingOf(tokenB.id)
  eq(b.status, 'completed', 'status')
  if (!b.confirmed_at) throw new Error('confirmed_at was not stamped')
})
check("FR8 it records confirmed_method = 'auto'", () =>
  eq(bookingOf(tokenB.id).confirmed_method, 'auto', 'confirmed_method'))
check('FR6 the teacher is credited exactly once', () => {
  eq(earnRowsFor(tokenB.id), 1, 'teach_earn rows')
  eq(balanceOf(teacher), balBefore + 1, 'balance')
})
check('a swap completes but credits NO token', () => {
  const b = bookingOf(swapB.id)
  eq(b.status, 'completed', 'status')
  eq(b.confirmed_method, 'auto', 'confirmed_method')
  eq(earnRowsFor(swapB.id), 0, 'teach_earn rows on a swap')
})
check('a held booking still inside its 48 hours is untouched', () =>
  eq(bookingOf(notDue.id).status, 'held', 'status'))

const balAfterFirst = balanceOf(teacher)
const second = sweep()
console.log(`  second run_auto_confirms() moved ${second}`)

check('FR7 the second run in a row moves nothing', () => eq(second, 0, 'rows moved'))
check('FR7 the balance moved exactly once across two runs', () => {
  eq(balanceOf(teacher), balAfterFirst, 'balance after the second run')
  eq(earnRowsFor(tokenB.id), 1, 'teach_earn rows after the second run')
})

check('pg_cron is scheduled', () => {
  const job = q1("select schedule, active from cron.job where jobname = 'auto-confirm-bookings'")
  if (!job) throw new Error('no cron job — the lazy sweep is now the only cover')
  eq(job.schedule, '*/15 * * * *', 'schedule')
  eq(job.active, true, 'active')
})

console.log('  cleanup:', JSON.stringify(cleanup()))
check('cleanup restored the teacher balance', () => eq(balanceOf(teacher), balBefore, 'balance'))

console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
