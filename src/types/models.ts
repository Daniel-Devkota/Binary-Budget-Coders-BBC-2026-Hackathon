import type { Database } from './database'

type T = Database['public']['Tables']

export type Profile = T['profiles']['Row']
export type SkillCategory = T['skill_categories']['Row']
export type Skill = T['skills']['Row']
export type UserSkill = T['user_skills']['Row']
export type Slot = T['availability_slots']['Row']
export type Booking = T['bookings']['Row']
export type SwapProposal = T['swap_proposals']['Row']
export type LedgerEntry = T['token_ledger']['Row']
export type Conversation = T['conversations']['Row']
export type Message = T['messages']['Row']
export type Post = T['posts']['Row']
export type SkillRequest = T['skill_requests']['Row']
export type RequestResponse = T['request_responses']['Row']

export type SkillWithCategory = Skill & { category: SkillCategory }
export type UserSkillWithSkill = UserSkill & { skill: SkillWithCategory }

/** Slots read through the masked view. */
export type PublicSlot = Database['public']['Views']['slots_public']['Row']

export type SlotWithContext = PublicSlot & {
  skill: SkillWithCategory
  teacher: Profile
}

export type BookingWithContext = Booking & {
  skill: SkillWithCategory
  teacher: Profile
  learner: Profile
  /** Base-table read: the private columns are absent by design. */
  slot: Omit<Slot, 'meeting_url' | 'location_text'>
  /** Merged in from slots_public — null unless the viewer has earned them. */
  meeting_url?: string | null
  location_text?: string | null
}

export type SwapProposalWithContext = SwapProposal & {
  proposer: Profile
  responder: Profile
  responder_slot: Slot & { skill: Skill }
  proposer_slot: Slot & { skill: Skill }
}

export type PerfectSwap = {
  partner: Profile
  theyTeach: SkillWithCategory
  theyWant: SkillWithCategory
}
