/**
 * FR11 — only the partner may publish a pending post.
 *
 * Drives the real client, because the thing under test is an RLS policy and
 * RLS is exactly what a definer connection would bypass.
 *
 *   node scripts/consent-test.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { DEMO, idOf, mkBooking, cleanup } from './fixtures.mjs'
import { q1 } from './dbq.mjs'

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
  try { await fn(); console.log(`\u2713 ${name}`) }
  catch (e) { failures++; console.log(`\u2717 ${name}: ${e.message}`) }
}

cleanup()
const maya = idOf(DEMO.maya)
const sam = idOf(DEMO.sam)
const booking = mkBooking({ teacher: maya, learner: sam, status: 'completed' })

const asMaya = await signIn(DEMO.maya)   // author
const asSam = await signIn(DEMO.sam)     // partner

const { error: insErr } = await asMaya.from('posts').insert({
  booking_id: booking.id, author_id: maya, partner_id: sam,
  skill_id: q1(`select skill_id from public.bookings where id = '${booking.id}'`).skill_id,
  caption: 'Confirmation test post.', status: 'pending_consent',
})
if (insErr) { console.log('could not create the fixture post:', insErr.message); process.exit(1) }
const postId = q1(`select id from public.posts where booking_id = '${booking.id}'`).id

const statusOf = () => q1(`select status from public.posts where id = '${postId}'`).status

await check('FR11 the author cannot publish their own pending post', async () => {
  await asMaya.from('posts').update({ status: 'published' }).eq('id', postId)
  // RLS filters the row out rather than erroring, so the assertion is on the
  // row itself — an update that matched nothing is the refusal.
  if (statusOf() !== 'pending_consent') throw new Error('the author published it')
})

await check('FR11 the partner can publish it', async () => {
  const { error } = await asSam.from('posts').update({ status: 'published' }).eq('id', postId)
  if (error) throw error
  if (statusOf() !== 'published') throw new Error(`status is ${statusOf()}`)
})

await check('FR11 the partner can decline it', async () => {
  const { error } = await asSam.from('posts').update({ status: 'declined' }).eq('id', postId)
  if (error) throw error
  if (statusOf() !== 'declined') throw new Error(`status is ${statusOf()}`)
})

console.log('  cleanup:', JSON.stringify(cleanup()))
console.log(failures ? `\n${failures} FAILED` : '\nall good')
process.exit(failures ? 1 : 0)
