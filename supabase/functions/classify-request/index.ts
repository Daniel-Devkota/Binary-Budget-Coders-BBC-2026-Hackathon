/**
 * Deduplicates a skill request against the existing catalog.
 *
 * The model never sees anything but the request text and the catalog names, and
 * the key lives only in Edge Function secrets:
 *   npx supabase secrets set GEMINI_API_KEY=...
 *
 * If the key is missing or the call fails, this returns a null match with a
 * reason. The client already has a token-overlap fallback, so the feature
 * degrades rather than breaking.
 */

const MODEL = 'gemini-2.0-flash'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Skill = { id: string; name: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let title = ''
  let description = ''
  let skills: Skill[] = []
  try {
    const body = await req.json()
    title = String(body.title ?? '').slice(0, 300)
    description = String(body.description ?? '').slice(0, 2000)
    skills = Array.isArray(body.skills) ? body.skills.slice(0, 300) : []
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  if (!title.trim()) return json({ error: 'title is required' }, 400)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) {
    return json({
      matchedSkillId: null,
      reasoning: 'Catalog matching is running without the AI service configured.',
    })
  }

  const catalog = skills.map((s) => `${s.id}\t${s.name}`).join('\n')

  const prompt = `You are deduplicating a skill-exchange request against an existing catalog.

CATALOG (id, tab, name):
${catalog}

REQUEST TITLE: ${title}
REQUEST DETAIL: ${description || '(none)'}

Decide whether the request is asking for a skill that is ALREADY in the catalog.
Match on meaning, not wording: "fix my bike" is "Bike Maintenance"; "talk to my
partner's family in sign" is "Auslan". Only match when a tutor teaching the
catalog skill would genuinely satisfy this request. If nothing fits, return null.

Respond with JSON only:
{"matchedSkillId": "<catalog id or null>", "reasoning": "<one sentence, addressed to the person who asked, in plain Australian English>"}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      },
    )

    if (!res.ok) return json({ matchedSkillId: null, reasoning: 'Matched against the catalog locally.' })

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
    const parsed = JSON.parse(text)

    // Never trust the model with an id that is not actually in the catalog.
    const matched = skills.find((s) => s.id === parsed.matchedSkillId) ?? null

    return json({
      matchedSkillId: matched?.id ?? null,
      reasoning:
        typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
          ? parsed.reasoning.trim()
          : matched
            ? `This looks like ${matched.name}, which already exists.`
            : 'Nothing in the catalog matches this yet.',
    })
  } catch {
    return json({ matchedSkillId: null, reasoning: 'Matched against the catalog locally.' })
  }
})
