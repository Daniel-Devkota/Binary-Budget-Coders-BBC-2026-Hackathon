# Handoff — Skill Up (SYNCS Hack 2026)

Start here. This file is the current state of the project; everything else is the original spec,
the submission-facing README, or raw transcripts.

## The documents, and which are still live

| File | What it is | Status |
|---|---|---|
| `HANDOFF.md` | This file — where things stand, pitfalls, what is left | **Live. Read first.** |
| `IMPLEMENTATION_PLAN.md` | The original spec: schema, RLS, screens, and the demo script in §9 | **Live**, and still accurate for what shipped. §9 is the demo script |
| `README.md` | Submission-facing. Contributions table still needs filling in | Live |
| `demo-video-script.md`, `material/` | Video script and the event's own materials | Live |
| `previous-chats/` | Raw session transcripts kept for context transfer | Reference only — do not treat as spec |

A plan file is deleted once its work ships, and what still constrains the code moves into
*Shipped since the first session* below. There is no open plan file right now.

---

## Where things stand

**Phases 0, 1 and most of 2 from the plan are done and deployed.**

- **Live:** https://blocks-syncs.vercel.app (Vercel project `blocks-syncs`, team `daniel-s-team11`)
- **Supabase:** project `Skill Up` / ref `dmyponzmvogiqsdurvku`, region `ap-southeast-2`, linked
- **Demo accounts:** `maya@blocks.demo` and `sam@blocks.demo`, both `blocks1234`.
  Every seeded account uses that password. Maya and Sam are a deliberate perfect swap for each other.

### Shipped and verified end to end in a real browser

| Area | State |
|---|---|
| Auth, profile bootstrap, protected routes | Working |
| Token engine (grant, hold, refund, earn, weekly top-up, cap of 5) | Working, verified by `scripts/flow-test.mjs` |
| Perfect-swap matching | Working — Maya sees Sam on `/home` |
| Swap propose → accept → two linked bookings | Working end to end across two browser contexts |
| Token booking, cancellation refund, completion, force-complete | Working |
| Meeting link / address hidden until confirmed | Enforced by column grants + definer view; a direct `select meeting_url` is a permission error |
| Realtime 1-1 messaging with unread badges | Working — verified live between two sessions |
| Search with category / skill / mode / date filters | Working |
| Skill and public profile pages, follows | Working |
| Availability publishing, teach/learn management, profile editing, avatar upload | Working |
| Skill requests with catalog dedupe | Working; Edge Function deployed |
| Consent-gated feed with block-art placeholders | Working |
| Landing page with lazy 3D hero and reduced-motion fallback | Working |
| Mobile layout and drawer | Working at 390px |
| Globe map: dive to your city, clustered pins, popup → booking | Working, verified in dev and against the production build |
| Auto-confirm after 48 hours | Working — `pg_cron` every 15 min plus a lazy sweep on every `/bookings` load |
| Confirm codes for in-person sessions, with QR | Working, verified across two browser contexts |
| Sessions badge when something is waiting on the learner | Working |

---

## Shipped since the first session

Condensed from plan files that have been deleted now that the work is in. These are the decisions
that still constrain the code — the reasoning, not the changelog. `git log` has the changelog.

**Map** (`87d2fba`, `81ab20f`). Slot coordinates are only ever served by `slots_in_bounds`, which
jitters them ~500m first (`map_slots_in_bounds.sql:42`). The exact point is revealed with the address,
post-confirmation, and nowhere else.

**Skill requests overhaul** (`f029d7f`). Offers have a lifecycle and the loop closes.

- `request_responses.status` is `pending | accepted | declined`. Accept is written by the
  **requester** onto a row the RLS policy says only the **teacher** may write, so it goes through
  `answer_request_offer` (`20260829000021_request_offer_lifecycle.sql:36`), a `security definer` RPC.
  Do not try to do it with a direct update.
- Accepting one offer declines its siblings and marks the request `fulfilled`. An ask is for one
  teacher, and leaving four people on `pending` forever is worse than the old no-state.
- Accepting opens a **conversation**, not a booking. The offer carries no slot reference and the
  teacher may have published no availability.
- The classifier runs on **Groq** (`openai/gpt-oss-120b`; it was `llama-3.3-70b-versatile` until Groq
  retired it). The Gemini path is gone, not kept as a fallback — the client-side token-overlap heuristic is the real fallback and it works.
- A new skill proposed from the request dialog is `approved` immediately **when the AI answered**,
  and `pending` when only the heuristic ran. The AI answers "is this a duplicate", which is the only
  judgement needed; a token-overlap miss is not that judgement. See *Releasing a stuck skill* below.
- There is deliberately **no admin surface** — no `is_admin`, no roles, no moderation queue. The
  classifier is the gate and the rare stuck skill is a hand-written `update`.

---

**Session confirmation** (`ebe64eb`, `42ea684`, `9d17dbd`, `adab31d`, `3933238`). Completing a
session used to take two people making two unprompted return visits, and the card promised an
auto-confirm that did not exist.

- **`auto_confirm_at` is now read.** `run_auto_confirms()` completes held bookings past their
  deadline. It takes **no auth check** on purpose — it can only advance bookings that already earned
  it, so it is safe from cron, from the SQL editor, or unawaited from a page load. `pg_cron` **is**
  available on this project and schedulable from a CLI migration (`*/15 * * * *`), but the lazy call
  in `fetchMyBookings` ships anyway: a promise that comes true a quarter of an hour late is no good
  in a demo.
- Idempotence is structural, not defensive. The `status = 'held'` predicate sits in the same
  statement as the update and the ledger insert reads from `returning`, so it can only ever credit
  rows that statement actually moved.
- **Confirm codes are in-person only.** Two people on a video call can read six digits aloud, so
  co-presence is exactly what a code fails to prove there. Online keeps the two-step attestation.
  `BookingCard` branches on `booking.slot.mode` and every "what happens next" string has two
  versions. This is **not fraud-proof** and must not be demoed as if it were — a teacher can text the
  code. What it does is make co-presence the easy path.
- The code lives in `session_codes` with **RLS on and no policies at all**. That is the intent, not
  an omission: with no policy nobody reaches it through the API and the only way in or out is the two
  `security definer` functions. A column on `bookings` would have needed a column-level `SELECT`
  revoke, and `BOOKING_SELECT` is a bare `*` — pitfall #1 below.
- **The failed-attempt counter is a sequence, not a column** (`confirm_guard`, migrations
  `…0005`–`…0007`). This is the one thing in the feature that is not obvious, and it cost two
  migrations to get right. FR4 wants a wrong code to have no side effects and FR5 wants the wrong
  code remembered, and those pull in opposite directions: `raise` aborts the RPC transaction and
  takes any `update` with it. Sequences are non-transactional, so `nextval` survives. `create
  sequence` does **not** — it is DDL and rolls back too — which is why the counter is armed by
  `reveal_session_code`, not by the first failure. If you ever move this back to a column, the
  lockout silently stops working and only a refusal test will tell you.
- `run_auto_confirms` doubles as the janitor for both, so codes and counters do not accumulate.
- `confirmed_method` is `code | learner | auto | force`, and **nullable on purpose**: the 47 rows
  completed before this existed predate the distinction, and backfilling them to `'learner'` would
  be a guess. Read null as "before this feature" — `BookingCard` renders nothing for it.
- **All three ledger-writing paths copy the `payment_type = 'token'` branch verbatim.** A swap that
  credits a token is a real bug and `flow-test.mjs` cannot catch it, because it books with a token.
  `code-test.mjs` and `auto-confirm-test.mjs` both assert the swap case explicitly.
- `posts_update` is now `partner_id = auth.uid()` only. The author could previously publish their own
  pending post with a direct API call; the UI never offered it, but `README.md:39` claims consent is
  enforced in the database, and now it is.
- The photo is offered at the confirming moment with *Skip* as a peer of the submit button, and it is
  **never** a condition of payment. The list reload waits until that dialog closes — reloading sooner
  moves the booking to *Past*, which unmounts the card and takes the dialog with it.
- Deliberately **not** built: push/email notifications, GPS proof of attendance (in-person
  coordinates are jittered ~500m by design and undoing that would trade a real privacy guarantee for
  a weak signal), ratings, disputes, and a `kind` column on `messages`. `force_complete_booking`
  stays, still `DEV_TOOLS`-gated — it is the reason the demo does not sit through a real clock.

---

## The AI path is live (and how to tell when it is not)

`GROQ_API_KEY` **is** set, and skill-request dedupe answers from the model. `scripts/smoke.mjs`
reports `"source":"ai"` with a real match. Nothing here needs a person right now.

It was down for a day and the handoff blamed the wrong thing, so read this before you repeat that.
The key had been set since 29 Aug; what had actually happened is that Groq retired
`llama-3.3-70b-versatile` and the account lost access — there is no llama chat model on it at all
any more. The call was 404ing with `model_not_found`. It is now `openai/gpt-oss-120b`, chosen off
the account's own `/v1/models` list rather than guessed.

**A missing key and a broken call used to look identical from outside**, because both return
`source: 'unavailable'`. They no longer do — `dedupe` returns a `detail` field with the HTTP status
and body. If the AI path goes quiet, invoke the function and read `detail` before touching the key:

```js
await supabase.functions.invoke('classify-request',
  { body: { mode: 'classify', title: 'fix my bike', description: '', skills } })
// -> { source, reasoning, detail: "groq 404: ...model_not_found..." }
```

The second thing that bites is the **free-tier rate limit**: 8000 tokens per minute, shared. The
prompt used to carry all 65 catalog UUIDs, which cost ~2000 tokens a call — about three requests
before Groq starts refusing with a 429, which is well within what a demo does. The catalog is now
sent as line numbers and the id is mapped back server-side, so the model never round-trips a UUID
and cannot return one that is not in range. There is also one short retry on 429, capped at 3s
because somebody is watching a spinner. Five back-to-back requests now all get a model answer.

`reasoning` stays plain English for the person who asked; `detail` is where the operational cause
goes. Do not merge them.

One consequence worth knowing: if the model ever *is* unreachable, a brand-new skill proposed from
the request dialog lands as `status = 'pending'` instead of `approved`, so it stays out of search.
That is deliberate — a token-overlap miss is not the judgement that earns a place in the catalog.
See *Releasing a stuck skill* below.

---

## Things worth knowing before you touch the code

1. **Never `select *` from `availability_slots`.** `SELECT` on `meeting_url`, `location_text`, `lat`
   and `lng` is revoked from `anon` and `authenticated`, so a bare `*` is a permission error. Read
   slots through `slots_public`, or list columns explicitly — `SLOT_COLS` in `src/lib/api.ts` exists
   for this. Coordinates come only from `slots_in_bounds`, which jitters them ~500m first.

2. **Never `await` a Supabase call inside an `onAuthStateChange` callback.** supabase-js holds a lock
   while the callback runs and the client deadlocks — sign-in silently never resolves. `authStore.init`
   defers the profile load with `setTimeout(..., 0)`; keep it that way. This cost real debugging time.

3. **Bookings are readable only by their two participants.** Any embed that reaches a booking from a
   publicly-readable row will come back `null` for third parties. That is why `posts` carries its own
   `skill_id` rather than joining through `bookings`.

4. **Seed data is generated, not hand-written.** Edit `scripts/gen-seed.mjs`, then
   `node scripts/gen-seed.mjs --reseed > supabase/migrations/<timestamp>_reseed.sql` and push.
   A reseed also needs the GoTrue nullable-token fix afterwards — copy
   `20260829000015_reseed_auth_fix.sql`, or sign-in on seeded accounts fails with
   *"Database error querying schema"*.

5. **`supabase db reset --linked` does not work non-interactively** in this CLI version. Migrations
   are append-only; add a new one instead.

6. **If the globe renders as an empty sphere, suspect the tile worker.** maplibre builds its worker
   URL at runtime, so no bundler emits the file, and it fails silently with nothing in the console.
   `GlobeMap.tsx` imports it with `?worker&url` and sets `maplibreConfig.WORKER_URL`. Keep that line.

7. **A `raise` in a definer RPC rolls back its own writes.** If a function has to refuse *and*
   remember the refusal, the remembering cannot be an `update` — it dies with the exception. See
   `confirm_guard` and the note in *Session confirmation* above. Sequences survive; `create sequence`
   does not, because DDL is transactional too.

8. **`create extension pg_cron` lands in `pg_catalog` on this project**, not `extensions`. The
   Supabase docs snippet with `with schema extensions` is rejected here. `cron.job` is readable and
   `auto-confirm-bookings` should be in it.

9. **Slot times are authored in Sydney local time** in the seed and converted to UTC. Do not go back
   to bare `now() + interval` or the demo calendar reads as 1am sessions.

---

## Checks to run before you trust a change

```bash
npm run build          # typecheck + bundle
node scripts/smoke.mjs # auth, RLS, masked view, realtime tables, Edge Function
node scripts/flow-test.mjs   # book → reveal → complete → refund, against the live database

# Session confirmation. The last three need `npm run dev` running.
node scripts/auto-confirm-test.mjs   # the 48h sweep, idempotence, the swap case
node scripts/consent-test.mjs        # only the partner may publish a post
node scripts/code-test.mjs           # the five refusals, then the happy path
node scripts/inperson-test.mjs       # two browser contexts, teacher shows → learner types
node scripts/badge-test.mjs          # the Sessions badge appears and clears
node scripts/qr-test.mjs             # the QR payload and the deep link
```

**Run the confirmation suites one at a time.** They share one fixture namespace (`fixtures.mjs`
tags its slots and `cleanup()` deletes everything tagged), so two at once and each one's cleanup
deletes the other's rows mid-run. That is not a product bug and chasing it as one wastes an hour.

`flow-test.mjs` writes real bookings as Sam and **costs him a net token every run**. He hit zero on
29 Aug and it failed with *"insufficient tokens"* until he was topped up through the ledger. If it
fails that way again, that is why — and a learner on zero cannot book in the demo either, so it is
worth checking before a rehearsal.

The confirmation suites clean up after themselves, including putting back the token balances they
moved: the ledger trigger only fires on insert, so deleting a test ledger row would otherwise leave
`profiles.token_balance` high.

`scripts/dbq.mjs` runs SQL through `supabase db query -f`, which is how the tests reach states no
client API can produce — a held booking already past its deadline, a session that started 90 minutes
ago. It is test scaffolding; nothing in `src/` imports it.

---

## What is left, in the order I would do it

### Before the demo (highest value first)

1. **Rehearse the demo twice.** The script in `IMPLEMENTATION_PLAN.md` §9 works as written, with one
   caveat: step 6 says "force-complete, teacher earns a token", but the demo booking is a **swap**,
   and swaps correctly move no tokens. Either say "no tokens move, that is the point", or book a
   token session first and force-complete that one. Decide which and rehearse it.

   There is now a better option for step 6: book a **token** session on an **in-person** slot, and
   confirm it with the code. The teacher's screen shows six digits and a QR, the learner scans or
   types, and the token moves in one action with no `held` step in between. It films better than
   force-complete and it is the real path rather than a shortcut. It needs the session to have
   started — the reveal button is gated on that — so seed the slot in the recent past.
   Do **not** claim it is fraud-proof; the honest line is that it makes confirming in person the
   easy path.

   Sam needs a non-zero token balance for any of this. Check before you rehearse.
2. **Fill in the contributions table** at the bottom of `README.md` — Devpost scores it.
3. **Record the 3-minute video.**
4. **Keep pushing, and make the repo public.** `origin` is
   `Daniel-Devkota/Binary-Budget-Coders-BBC-2026-Hackathon`; as of 30 Aug `main` is level with it.
   Judges score version history, so keep committing in small steps rather than one dump at the end.

### Nice to have, in rough value order

- **Exclude existing partners from "perfect swaps"** — Maya still sees Sam after they have a
  confirmed swap. One `not in` against current bookings in `perfect_swaps`.
- **Empty-state polish on `/search`** when filters return nothing but the platform is not empty —
  currently it always offers "request this skill", which is right for a genuinely missing skill and
  slightly off for an over-filtered search.
- **`prefers-reduced-motion` audit beyond the hero** — the CSS blanket rule covers transitions, but
  worth a manual pass.
- **Keyboard trap check on the booking dialog** — Radix handles it, but nobody has tested with a
  keyboard only.
- **Real photos in the feed.** Everything is generated block art right now, which is honest and looks
  designed, but one or two real consented photos would sell the social feature harder.
- The rest of the P2/parked list in the plan: group sessions, ratings, recurring slots. (The map and
  session confirmation have since shipped.)

---

## Releasing a stuck skill

When someone posts a request that matches nothing, the Edge Function creates the skill for them. If
the AI answered, the skill goes live immediately. If the AI was unreachable, it lands `pending` and
is invisible in search, profile pickers and the request combobox — a token-overlap miss is not the
judgement that earns a place in the catalog.

There is deliberately no admin UI. Look at what is waiting, then release it by hand:

```sql
select s.id, s.name, s.slug, c.name as category, s.created_at
  from public.skills s
  join public.skill_categories c on c.id = s.category_id
 where s.status = 'pending'
 order by s.created_at desc;

-- release one, once you have read it
update public.skills set status = 'approved' where slug = '<slug>';
```

Run it in the Supabase SQL editor. This should be a rare path: the normal case is the AI clearing
the skill at post time.

---

## Repository map

```
HANDOFF.md               this file — start here
IMPLEMENTATION_PLAN.md   the original plan — still accurate; demo script in §9
README.md                submission-ready; contributions table needs filling in
src/
  components/ui/         button, card, dialog, toast, tabs … the block design system
  components/domain/     slot cards, skill pills, person rows, block art
  components/layout/     app shell and navigation
  features/              auth, home, search, skills, profile, booking, messaging, requests, feed
  lib/                   supabase client, typed query layer (api.ts), formatting, useAsync
  stores/authStore.ts    session + profile + lazy weekly grant
supabase/
  migrations/            schema, RLS, RPCs, storage, generated seed — 9 files, all applied
  functions/             classify-request (Deno, deployed)
scripts/                 gen-seed.mjs, smoke.mjs, flow-test.mjs, the confirmation suites
                         (dbq.mjs and fixtures.mjs are their shared scaffolding)
```

Design tokens live in `src/index.css` under `@theme` — palette, type, the `.block-card` primitive.
Change the brand there and in `src/lib/constants.ts` (`APP_NAME`) plus `public/block.svg`.
