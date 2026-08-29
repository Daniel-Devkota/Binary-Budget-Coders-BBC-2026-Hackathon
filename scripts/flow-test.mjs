/**
 * Exercises the token path end to end: book → force complete → ledger.
 *
 * This run costs Sam a net token every time — he spends one on the booking and
 * the teacher is the one who earns it back. Three runs from a standing start and
 * he hits zero, after which this fails with "insufficient tokens" and, more to
 * the point, he cannot book anything in the demo either. So the script tops him
 * up first, loudly, rather than leaving a trap for whoever runs it next.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { q1 } from './dbq.mjs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
const must = ({ data, error }) => { if (error) throw error; return data }

const learner = mk()
must(await learner.auth.signInWithPassword({ email: 'sam@blocks.demo', password: 'blocks1234' }))
const me = (await learner.auth.getUser()).data.user.id

// The ledger is the source of truth and a trigger keeps token_balance in step,
// so a top-up is an insert, never an update to the balance.
const start = must(await learner.from('profiles').select('token_balance').eq('id', me).single())
if (start.token_balance < 2) {
  const need = 2 - start.token_balance
  q1(`insert into public.token_ledger (user_id, delta, reason)
      select '${me}', 1, 'weekly_grant' from generate_series(1, ${need}); select 1 as ok`)
  console.log(`topped the learner up by ${need} (was ${start.token_balance}) so this run can book`)
}

const before = must(await learner.from('profiles').select('token_balance').eq('id', me).single())
console.log('learner balance before:', before.token_balance)

const slot = must(await learner.from('slots_public')
  .select('id, teacher_id, meeting_url, skill:skills(name)')
  .eq('status', 'open').neq('teacher_id', me)
  .gte('starts_at', new Date().toISOString()).limit(1).single())
console.log('booking:', slot.skill.name, '— meeting_url visible before booking?', slot.meeting_url)

const bookingId = must(await learner.rpc('book_slot_with_token', { p_slot_id: slot.id }))
const afterBook = must(await learner.from('profiles').select('token_balance').eq('id', me).single())
console.log('booked. learner balance:', afterBook.token_balance, '(expected', before.token_balance - 1, ')')

const revealed = must(await learner.from('slots_public').select('meeting_url, location_text').eq('id', slot.id).single())
console.log('meeting details after confirming:', revealed.meeting_url ?? revealed.location_text)

const teacher = mk()
const { data: teacherRow } = await learner.from('profiles').select('id').eq('id', slot.teacher_id).single()
must(await learner.rpc('force_complete_booking', { p_booking_id: bookingId }))
const ledger = must(await learner.from('token_ledger').select('delta, reason').order('created_at', { ascending: false }).limit(3))
console.log('learner ledger:', ledger)

const finalBal = must(await learner.from('profiles').select('token_balance').eq('id', me).single())
console.log('learner final balance:', finalBal.token_balance)

// Cancel path on a fresh booking, to confirm the refund.
const slot2 = must(await learner.from('slots_public').select('id').eq('status', 'open').neq('teacher_id', me)
  .gte('starts_at', new Date().toISOString()).limit(1).single())
const b2 = must(await learner.rpc('book_slot_with_token', { p_slot_id: slot2.id }))
must(await learner.rpc('cancel_booking', { p_booking_id: b2 }))
const afterCancel = must(await learner.from('profiles').select('token_balance').eq('id', me).single())
console.log('after book+cancel balance:', afterCancel.token_balance, '(should equal', finalBal.token_balance, ')')
void teacher; void teacherRow
