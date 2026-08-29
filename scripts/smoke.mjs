/** Quick end-to-end check against the live project using the publishable key. */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)

const step = async (name, fn) => {
  try {
    const r = await fn()
    console.log(`✓ ${name}`, r === undefined ? '' : JSON.stringify(r).slice(0, 260))
  } catch (e) {
    console.log(`✗ ${name}:`, e.message ?? e)
  }
}

const must = ({ data, error }) => { if (error) throw error; return data }

await step('sign in maya@blocks.demo', async () => {
  const d = must(await sb.auth.signInWithPassword({ email: 'maya@blocks.demo', password: 'blocks1234' }))
  return { id: d.user.id }
})

await step('profile', async () =>
  must(await sb.from('profiles').select('display_name, token_balance, city').eq('id', (await sb.auth.getUser()).data.user.id).single()))

await step('categories+skills', async () =>
  ({ n: must(await sb.from('skills').select('id, name, category:skill_categories(name)')).length }))

await step('slots_public embed', async () => {
  const d = must(await sb.from('slots_public').select('id, starts_at, mode, meeting_url, location_text, skill:skills(name), teacher:profiles(display_name)').eq('status','open').limit(2))
  return d
})

await step('base table masked columns rejected', async () => {
  const { error } = await sb.from('availability_slots').select('meeting_url').limit(1)
  return { errorSeen: error?.message ?? 'NONE — LEAK!' }
})

await step('perfect_swaps', async () =>
  must(await sb.rpc('perfect_swaps', { p_user: (await sb.auth.getUser()).data.user.id })))

await step('bookings visible', async () =>
  ({ n: must(await sb.from('bookings').select('id, status')).length }))

await step('messages visible', async () =>
  ({ n: must(await sb.from('messages').select('id')).length }))

await step('posts published', async () =>
  ({ n: must(await sb.from('posts').select('id').eq('status','published')).length }))

await step('map: raw coordinates are not readable', async () => {
  const { error } = await sb.from('availability_slots').select('id, lat, lng').limit(1)
  if (!error) throw new Error('lat/lng are still readable on the base table')
  return { errorSeen: error.message }
})

await step('map: slots_in_bounds returns jittered pins and city clusters', async () => {
  const box = { p_min_lat: -45, p_min_lng: 110, p_max_lat: -10, p_max_lng: 155 }
  const pins = must(await sb.rpc('slots_in_bounds', { ...box, p_zoom: 11 }))
  const again = must(await sb.rpc('slots_in_bounds', { ...box, p_zoom: 11 }))
  const cities = must(await sb.rpc('slots_in_bounds', { ...box, p_zoom: 2 }))
  const stable = pins.every((p) => again.find((q) => q.slot_id === p.slot_id)?.lat === p.lat)
  if (!stable) throw new Error('jitter is not deterministic — pins will wander between refetches')
  return { pins: pins.length, cities: cities.map((c) => `${c.label}:${c.session_count}`) }
})

await step('classify-request edge function', async () => {
  const skills = must(await sb.from('skills').select('id, name'))
  const { data, error } = await sb.functions.invoke('classify-request', {
    body: { mode: 'classify', title: 'Want to learn to fix my own bike', description: 'Gears slip constantly.', skills },
  })
  if (error) throw error
  const match = skills.find((s) => s.id === data.matchedSkillId)
  // source tells you whether Groq actually answered or the key is missing.
  return { source: data.source, matched: match?.name ?? null, reasoning: data.reasoning }
})
