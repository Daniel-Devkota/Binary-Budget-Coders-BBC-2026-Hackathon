import { supabase } from '@/lib/supabase'
import type { SkillWithCategory } from '@/types/models'

export type Verdict = {
  matchedSkillId: string | null
  matchedSkillName: string | null
  reasoning: string
  source: 'ai' | 'heuristic'
}

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
    const { data, error } = await supabase.functions.invoke('classify-request', {
      body: { title, description, skills: skills.map((s) => ({ id: s.id, name: s.name })) },
    })
    if (!error && data?.reasoning) {
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
    reasoning: 'Nothing in the catalog matches this yet, so it is posted as a new skill for review.',
    source: 'heuristic',
  }
}
