import { supabase } from '@/lib/supabase'
import type { SkillWithCategory } from '@/types/models'

export type Verdict = {
  matchedSkillId: string | null
  matchedSkillName: string | null
  reasoning: string
  source: 'ai' | 'heuristic'
}

/** Past this, the local heuristic answers instead. Groq replies in about a second. */
const CLASSIFY_TIMEOUT_MS = 10_000

/**
 * Deduping a request against the catalog. The Edge Function does it properly
 * with a model; if it is unavailable — no key, no deploy, hackathon wifi — we
 * fall back to token overlap, which is good enough that nothing ever blocks.
 */
export async function classifyRequest(
  title: string,
  description: string,
  skills: SkillWithCategory[],
): Promise<Verdict> {
  try {
    const invoked = supabase.functions.invoke('classify-request', {
      body: { mode: 'classify', title, description, skills: skills.map((s) => ({ id: s.id, name: s.name })) },
    })
    // A slow model must never leave someone staring at a spinning post button:
    // past the deadline we stop waiting and answer locally.
    const { data, error } = await Promise.race([
      invoked,
      new Promise<{ data: null; error: null }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: null }), CLASSIFY_TIMEOUT_MS),
      ),
    ])
    // The function answers even when the model is unreachable, so it is
    // `source`, not the mere presence of a reply, that says the AI ran.
    if (!error && data?.source === 'ai') {
      const match = skills.find((s) => s.id === data.matchedSkillId) ?? null
      return {
        matchedSkillId: match?.id ?? null,
        matchedSkillName: match?.name ?? null,
        reasoning: data.reasoning,
        source: 'ai',
      }
    }
  } catch {
    // fall through
  }
  return heuristic(title, description, skills)
}

export type ProposedSkill = {
  skillId: string
  /** 'approved' means it is live in the catalog now; 'pending' means the AI was down. */
  status: 'approved' | 'pending'
  /** The re-run dedupe found an existing skill, so nothing new was created. */
  matched: boolean
  reasoning: string
}

/**
 * Creating the catalog row is the Edge Function's job, not ours. The client
 * may only insert a skill as `pending` (`skills_insert` policy), and it is in
 * no position to assert that the AI cleared it — so the function verifies the
 * caller's JWT, re-runs the dedupe against the final name, and writes with the
 * service role.
 */
export async function proposeSkill(input: {
  name: string
  categoryId: string
  title: string
  description: string
  skills: SkillWithCategory[]
}): Promise<ProposedSkill> {
  const { data, error } = await supabase.functions.invoke('classify-request', {
    body: {
      mode: 'create',
      name: input.name,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      skills: input.skills.map((s) => ({ id: s.id, name: s.name })),
    },
  })
  // functions.invoke reports a non-2xx as a generic FunctionsHttpError, so the
  // useful message is in the body rather than in `error`.
  if (data?.error) throw new Error(data.error)
  if (error) throw error
  return data as ProposedSkill
}

const STOP = new Set([
  'the','a','an','to','for','of','and','or','i','my','me','you','want','learn','teach',
  'anyone','someone','help','with','looking','around','need','how','get','can','please',
  'beginner','beginners','basics','session','sessions','hour','hours','would','like','love',
])

function tokens(s: string) {
  return s
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function heuristic(title: string, description: string, skills: SkillWithCategory[]): Verdict {
  const words = new Set([...tokens(title), ...tokens(description)])
  let best: { skill: SkillWithCategory; score: number } | null = null

  for (const skill of skills) {
    const t = tokens(skill.name)
    if (!t.length) continue
    const hits = t.filter((w) => words.has(w)).length
    const score = hits / t.length
    if (score > 0 && (!best || score > best.score)) best = { skill, score }
  }

  if (best && best.score >= 0.5) {
    return {
      matchedSkillId: best.skill.id,
      matchedSkillName: best.skill.name,
      reasoning: `This looks like ${best.skill.name}, which is already in the catalog — your request goes straight to the people who teach it.`,
      source: 'heuristic',
    }
  }
  return {
    matchedSkillId: null,
    matchedSkillName: null,
    reasoning: 'Nothing in the catalog matches this yet, so you can name it yourself.',
    source: 'heuristic',
  }
}
