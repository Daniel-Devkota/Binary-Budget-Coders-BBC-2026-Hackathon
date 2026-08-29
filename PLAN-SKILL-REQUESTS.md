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

## 1. Decisions to make

| # | Question | Options | Recommendation | Blocks |
|---|---|---|---|---|
| **D1** `OPEN` | Where does "offers I have made" live? | (a) third tab on `/requests`; (b) tab on `/bookings`; (c) new `/offers` route | **(a)** — same mental object as the requests feed, and `BookingsPage` is already four tabs deep | Phase 3 |
| **D2** `OPEN` | Does accepting one offer auto-decline the others? | (a) auto-decline siblings and mark the request `fulfilled`; (b) leave siblings pending, requester closes manually; (c) allow accepting several | **(a)** — an ask is for one teacher, and leaving four people on `pending` forever is worse than the current no-state. `respond_to_swap` sets this precedent at `rls_and_rpcs.sql:223-226` | Phase 2 |
| **D3** `OPEN` | Does accepting create a booking? | (a) open a conversation only; (b) also create a booking; (c) offer the teacher's next open slot | **(a)** — the teacher may have no slot published, and the offer carries no slot reference. Conversation first, they book normally | Phase 2 |
| **D4** `OPEN` | New-skill proposals: create the `skills` row immediately, or hold it? | (a) insert `status='pending'` on post and link `resolved_skill_id`; (b) keep the suggestion in `ai_verdict` only, create on approval | **(a)** — the RLS policy for exactly this already exists (`rls_and_rpcs.sql:396-398`) and `fetchSkills` filters to `approved` (`api.ts:45-53`), so it cannot leak. Gives the request a real skill to hang off | Phase 4 |
| **D5** `OPEN` | Who approves a pending skill? | (a) no admin — approve by SQL, document it; (b) `profiles.is_admin` column plus a guarded page; (c) auto-approve after N offers | **(a) for the hackathon** — there is no admin concept anywhere in the schema and inventing one is a whole vertical. (b) is the honest answer if this outlives the weekend | Phase 6 |
| **D6** `OPEN` | Is classification blocking? | (a) synchronous — post button runs it, verdict screen follows; (b) optimistic — post immediately, reclassify in background | **(a)** — the verdict screen *is* the feature. Needs a visible pending state and a skip-on-timeout | Phase 4 |
| **D7** `PROPOSED` | Groq model | `llama-3.3-70b-versatile` vs an 8B-class model | **`llama-3.3-70b-versatile`** — comfortably inside free limits at roughly 1k tokens a call. Swap to 8B only if rate-limited | Phase 1 |
| **D8** `PROPOSED` | Keep the Gemini path as a fallback? | (a) replace outright; (b) try Groq, fall back to Gemini | **(a)** — two dead providers is not better than one. The token-overlap heuristic is the real fallback and it already works | Phase 1 |
| **D9** `PROPOSED` | Does the Requests nav badge live-update? | (a) realtime channel like `useUnread`; (b) fetch on mount and after mutations | **(b)** — offers do not arrive second-by-second, and a second realtime channel costs more than it returns | Phase 5 |

Nothing below quietly resolves one of these. Where the prose assumes a recommendation, it says so.

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
- If nothing in the catalog fits, you name the skill yourself and pick a category, and the ask goes
  live immediately while the new skill waits for approval.
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
| **FR4** | MUST | Accepting closes the request and settles the other offers *(assumes D2a)* | Request reads `fulfilled`; sibling offers read `declined`; no offer is left `pending` |
| **FR5** | MUST | A teacher can see every offer they have made and its outcome | *My offers* lists offers grouped waiting / accepted / declined, including offers on requests that are no longer open |
| **FR6** | MUST | Posting a request lets the user name the catalog skill themselves | The dialog has an optional skill picker; choosing one skips classification entirely and posts `open` |
| **FR7** | MUST | When the AI proposes a match, the user confirms or rejects it before the request is saved | Nothing is written to `skill_requests` until the user presses confirm on the verdict step |
| **FR8** | MUST | Rejecting the AI's match routes to the new-skill path, not to a silent post | Pressing *it's something different* shows the name and category form |
| **FR9** | SHOULD | A request that matches nothing captures a proposed skill name and category *(assumes D4a)* | A `skills` row exists with `status='pending'` and `created_by` set, and the request's `resolved_skill_id` points at it |
| **FR10** | SHOULD | A pending skill never appears in search, profile pickers, or the request combobox | `fetchSkills` still filters `approved`; the new row is invisible everywhere a catalog list is rendered |
| **FR11** | SHOULD | The Requests nav item shows a count of things needing the user | Badge equals pending offers on my asks plus offers of mine accepted since last visit |
| **FR12** | SHOULD | Classification never blocks posting | With the Edge Function down or slow, the dialog falls through to the heuristic verdict and the user can still post |
| **FR13** | LATER | An admin can promote a pending skill into the catalog | Skill reads `approved` and appears in search |

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
                ├─ sibling offers on the same request → 'declined'   (D2a → FR4)
                ├─ parent request                     → 'fulfilled'
                └─ return get_or_create_conversation(teacher_id)     (D3a → FR3)
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
- `proposeSkill({ name, categoryId, userId })` — insert into `skills` with `status='pending'`,
  returning the id for `resolved_skill_id`. Slug is generated client-side from the name; `slug` is
  unique, so a collision surfaces as an error to handle rather than a silent duplicate.

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

**Phase 1 — Groq.** Rewrite the Edge Function's provider call. *Done when* posting a request in the
deployed app returns an AI-sourced verdict (`source: 'ai'`), and pulling the secret still lets you
post. Depends on D7, D8. Independent of everything else — ship it first.

**Phase 2 — Offer lifecycle.** Migration for `status` and `responded_at`, the `answer_request_offer`
RPC, `fetchMyResponses` and `answerOffer` in `api.ts`. *Done when* accept and decline can be driven
from SQL and the sibling sweep is observable in the table. Depends on D2, D3.

**Phase 3 — `/requests` tabs.** Three tabs, `OfferRow` with actions, accept navigating to the
conversation. *Done when* a full two-account loop works in the browser: A asks, B offers, A accepts,
both land in the same thread, and B sees *Accepted* under My offers. Depends on D1, Phase 2.

**Phase 4 — Two-step dialog.** Skill combobox, verdict step, new-skill form, `proposeSkill`. *Done
when* all three paths post correctly and a proposed skill is invisible in search. Depends on D4, D6,
Phase 1.

**Phase 5 — Nav badge.** Count on the Requests nav item, following the `unread` pattern at
`AppShell.tsx:69-73`. *Done when* the badge appears for a pending offer and clears once handled.
Depends on D9, Phase 2.

**Phase 6 — Admin promote.** *Done when* a pending skill can be approved and appears in search.
Depends on D5 — deliberately last, and droppable.

Cut line: phases 1 to 4 are the demo. 5 and 6 are polish.

---

## 6. Risks and non-goals

| Risk | Mitigation |
|---|---|
| Groq retires the model id mid-event | Error branches already return a null match and the client heuristic covers it; the model id is one constant |
| Classification latency makes the post button feel stuck | Explicit pending state on the verdict step, with a timeout that falls through to the heuristic (FR12) |
| Two requesters accept offers from the same teacher at once | The RPC locks the parent request `for update`; the second accept sees a non-`pending` response and raises |
| Users propose near-duplicate skills, filling the pending queue | The verdict step exists precisely to catch this; `skills.slug` is unique; approval stays manual by design |
| `fetchSkillBySlug` does not filter `status` (`api.ts:55-59`), so `/skill/<pending-slug>` renders a page for an unapproved skill | Add the filter, or accept it — nothing links there until approval |
| Tab restructure regresses the working browse feed | The browse card is moved, not rewritten; the existing offer form path stays intact |

**Non-goals.** Notifications outside the app. Editing or withdrawing an offer once sent. Multiple
accepted teachers per request. Rich admin tooling, moderation queues, or a role system. Creating a
booking automatically on accept. Reworking the classifier prompt — the current one is fine, only the
transport changes.

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
