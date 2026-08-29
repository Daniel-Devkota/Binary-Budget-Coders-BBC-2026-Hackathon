import { supabase } from './supabase'
import type {
  BookingWithContext, PerfectSwap, Profile, SkillWithCategory,
  SlotWithContext, SwapProposalWithContext, UserSkillWithSkill,
} from '@/types/models'

/**
 * availability_slots has SELECT revoked on meeting_url and location_text, so a
 * bare `*` is a permission error. Anything reading the base table lists columns.
 */
export const SLOT_COLS =
  'id,teacher_id,skill_id,starts_at,ends_at,mode,lat,lng,status,created_at'

const SKILL_SELECT = 'skill:skills(*, category:skill_categories(*))'

export const SLOT_SELECT = `*, ${SKILL_SELECT}, teacher:profiles(*)`

export const BOOKING_SELECT = `
  *,
  ${SKILL_SELECT},
  teacher:profiles!bookings_teacher_id_fkey(*),
  learner:profiles!bookings_learner_id_fkey(*),
  slot:availability_slots(${SLOT_COLS})
`

export const PROPOSAL_SELECT = `
  *,
  proposer:profiles!swap_proposals_proposer_id_fkey(*),
  responder:profiles!swap_proposals_responder_id_fkey(*),
  responder_slot:availability_slots!swap_proposals_responder_slot_id_fkey(${SLOT_COLS}, skill:skills(*)),
  proposer_slot:availability_slots!swap_proposals_proposer_slot_id_fkey(${SLOT_COLS}, skill:skills(*))
`

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error
  return data as T
}

// ─── catalog ────────────────────────────────────────────────────────────────
export async function fetchCategories() {
  return unwrap(await supabase.from('skill_categories').select('*').order('sort'))
}

export async function fetchSkills() {
  return unwrap(
    await supabase
      .from('skills')
      .select('*, category:skill_categories(*)')
      .eq('status', 'approved')
      .order('name'),
  ) as SkillWithCategory[]
}

export async function fetchSkillBySlug(slug: string) {
  return unwrap(
    await supabase.from('skills').select('*, category:skill_categories(*)').eq('slug', slug).maybeSingle(),
  ) as SkillWithCategory | null
}

// ─── slots ──────────────────────────────────────────────────────────────────
export async function fetchOpenSlots(opts: {
  skillId?: string
  /** Any-of filter, for matching a whole list of skills at once. */
  skillIds?: string[]
  categoryId?: string
  teacherId?: string
  /** Drop a teacher's own hours — you cannot book yourself. */
  excludeTeacherId?: string
  mode?: 'online' | 'in_person'
  from?: string
  to?: string
  limit?: number
} = {}) {
  if (opts.skillIds?.length === 0) return []

  let qb = supabase
    .from('slots_public')
    .select(SLOT_SELECT)
    .eq('status', 'open')
    .gte('starts_at', opts.from ?? new Date().toISOString())
    .order('starts_at')
    .limit(opts.limit ?? 60)

  if (opts.skillId) qb = qb.eq('skill_id', opts.skillId)
  if (opts.skillIds?.length) qb = qb.in('skill_id', opts.skillIds)
  if (opts.teacherId) qb = qb.eq('teacher_id', opts.teacherId)
  if (opts.excludeTeacherId) qb = qb.neq('teacher_id', opts.excludeTeacherId)
  if (opts.mode) qb = qb.eq('mode', opts.mode)
  if (opts.to) qb = qb.lte('starts_at', opts.to)

  const rows = unwrap(await qb) as unknown as SlotWithContext[]
  return opts.categoryId
    ? rows.filter((r) => r.skill?.category_id === opts.categoryId)
    : rows
}

export async function fetchSlot(id: string) {
  return unwrap(
    await supabase.from('slots_public').select(SLOT_SELECT).eq('id', id).maybeSingle(),
  ) as unknown as SlotWithContext | null
}

export async function fetchMySlots(userId: string) {
  return unwrap(
    await supabase
      .from('slots_public')
      .select(SLOT_SELECT)
      .eq('teacher_id', userId)
      .neq('status', 'cancelled')
      .order('starts_at'),
  ) as unknown as SlotWithContext[]
}

export async function createSlot(input: {
  teacher_id: string
  skill_id: string
  starts_at: string
  ends_at: string
  mode: 'online' | 'in_person'
  meeting_url?: string | null
  location_text?: string | null
  lat?: number | null
  lng?: number | null
}) {
  const { error } = await supabase.from('availability_slots').insert(input)
  if (error) throw error
}

export async function deleteSlot(id: string) {
  const { error } = await supabase.from('availability_slots').delete().eq('id', id)
  if (error) throw error
}

// ─── people and skills ──────────────────────────────────────────────────────
export async function fetchProfile(id: string) {
  return unwrap(await supabase.from('profiles').select('*').eq('id', id).maybeSingle()) as Profile | null
}

export async function fetchUserSkills(userId: string) {
  return unwrap(
    await supabase
      .from('user_skills')
      .select(`*, ${SKILL_SELECT}`)
      .eq('user_id', userId)
      .order('created_at'),
  ) as unknown as UserSkillWithSkill[]
}

export async function addUserSkill(input: {
  user_id: string
  skill_id: string
  kind: 'teach' | 'learn'
  proficiency?: string | null
  blurb?: string | null
}) {
  const { error } = await supabase.from('user_skills').insert(input)
  if (error) throw error
}

export async function removeUserSkill(id: string) {
  const { error } = await supabase.from('user_skills').delete().eq('id', id)
  if (error) throw error
}

/** Teachers of a skill, with how many open slots each currently has. */
export async function fetchTeachersOfSkill(skillId: string) {
  const rows = unwrap(
    await supabase
      .from('user_skills')
      .select('*, teacher:profiles(*)')
      .eq('skill_id', skillId)
      .eq('kind', 'teach'),
  ) as unknown as (UserSkillWithSkill & { teacher: Profile })[]
  return rows
}

// ─── perfect swaps ──────────────────────────────────────────────────────────
export async function fetchPerfectSwaps(userId: string): Promise<PerfectSwap[]> {
  const rows = unwrap(await supabase.rpc('perfect_swaps', { p_user: userId }))
  if (!rows?.length) return []

  const partnerIds = [...new Set(rows.map((r) => r.partner_id))]
  const skillIds = [...new Set(rows.flatMap((r) => [r.they_teach_id, r.they_want_id]))]

  const [profiles, skills] = await Promise.all([
    supabase.from('profiles').select('*').in('id', partnerIds),
    supabase.from('skills').select('*, category:skill_categories(*)').in('id', skillIds),
  ])
  const pById = new Map((profiles.data ?? []).map((p) => [p.id, p]))
  const sById = new Map(((skills.data ?? []) as unknown as SkillWithCategory[]).map((s) => [s.id, s]))

  // One card per partner: the first pairing is enough to open the conversation.
  const seen = new Set<string>()
  const out: PerfectSwap[] = []
  for (const r of rows) {
    if (seen.has(r.partner_id)) continue
    const partner = pById.get(r.partner_id)
    const theyTeach = sById.get(r.they_teach_id)
    const theyWant = sById.get(r.they_want_id)
    if (!partner || !theyTeach || !theyWant) continue
    seen.add(r.partner_id)
    out.push({ partner, theyTeach, theyWant })
  }
  return out
}

// ─── bookings ───────────────────────────────────────────────────────────────
export async function fetchMyBookings(userId: string) {
  const rows = unwrap(
    await supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .or(`teacher_id.eq.${userId},learner_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
  ) as unknown as BookingWithContext[]

  // The join above reads the base table, which cannot return the private
  // columns. Confirmed participants get them back through the masked view.
  const ids = rows.map((r) => r.slot_id)
  if (!ids.length) return rows

  const { data: details } = await supabase
    .from('slots_public')
    .select('id, meeting_url, location_text')
    .in('id', ids)
  const byId = new Map((details ?? []).map((d) => [d.id, d]))

  return rows.map((r) => ({
    ...r,
    meeting_url: byId.get(r.slot_id)?.meeting_url ?? null,
    location_text: byId.get(r.slot_id)?.location_text ?? null,
  })) as BookingWithContext[]
}

export async function bookWithToken(slotId: string) {
  return unwrap(await supabase.rpc('book_slot_with_token', { p_slot_id: slotId }))
}

export async function cancelBooking(bookingId: string) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
  if (error) throw error
}

export async function markHeld(bookingId: string) {
  const { error } = await supabase.rpc('mark_session_held', { p_booking_id: bookingId })
  if (error) throw error
}

export async function completeBooking(bookingId: string) {
  const { error } = await supabase.rpc('complete_booking', { p_booking_id: bookingId })
  if (error) throw error
}

export async function forceComplete(bookingId: string) {
  const { error } = await supabase.rpc('force_complete_booking', { p_booking_id: bookingId })
  if (error) throw error
}

// ─── swaps ──────────────────────────────────────────────────────────────────
export async function fetchMyProposals(userId: string) {
  return unwrap(
    await supabase
      .from('swap_proposals')
      .select(PROPOSAL_SELECT)
      .or(`proposer_id.eq.${userId},responder_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
  ) as unknown as SwapProposalWithContext[]
}

export async function proposeSwap(input: {
  responderSlotId: string
  proposerSlotId: string
  message?: string
}) {
  return unwrap(
    await supabase.rpc('propose_swap', {
      p_responder_slot_id: input.responderSlotId,
      p_proposer_slot_id: input.proposerSlotId,
      p_message: input.message,
    }),
  )
}

export async function respondToSwap(proposalId: string, accept: boolean) {
  const { error } = await supabase.rpc('respond_to_swap', {
    p_proposal_id: proposalId,
    p_accept: accept,
  })
  if (error) throw error
}

export async function withdrawSwap(proposalId: string) {
  const { error } = await supabase.rpc('withdraw_swap', { p_proposal_id: proposalId })
  if (error) throw error
}

// ─── ledger ─────────────────────────────────────────────────────────────────
export async function fetchLedger(userId: string, limit = 12) {
  return unwrap(
    await supabase
      .from('token_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

// ─── follows ────────────────────────────────────────────────────────────────
export async function fetchFollowing(userId: string) {
  const rows = unwrap(await supabase.from('follows').select('followee_id').eq('follower_id', userId))
  return rows.map((r) => r.followee_id)
}

export async function fetchFollowCounts(userId: string) {
  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId),
    supabase.from('follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId),
  ])
  return { followers: followers.count ?? 0, following: following.count ?? 0 }
}

export async function setFollow(followerId: string, followeeId: string, on: boolean) {
  if (on) {
    const { error } = await supabase.from('follows').insert({ follower_id: followerId, followee_id: followeeId })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', followerId)
      .eq('followee_id', followeeId)
    if (error) throw error
  }
}

// ─── posts and the feed ─────────────────────────────────────────────────────
// The skill is denormalised onto the post: bookings are readable only by their
// two participants, so embedding through the booking nulls out for everyone else.
const POST_SELECT = `
  *,
  author:profiles!posts_author_id_fkey(*),
  partner:profiles!posts_partner_id_fkey(*),
  skill:skills(*, category:skill_categories(*))
`

// Following nobody means an empty feed, not everybody's.
export async function fetchFeed(userId: string, limit = 30) {
  const followingIds = await fetchFollowing(userId)
  if (!followingIds.length) return []

  const ids = followingIds.join(',')
  return unwrap(
    await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'published')
      .or(`author_id.in.(${ids}),partner_id.in.(${ids})`)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function fetchDiscoverFeed(limit = 30) {
  return unwrap(
    await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}

export async function fetchPendingConsent(userId: string) {
  return unwrap(
    await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'pending_consent')
      .eq('partner_id', userId)
      .order('created_at', { ascending: false }),
  )
}

export async function fetchUserPosts(userId: string) {
  return unwrap(
    await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('status', 'published')
      .or(`author_id.eq.${userId},partner_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(12),
  )
}

export async function createPost(input: {
  booking_id: string
  author_id: string
  partner_id: string
  skill_id: string
  caption: string
  photo_url: string | null
}) {
  const { error } = await supabase.from('posts').insert({ ...input, status: 'pending_consent' })
  if (error) throw error
}

export async function setPostConsent(postId: string, publish: boolean) {
  const { error } = await supabase
    .from('posts')
    .update({ status: publish ? 'published' : 'declined' })
    .eq('id', postId)
  if (error) throw error
}

export async function uploadImage(bucket: string, userId: string, file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false })
  if (error) throw error
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

// ─── skill requests ─────────────────────────────────────────────────────────
const REQUEST_SELECT = `
  *,
  requester:profiles(*),
  resolved_skill:skills(*, category:skill_categories(*)),
  responses:request_responses(*, teacher:profiles(*))
`

export async function fetchRequests(opts: {
  /** Any-of filter on the resolved catalog skill. */
  skillIds?: string[]
  /** Drop your own asks — you cannot offer to teach yourself. */
  excludeRequesterId?: string
  limit?: number
} = {}) {
  if (opts.skillIds?.length === 0) return []

  let qb = supabase
    .from('skill_requests')
    .select(REQUEST_SELECT)
    .in('status', ['open', 'pending_review'])
    .order('created_at', { ascending: false })

  if (opts.skillIds?.length) qb = qb.in('resolved_skill_id', opts.skillIds)
  if (opts.excludeRequesterId) qb = qb.neq('requester_id', opts.excludeRequesterId)
  if (opts.limit) qb = qb.limit(opts.limit)

  return unwrap(await qb)
}

export async function createRequest(input: {
  requester_id: string
  title: string
  description: string
  resolved_skill_id?: string | null
  status?: string
  ai_verdict?: unknown
}) {
  const { error } = await supabase.from('skill_requests').insert(input as never)
  if (error) throw error
}

export async function respondToRequest(requestId: string, teacherId: string, message: string) {
  const { error } = await supabase
    .from('request_responses')
    .insert({ request_id: requestId, teacher_id: teacherId, message })
  if (error) throw error
}

// ─── messaging ──────────────────────────────────────────────────────────────
export async function fetchConversations(userId: string) {
  const rows = unwrap(
    await supabase
      .from('conversations')
      .select('*')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
  )
  if (!rows.length) return []

  const otherIds = rows.map((c) => (c.user_a === userId ? c.user_b : c.user_a))
  const [{ data: people }, { data: recent }] = await Promise.all([
    supabase.from('profiles').select('*').in('id', otherIds),
    supabase
      .from('messages')
      .select('conversation_id, body, sender_id, read_at, created_at')
      .in('conversation_id', rows.map((c) => c.id))
      .order('created_at', { ascending: false }),
  ])
  const byId = new Map((people ?? []).map((p) => [p.id, p]))

  const lastByConv = new Map<string, NonNullable<typeof recent>[number]>()
  const unreadByConv = new Map<string, number>()
  for (const m of recent ?? []) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m)
    if (!m.read_at && m.sender_id !== userId) {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1)
    }
  }

  return rows.map((c) => ({
    ...c,
    other: byId.get(c.user_a === userId ? c.user_b : c.user_a)!,
    last: lastByConv.get(c.id) ?? null,
    unread: unreadByConv.get(c.id) ?? 0,
  }))
}

export async function fetchMessages(conversationId: string) {
  return unwrap(
    await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at'),
  )
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
  if (error) throw error
}

export async function markConversationRead(conversationId: string, userId: string) {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .is('read_at', null)
}

export async function openConversation(otherId: string) {
  return unwrap(await supabase.rpc('get_or_create_conversation', { p_other: otherId })) as string
}
