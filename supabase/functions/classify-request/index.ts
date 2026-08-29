/**
 * Two jobs, one function.
 *
 *   mode 'classify' — dedupe a skill request against the existing catalog.
 *   mode 'create'   — dedupe once more against the name the user finally chose,
 *                     then write the new skill.
 *
 * The model never sees anything but the request text and the catalog names, and
 * the key lives only in Edge Function secrets:
 *   npx supabase secrets set GROQ_API_KEY=...
 *
 * If the key is missing or the call fails, classify returns a null match with
 * source 'unavailable' and the client falls back to token overlap, so the
 * feature degrades rather than breaking. Create still works without the model,
 * but the skill it writes lands as 'pending' instead of 'approved': a
 * token-overlap miss is not the judgement that earns a place in the catalog.
 */

/**
 * Groq retires models without warning and the account loses access the same
 * day. `llama-3.3-70b-versatile` was the original pick and it now 404s with
 * `model_not_found` — no llama chat model is on this account at all any more.
 *
 * That failure is indistinguishable from a missing key unless you read the
 * body, which is why `dedupe` reports a `detail`. If the AI path goes quiet
 * again, invoke the function and read that field before assuming the key.
 */
const MODEL = 'openai/gpt-oss-120b'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Skill = { id: string; name: string }
type Dedupe = {
  matchedSkillId: string | null
  reasoning: string
  source: 'ai' | 'unavailable'
  /**
   * Why the model did not answer. `reasoning` is shown to the person who asked
   * and must stay in plain English, so the operational cause goes here instead
   * of being swallowed. Never contains the key.
   */
  detail?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Ask the model whether this request is already in the catalog. */
async function dedupe(title: string, description: string, skills: Skill[]): Promise<Dedupe> {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) {
    return {
      matchedSkillId: null,
      reasoning: 'Catalog matching is running without the AI service configured.',
      source: 'unavailable',
      detail: 'GROQ_API_KEY is not set',
    }
  }

  // The catalog is sent as line numbers, not UUIDs. A uuid is ~36 characters
  // and there are 65 of them, which was over half the prompt and the reason a
  // single call cost ~2000 tokens against a free-tier ceiling of 8000 per
  // minute — roughly three requests before it starts refusing. Indices cut that
  // by about a third and the id never has to survive a round trip through a
  // language model.
  const catalog = skills.map((s, i) => `${i}\t${s.name}`).join('\n')

  const prompt = `You are deduplicating a skill-exchange request against an existing catalog.

CATALOG (index, tab, name):
${catalog}

REQUEST TITLE: ${title}
REQUEST DETAIL: ${description || '(none)'}

Decide whether the request is asking for a skill that is ALREADY in the catalog.
Match on meaning, not wording: "fix my bike" is "Bike Maintenance"; "talk to my
partner's family in sign" is "Auslan". Only match when a tutor teaching the
catalog skill would genuinely satisfy this request. If nothing fits, return null.

Respond with JSON only:
{"matchIndex": <catalog index as a number, or null>, "reasoning": "<one sentence, addressed to the person who asked, in plain Australian English>"}`

  const ask = () =>
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

  try {
    let res = await ask()

    // The free tier meters tokens per minute and says how long to wait. Two
    // people posting requests back to back is an ordinary thing to happen
    // during a demo, so one short retry is worth it — but the person is
    // watching a spinner, so it is capped well below what Groq may suggest.
    if (res.status === 429) {
      const wait = Math.min(
        3000,
        Math.round((parseFloat(res.headers.get('retry-after') ?? '') || 2) * 1000),
      )
      await new Promise((r) => setTimeout(r, wait))
      res = await ask()
    }

    // A retired model id lands here too. Degrading to the heuristic beats
    // blocking the post, so none of this is ever fatal.
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        matchedSkillId: null,
        reasoning: 'Matched against the catalog locally.',
        source: 'unavailable',
        detail: `groq ${res.status}: ${body.slice(0, 300)}`,
      }
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(text)

    // Never trust the model with anything but a position we can bounds-check.
    const i = typeof parsed.matchIndex === 'number' ? parsed.matchIndex : -1
    const matched = Number.isInteger(i) && i >= 0 && i < skills.length ? skills[i] : null

    return {
      matchedSkillId: matched?.id ?? null,
      reasoning:
        typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
          ? parsed.reasoning.trim()
          : matched
            ? `This looks like ${matched.name}, which already exists.`
            : 'Nothing in the catalog matches this yet.',
      source: 'ai',
    }
  } catch (e) {
    return {
      matchedSkillId: null,
      reasoning: 'Matched against the catalog locally.',
      source: 'unavailable',
      detail: `groq threw: ${(e as Error)?.message ?? String(e)}`.slice(0, 300),
    }
  }
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

/**
 * Whose request is this? Read it from the JWT, never from the body — the insert
 * below runs with the service role, so a caller-supplied id would be an
 * invitation to write the catalog as somebody else.
 */
async function callerId(req: Request, url: string, anonKey: string): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: anonKey },
  })
  if (!res.ok) return null
  const user = await res.json()
  return typeof user?.id === 'string' ? user.id : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let mode = 'classify'
  let title = ''
  let description = ''
  let name = ''
  let categoryId = ''
  let skills: Skill[] = []
  try {
    const body = await req.json()
    mode = body.mode === 'create' ? 'create' : 'classify'
    title = String(body.title ?? '').slice(0, 300)
    description = String(body.description ?? '').slice(0, 2000)
    name = String(body.name ?? '').trim().slice(0, 80)
    categoryId = String(body.categoryId ?? '')
    skills = Array.isArray(body.skills) ? body.skills.slice(0, 300) : []
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  if (mode === 'classify') {
    if (!title.trim()) return json({ error: 'title is required' }, 400)
    return json(await dedupe(title, description, skills))
  }

  // ─── create ───────────────────────────────────────────────────────────────
  if (!name) return json({ error: 'name is required' }, 400)
  if (!categoryId) return json({ error: 'categoryId is required' }, 400)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) return json({ error: 'server is not configured' }, 500)

  const userId = await callerId(req, url, anonKey)
  if (!userId) return json({ error: 'not authenticated' }, 401)

  // The name the user chose is a far better dedupe key than "anyone teach
  // auslan around newtown?", so the check is worth running a second time.
  const check = await dedupe(name, `${title} ${description}`.trim(), skills)
  if (check.matchedSkillId) {
    return json({
      skillId: check.matchedSkillId,
      status: 'approved',
      matched: true,
      reasoning: check.reasoning,
    })
  }

  const slug = slugify(name)
  if (!slug) return json({ error: 'that name needs some letters or numbers in it' }, 400)

  // The AI answering "no, this is not a duplicate" is the only judgement that
  // lets a skill into the live catalog. A heuristic miss is not that.
  const status = check.source === 'ai' ? 'approved' : 'pending'

  const res = await fetch(`${url}/rest/v1/skills?select=id,status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, slug, category_id: categoryId, created_by: userId, status }),
  })

  if (!res.ok) {
    const detail = await res.text()
    // skills.slug is unique, so a name already in use surfaces rather than
    // quietly writing a second row that means the same thing.
    if (res.status === 409) {
      return json({ error: 'A skill with that name already exists — try the picker.' }, 409)
    }
    return json({ error: `could not create the skill: ${detail.slice(0, 200)}` }, 500)
  }

  const [row] = await res.json()
  return json({ skillId: row.id, status: row.status, matched: false, reasoning: check.reasoning })
})
