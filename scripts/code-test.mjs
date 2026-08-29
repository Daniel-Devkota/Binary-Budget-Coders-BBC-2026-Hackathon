/**
 * FR1-FR5, FR8, FR12 — confirm codes, and above all the five ways they must
 * say no. Refusing correctly is the whole feature, so every refusal is asserted
 * to raise, and the happy path is one case out of thirteen here.
 *
 * Driven through the real client, because auth.uid() is what every one of these
 * checks turns on.
 *
 *   node scripts/code-test.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { q1 } from './dbq.mjs'
import { DEMO, idOf, mkBooking, cleanup, balanceOf, bookingOf, earnRowsFor } from './fixtures.mjs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const signIn = async (email) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const { error } = await c.auth.signInWithPassword({ email, password: DEMO.password })
  if (error) throw error
  return c
}

let failures = 0
const check = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`) }
  catch (e) { failures++; console.log(`✗ ${name}: ${e.message}`) }
}
const eq = (got, want, what) => {
  if (String(got) !== String(want)) throw new Error(`${what}: got ${got}, wanted ${want}`)
}

/** Asserts the RPC raised, and returns the message. A silent no-op is a failure. */
const mustRaise = async (label, p) => {
  const { error } = await p
  if (!error) throw new Error(`${label} was allowed — it must raise`)
  return error.message
}
const mustPass = async (p) => {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data
}

/** null when there is no code row at all, otherwise the failed-attempt count. */
const attemptsOf = (id) => {
  const r = q1(`select confirm_guard.attempts('${id}') as n
                  from public.session_codes where booking_id = '${id}'`)
  return r ? r.n : null
}

cleanup()
const maya = idOf(DEMO.maya) // teacher
const sam = idOf(DEMO.sam) // learner
const asTeacher = await signIn(DEMO.maya)
const asLearner = await signIn(DEMO.sam)

const reveal = (c, id) => c.rpc('reveal_session_code', { p_booking_id: id })
const confirm = (c, id, code) => c.rpc('confirm_session_with_code', { p_booking_id: id, p_code: code })

// ─── FR3: too early ─────────────────────────────────────────────────────────
const future = mkBooking({ teacher: maya, learner: sam, startsAt: "now() + interval '3 hours'" })
await check('FR3 the teacher cannot reveal more than 15 minutes early', async () => {
  console.log(`    -> ${await mustRaise('an early reveal', reveal(asTeacher, future.id))}`)
})
await check('FR3 the early refusal wrote no row', () => eq(attemptsOf(future.id), null, 'session_codes row'))

const soon = mkBooking({ teacher: maya, learner: sam, startsAt: "now() + interval '10 minutes'" })
await check('FR3 inside the 15-minute window the teacher can reveal', async () => {
  const c = await mustPass(reveal(asTeacher, soon.id))
  if (!/^\d{6}$/.test(c)) throw new Error(`got ${JSON.stringify(c)}`)
})

// ─── the booking everything else runs against ───────────────────────────────
const b = mkBooking({ teacher: maya, learner: sam, startsAt: "now() - interval '90 minutes'" })

await check('FR2 the learner cannot reveal the code', async () => {
  console.log(`    -> ${await mustRaise('a learner reveal', reveal(asLearner, b.id))}`)
})

const code = await mustPass(reveal(asTeacher, b.id))
await check('the teacher gets a 6-digit code', () => {
  if (!/^\d{6}$/.test(code)) throw new Error(`got ${JSON.stringify(code)}`)
})
await check('revealing twice returns the same code', async () =>
  eq(await mustPass(reveal(asTeacher, b.id)), code, 'second reveal'))

await check('FR2 neither party can read session_codes directly', async () => {
  for (const [who, c] of [['learner', asLearner], ['teacher', asTeacher]]) {
    const { data, error } = await c.from('session_codes').select('*').eq('booking_id', b.id)
    if (!error && (data?.length ?? 0) > 0) throw new Error(`the ${who} read ${data.length} row(s)`)
  }
})

// ─── FR12: online is not part of this ───────────────────────────────────────
const online = mkBooking({ teacher: maya, learner: sam, mode: 'online', startsAt: "now() - interval '90 minutes'" })
await check('FR12 an online session has no code path', async () => {
  console.log(`    -> ${await mustRaise('revealing on an online booking', reveal(asTeacher, online.id))}`)
})

// ─── wrong caller and wrong status on confirm ───────────────────────────────
await check('FR2 the teacher cannot confirm with the code themselves', async () => {
  console.log(`    -> ${await mustRaise('a teacher confirm', confirm(asTeacher, b.id, code))}`)
})

const done = mkBooking({ teacher: maya, learner: sam, status: 'completed', startsAt: "now() - interval '2 hours'" })
await check('wrong status: a completed booking cannot be confirmed again', async () => {
  console.log(`    -> ${await mustRaise('confirming a completed booking', confirm(asLearner, done.id, '000000'))}`)
})

// ─── FR4: a wrong code fails without side effects ───────────────────────────
const balBefore = balanceOf(maya)
const wrong = code === '000000' ? '111111' : '000000'
await check('FR4 a wrong code raises', async () => {
  console.log(`    -> ${await mustRaise('a wrong code', confirm(asLearner, b.id, wrong))}`)
})
await check('FR4 the booking is untouched and no token moved', () => {
  eq(bookingOf(b.id).status, 'confirmed', 'status')
  eq(earnRowsFor(b.id), 0, 'teach_earn rows')
  eq(balanceOf(maya), balBefore, 'teacher balance')
})
await check('FR4 the attempt counter incremented', () => eq(attemptsOf(b.id), 1, 'attempts'))

// ─── FR5: locked out after five ─────────────────────────────────────────────
for (let i = 0; i < 4; i++) await confirm(asLearner, b.id, wrong)
await check('FR5 five wrong codes are recorded', () => eq(attemptsOf(b.id), 5, 'attempts'))
await check('FR5 the RIGHT code is refused once locked out', async () => {
  console.log(`    -> ${await mustRaise('a locked-out confirm', confirm(asLearner, b.id, code))}`)
  eq(bookingOf(b.id).status, 'confirmed', 'status')
})

// ─── FR1/FR8: the happy path, on a fresh booking ────────────────────────────
const good = mkBooking({ teacher: maya, learner: sam, startsAt: "now() - interval '90 minutes'" })
const goodCode = await mustPass(reveal(asTeacher, good.id))
const balBeforeGood = balanceOf(maya)
await check('FR1 the right code completes the session in one call', async () => {
  await mustPass(confirm(asLearner, good.id, goodCode))
  const row = bookingOf(good.id)
  eq(row.status, 'completed', 'status')
  if (!row.held_at) throw new Error('held_at was not stamped')
  if (!row.confirmed_at) throw new Error('confirmed_at was not stamped')
})
await check("FR8 it records confirmed_method = 'code'", () =>
  eq(bookingOf(good.id).confirmed_method, 'code', 'confirmed_method'))
await check('FR1 the teacher is credited exactly one token', () => {
  eq(earnRowsFor(good.id), 1, 'teach_earn rows')
  eq(balanceOf(maya), balBeforeGood + 1, 'balance')
})
await check('the code row is consumed on success', () => eq(attemptsOf(good.id), null, 'session_codes row'))
await check('the same code cannot be replayed', async () => {
  await mustRaise('a replayed code', confirm(asLearner, good.id, goodCode))
})

// ─── the swap case flow-test.mjs cannot catch ───────────────────────────────
const swap = mkBooking({ teacher: maya, learner: sam, payment: 'swap', startsAt: "now() - interval '90 minutes'" })
const swapCode = await mustPass(reveal(asTeacher, swap.id))
const balBeforeSwap = balanceOf(maya)
await check('a swap confirmed by code credits NO token', async () => {
  await mustPass(confirm(asLearner, swap.id, swapCode))
  eq(bookingOf(swap.id).status, 'completed', 'status')
  eq(bookingOf(swap.id).confirmed_method, 'code', 'confirmed_method')
  eq(earnRowsFor(swap.id), 0, 'teach_earn rows on a swap')
  eq(balanceOf(maya), balBeforeSwap, 'teacher balance')
})

console.log('  cleanup:', JSON.stringify(cleanup()))
console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
