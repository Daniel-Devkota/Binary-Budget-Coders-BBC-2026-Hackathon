# Plan — Skill requests overhaul

**Status:** draft for review · **Date:** 30 Aug 2026 · **Surface:** `/requests`, `classify-request` Edge Function

---

## 0. TL;DR

Skill requests work end-to-end today, but the loop never closes. You can post an ask and you can
offer to teach, and then nothing: `request_responses` is an append-only table with no status column
(`supabase/migrations/20260829000001_init.sql:184-191`), so there is no accept, no decline, no
notification, and no screen anywhere that lists the offers you have made. Your offer also silently
vanishes from the UI once the requester marks the request fulfilled, because `fetchRequests` only
returns `open` and `pending_review` (`src/lib/api.ts:472`).

Separately, posting a request never asks what skill it is. The dialog takes a title and a
description, classifies silently on submit, and reports the verdict in a toast that is gone a moment
later (`src/features/requests/RequestsPage.tsx:84-107`). People who know exactly what they want
cannot say so, and people whose request matched nothing are told a review will happen that no code
performs.

Three changes: give the offer a lifecycle, turn the post dialog into propose-and-confirm, and
repoint the classifier at Groq now that Gemini is unavailable. The catch is that the accept action
must be written by the **requester** onto a row the current RLS policy says only the **teacher** may
write (`rls_and_rpcs.sql:461-463`), so it has to go through a `security definer` RPC — which is what
every other state transition in this codebase already does.

---

## 1. Decisions

All nine are settled — signed off 30 Aug 2026. Kept here as the record of what was chosen and why,
so the reasoning survives into implementation.

| # | Question | Decision | Why |
|---|---|---|---|
| **D1** `DECIDED` | Where does "offers I have made" live? | Third tab on `/requests` | Same mental object as the requests feed, and `BookingsPage` is already four tabs deep |
| **D2** `DECIDED` | Does accepting one offer auto-decline the others? | Yes — siblings go `declined`, the request goes `fulfilled` | An ask is for one teacher, and leaving four people on `pending` forever is worse than the current no-state. `respond_to_swap` sets the precedent at `rls_and_rpcs.sql:223-226` |
| **D3** `DECIDED` | Does accepting create a booking? | No — open a conversation only | The teacher may have no slot published, and the offer carries no slot reference. They book normally afterwards |
| **D4** `DECIDED` | Create the `skills` row on post, or hold it? | Create it on post and link `resolved_skill_id` | The RLS policy for exactly this already exists (`rls_and_rpcs.sql:396-398`) and `fetchSkills` filters by status (`api.ts:45-53`), so an unapproved row cannot leak into the catalog |
| **D5** `DECIDED` | Who approves a new skill? | The classifier decides: **AI ran and found no match → `approved` immediately**. **Heuristic fallback ran → `pending`**, approved later by SQL | The AI answers "is this a duplicate", which is the only judgement needed to let a genuine new skill through. A token-overlap miss is not that judgement, so it does not get to write to the catalog. `classify.ts` already returns `source: 'ai' \| 'heuristic'`, so the signal exists |
| **D6** `DECIDED` | Is classification blocking? | Blocking — the post button runs it and the verdict screen follows | The verdict screen *is* the feature. Non-blocking adds reconciliation complexity for no user-visible gain |
| **D7** `DECIDED` | Groq model | `llama-3.3-70b-versatile` | Comfortably inside free limits at roughly 1k tokens a call. Swap to an 8B model only if rate-limited |
| **D8** `DECIDED` | Keep the Gemini path as a fallback? | No — replace outright | Two dead providers is not better than one. The token-overlap heuristic is the real fallback and it already works |
| **D9** `DECIDED` | Does the Requests nav badge live-update? | No — fetch on mount and after mutations | Offers do not arrive second-by-second, and a second realtime channel costs more than it returns |

**Consequence of D5 worth noting up front:** `status='pending'` is now the *unusual* path, not the
normal one. Most new skills go live the moment they are proposed, and the pending queue only fills
when the Edge Function is down. That makes Phase 6 genuinely optional rather than merely last.

---

## 2. What it does

**Today.** You open `/requests` and see every open ask. On someone else's ask you press *I can teach
this*, write a message, send. The card swaps the button for a grey **You offered** badge
(`RequestCard.tsx:64-73`) and that is the last thing that ever happens. On your own ask, offers
appear as a plain list of names and messages underneath (`RequestCard.tsx:88-98`) with no way to
respond to them. Posting an ask asks for a title and a paragraph; the skill is decided for you
without being shown.

**After.**

- Posting an ask lets you pick the skill from the catalog if you already know it, and otherwise
  shows you what the AI thinks before anything is saved, with a way to disagree.
- If nothing in the catalog fits, you name the skill yourself and pick a category. Provided the AI
  was the thing that found no match, that skill joins the catalog straight away and other people can
  search for it.
- On your own ask, each offer has **Accept** and **Decline**. Accepting drops you straight into a
  conversation with that person and closes the ask.
- A third tab lists every offer you have made, grouped by what happened to it, so "did they accept?"
  is one click from anywhere.
- The Requests nav item carries a count when something needs you.

---

## 3. Functional requirements

| # | Priority | Requirement | Accepted when |
|---|---|---|---|
| **FR1** | MUST | An offer has exactly one of three states: pending, accepted, declined | `request_responses.status` exists with a check constraint; every existing row reads `pending` after migration |
| **FR2** | MUST | Only the requester can accept or decline an offer on their own request | A teacher calling the RPC on someone else's request gets an exception, not a silent no-op |
| **FR3** | MUST | Accepting an offer opens a conversation with that teacher | Accept navigates to `/messages/:id` with a conversation containing both parties |
| **FR4** | MUST | Accepting closes the request and settles the other offers | Request reads `fulfilled`; sibling offers read `declined`; no offer is left `pending` |
| **FR5** | MUST | A teacher can see every offer they have made and its outcome | *My offers* lists offers grouped waiting / accepted / declined, including offers on requests that are no longer open |
| **FR6** | MUST | Posting a request lets the user name the catalog skill themselves | The dialog has an optional skill picker; choosing one skips classification entirely and posts `open` |
| **FR7** | MUST | When the AI proposes a match, the user confirms or rejects it before the request is saved | Nothing is written to `skill_requests` until the user presses confirm on the verdict step |
| **FR8** | MUST | Rejecting the AI's match routes to the new-skill path, not to a silent post | Pressing *it's something different* shows the name and category form |
| **FR9** | SHOULD | A request that matches nothing creates a real skill, named and categorised by the user | A `skills` row exists with `created_by` set and the request's `resolved_skill_id` pointing at it |
| **FR9b** | SHOULD | That skill is `approved` when the AI found no match, and `pending` when only the heuristic ran | Posting with the Edge Function reachable yields `approved`; posting with the secret pulled yields `pending` |
| **FR10** | SHOULD | A `pending` skill never appears in search, profile pickers, or the request combobox | `fetchSkills` still filters `approved`; a pending row is invisible everywhere a catalog list is rendered |
| **FR11** | SHOULD | The Requests nav item shows a count of things needing the user | Badge equals pending offers on my asks plus offers of mine accepted since last visit |
| **FR12** | SHOULD | Classification never blocks posting | With the Edge Function down or slow, the dialog falls through to the heuristic verdict and the user can still post |
| **FR13** | LATER | A skill left `pending` because the AI was down can be released into the catalog | A documented SQL update flips it to `approved` and it appears in search. No UI |

---

## 4. Technical approach

### 4.1 How it works today

```
RequestsPage ──fetchRequests()──> skill_requests (status in open|pending_review)
     │                              └─ responses:request_responses(*, teacher:profiles(*))
     │
     ├─ NewRequestDialog ──classifyRequest()──> Edge Fn `classify-request` ──> Gemini
     │        ├─ on failure ──> heuristic() token overlap, client side
     │        └─ createRequest({ status: matched ? 'open' : 'pending_review' })
     │
     └─ RequestCard
          ├─ not mine, not answered ──> respondToRequest() ──> INSERT request_responses
          ├─ answered ──────────────> <Badge>You offered</Badge>          ← terminal
          └─ mine ──────────────────> list of responses, read only        ← terminal
```

Both terminal branches are the bug. `respondToRequest` (`api.ts:494-500`) is a bare insert; there is
no update path because there is no column to update.

**RLS as it stands** (`rls_and_rpcs.sql:458-463`):

| Table | Read | Write |
|---|---|---|
| `skill_requests` | all authenticated | `requester_id = auth.uid()` |
| `request_responses` | all authenticated | `teacher_id = auth.uid()` |

The requester cannot touch a response row. Widening `responses_write` to also allow the parent
request's owner would let a requester rewrite a teacher's `message` text, so the state change goes
through an RPC instead and the policy stays exactly as it is.

### 4.2 Data model change

```sql
alter table public.request_responses
  add column status text not null default 'pending'
    check (status in ('pending','accepted','declined')),
  add column responded_at timestamptz;

create index on public.request_responses (teacher_id, created_at desc);
```

Additive and defaulted, so no backfill: existing rows become `pending`, which is what they
semantically already are.

### 4.3 The accept RPC

Modelled directly on `respond_to_swap` (`rls_and_rpcs.sql:181-232`) — `security definer set
search_path = public`, `select ... for update` on the parent, `raise exception` for authorisation,
and a sibling sweep in the same transaction.

```
answer_request_offer(p_response_id uuid, p_accept boolean) returns uuid
  ├─ lock the response and its parent request
  ├─ reject unless parent.requester_id = auth.uid()            → FR2
  ├─ reject unless response.status = 'pending'                 (idempotence)
  ├─ decline ─> status='declined', responded_at=now(), return null
  └─ accept  ─> status='accepted'
                ├─ sibling offers on the same request → 'declined'   (D2 → FR4)
                ├─ parent request                     → 'fulfilled'
                └─ return get_or_create_conversation(teacher_id)     (D3 → FR3)
```

Returning the conversation id from the RPC makes accept one round trip that cannot half-succeed: the
client simply navigates to `/messages/<returned id>`. `openConversation` (`api.ts:566-568`) already
wraps that same conversation RPC, so this reuses a proven path rather than inventing one.

### 4.4 Client data layer

- `fetchMyResponses(userId)` — `request_responses` filtered on `teacher_id`, joined to the parent
  request and its resolved skill. Deliberately **not** filtered by request status, which is what
  fixes the disappearing-offer problem in `fetchRequests`.
- `answerOffer(responseId, accept)` — thin `supabase.rpc` wrapper.
- `fetchRequests` gains an `ownerId` mode so *My asks* can include `fulfilled` and `rejected` asks.
- `proposeSkill({ name, categoryId })` — **not a direct insert.** See 4.4b.

### 4.4b Why creating the skill goes through the Edge Function

D5 says a skill is `approved` when the AI found no match and `pending` when only the heuristic ran.
The client cannot be the one to assert that. The existing policy allows any authenticated user to
insert a skill only when `created_by = auth.uid() and status = 'pending'`
(`rls_and_rpcs.sql:396-398`); relaxing it to permit `approved` would let anyone write anything
straight into the catalog, with the AI check as an honour system.

So `classify-request` gains a second mode rather than the client gaining a second insert:

```
POST /classify-request { mode: 'classify', title, description, skills }
  └─> { matchedSkillId, reasoning, source: 'ai' | 'unavailable' }

POST /classify-request { mode: 'create', name, categoryId, title, description, skills }
  ├─ re-run the AI dedupe against the FINAL name, not the original free text
  ├─ AI ran, still no match ─> insert skills{ status: 'approved', created_by: caller }
  ├─ AI unavailable         ─> insert skills{ status: 'pending',  created_by: caller }
  └─> { skillId, status }
```

Two things this buys beyond authorisation. The dedupe runs against the name the user actually chose,
which is a far better dedupe key than "anyone teach auslan around newtown?". And `created_by` stays
truthful because the function reads the caller's id from the JWT rather than taking it as a
parameter.

The function needs the service role key to insert as `approved`. `SUPABASE_SERVICE_ROLE_KEY` is
injected into Edge Functions automatically, so this is not a new secret to manage — but it does mean
the function must verify the caller's JWT before inserting, which it does not do today.

Slug is generated from the name inside the function; `skills.slug` is unique, so a collision returns
an error to surface rather than a silent duplicate.

### 4.5 `/requests` restructured

Same `Tabs` / `TabList` / `Badge` composition as `BookingsPage.tsx:41-53`, so this is assembly, not
new UI primitives.

| Tab | Source | Card |
|---|---|---|
| **Open** | `fetchRequests({ excludeRequesterId })` | existing browse card, offer form inline |
| **My asks** | `fetchRequests({ ownerId })` | offers listed with Accept / Decline |
| **My offers** | `fetchMyResponses(userId)` | request title, its status, your message, the outcome |

`RequestCard` splits: the browse card keeps the offer form, and a new `OfferRow` renders a single
response with actions. The `mine` branch at `RequestCard.tsx:88-98` becomes a list of `OfferRow`.

### 4.6 The two-step dialog

```
┌─ Step 1 ─────────────────────────────┐      ┌─ Step 2, matched ──────────────┐
│ What do you want to learn?  [text]   │      │ This looks like Latte Art      │
│ A bit more                  [text]   │ ───► │ "<AI reasoning sentence>"      │
│ Is it one of these?  [SelectMenu ▾]  │      │ [Post to Latte Art] [It's      │
│   ↳ optional, filtered by title      │      │                    different]  │
│ [Post request]                       │      └────────────────────────────────┘
└──────────────────────────────────────┘                    │ no match, or "different"
             │ skill picked                                 ▼
             └───────────────────────────► ┌─ Step 2, new skill ────────────┐
                skip classification,       │ Name the skill  [prefilled]    │
                post `open` directly       │ Category        [SelectMenu ▾] │
                                           │ [Post as a new skill]          │
                                           └────────────────────────────────┘
```

`SelectMenu` already does searchable filtering inside a fixed-height panel
(`src/components/ui/SelectMenu.tsx:5-27`), so the combobox is a prop, not a new component.
Prefiltering it by the title means the expert path and the no-idea path converge on one control
instead of branching the UI — there is no "let the AI decide" toggle, because leaving the field
empty *is* that choice.

Nothing is written until step 2 is confirmed, which reverses today's order, where `createRequest`
runs before the user has seen the verdict at all (`RequestsPage.tsx:89-98`).

### 4.7 Groq swap

Only `supabase/functions/classify-request/index.ts` changes. The prompt, the 300-skill catalog cap,
the id-validation guard, and the graceful `{ matchedSkillId: null }` returns all stay exactly as they
are — they are the reason the feature degrades instead of breaking.

| | Gemini (now) | Groq (after) |
|---|---|---|
| Endpoint | `generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key=` | `api.groq.com/openai/v1/chat/completions` |
| Auth | key in the query string | `Authorization: Bearer` header |
| Body | `contents[].parts[].text` | `messages[]` plus `response_format: {type:'json_object'}` |
| Reply | `candidates[0].content.parts[0].text` (`index.ts:88`) | `choices[0].message.content` |
| Secret | `GEMINI_API_KEY` | `GROQ_API_KEY` *(already set)* |

Roughly twenty lines. The `!res.ok` and `catch` branches (`index.ts:83`, `index.ts:105`) keep
returning a null match, which matters more than usual on Groq because model ids there are retired
fairly often — a dead model id degrades to the heuristic rather than blocking posting (FR12).

---

## 5. Phases

**Phase 1 — Groq.** Rewrite the Edge Function's provider call, no behaviour change. *Done when*
posting a request in the deployed app returns an AI-sourced verdict (`source: 'ai'`), and pulling the
secret still lets you post. Independent of everything else — ship it first.

**Phase 2 — Offer lifecycle.** Migration for `status` and `responded_at`, the `answer_request_offer`
RPC, `fetchMyResponses` and `answerOffer` in `api.ts`. *Done when* accept and decline can be driven
from SQL, the sibling sweep is observable in the table, and a teacher calling it on someone else's
request is rejected.

**Phase 3 — `/requests` tabs.** Three tabs, `OfferRow` with actions, accept navigating to the
conversation. *Done when* a full two-account loop works in the browser: A asks, B offers, A accepts,
both land in the same thread, and B sees *Accepted* under My offers. Needs Phase 2.

**Phase 4 — Two-step dialog.** Skill combobox, verdict step, new-skill form, and the `create` mode
on the Edge Function including JWT verification. *Done when* all three paths post correctly, an
AI-cleared new skill is immediately searchable, and one created with the secret pulled is not. Needs
Phase 1.

**Phase 5 — Nav badge.** Count on the Requests nav item, following the `unread` pattern at
`AppShell.tsx:69-73`. *Done when* the badge appears for a pending offer and clears once handled.
Needs Phase 2.

**Phase 6 — Approving a stuck skill.** Only reachable when the AI was down at post time. A documented
SQL one-liner is the whole deliverable; no admin UI, no role column. *Done when* the query is written
down in `HANDOFF.md`. Droppable.

Cut line: phases 1 to 4 are the demo. 5 is polish, 6 is a note in a file.

---

## 6. Risks and non-goals

| Risk | Mitigation |
|---|---|
| Groq retires the model id mid-event | Error branches already return a null match and the client heuristic covers it; the model id is one constant |
| Classification latency makes the post button feel stuck | Explicit pending state on the verdict step, with a timeout that falls through to the heuristic (FR12) |
| Two requesters accept offers from the same teacher at once | The RPC locks the parent request `for update`; the second accept sees a non-`pending` response and raises |
| Users propose near-duplicate or junk skills straight into the live catalog (D5 auto-approve) | The `create` mode re-runs dedupe against the final chosen name, which is a much stronger check than the original free text. Residual risk accepted: a determined user can still add a silly skill, and the blast radius is one extra row in search |
| The `create` mode inserts with the service role, so a missing JWT check would let anyone write to the catalog | Verify the caller's JWT and take `created_by` from it, never from the request body. This is the one genuinely new security surface in the plan |
| `fetchSkillBySlug` does not filter `status` (`api.ts:55-59`), so `/skill/<pending-slug>` renders a page for an unapproved skill | Add the filter, or accept it — pending is now the rare path and nothing links there |
| Tab restructure regresses the working browse feed | The browse card is moved, not rewritten; the existing offer form path stays intact |

**Non-goals.** Notifications outside the app. Editing or withdrawing an offer once sent. Multiple
accepted teachers per request. **Any admin surface at all** — no `is_admin` column, no role system,
no moderation queue, no approval screen; the classifier is the gate, and the rare stuck skill is
handled with a hand-written query. Creating a booking automatically on accept. Reworking the
classifier prompt — the current one is fine, only the transport changes.

---

## Grounding

**Read:** `src/features/requests/RequestsPage.tsx`, `RequestCard.tsx`, `classify.ts`;
`src/lib/api.ts:41-59, 460-500, 560-568`; `src/components/layout/AppShell.tsx:17-25, 55-76`;
`src/features/messaging/useUnread.ts`; `src/components/ui/SelectMenu.tsx:1-40`;
`src/features/booking/BookingsPage.tsx`; `supabase/functions/classify-request/index.ts`;
`supabase/migrations/20260829000001_init.sql:7-53, 171-191`;
`supabase/migrations/20260829000002_rls_and_rpcs.sql:181-232, 375-463`.

**Assumed, not verified:**

- The Groq free-tier limits and the availability of `llama-3.3-70b-versatile` — check
  `console.groq.com/docs/models` before relying on the model id.
- That `GROQ_API_KEY` is set against project `dmyponzmvogiqsdurvku`; not confirmed from this session.
- That no seed script or `scripts/*.mjs` asserts on `request_responses` having exactly its current
  columns — the smoke and journey tests were not read.
- That nothing outside `src/features/requests/` renders a `RequestCard`.
- That realtime is not already subscribed to `request_responses` anywhere.
- That `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are auto-injected into this project's Edge
  Functions, and that the function is deployed with JWT verification available. 4.4b depends on
  both; confirm before starting Phase 4.
