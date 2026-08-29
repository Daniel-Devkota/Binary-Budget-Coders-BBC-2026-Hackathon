# Plan — Session confirmation

**Status:** draft for review · **Date:** 30 Aug 2026 · **Surface:** `/bookings`, booking RPCs, `posts`

---

## 0. TL;DR

Completing a session takes **two people making two unprompted return visits to the app**, and one of
the two things the UI promises does not exist.

The teacher must remember to reopen `/bookings` after the start time and press *Session happened*
(`BookingCard.tsx:114`, gated on `past`). The learner must independently remember to reopen it and
press *Yes, it happened* (`:119`). Only then does the token move. Nothing notifies either of them.
Meanwhile the card tells the teacher "Auto-confirms in 48 hours" (`:127`) — and nothing reads
`auto_confirm_at`. There is no cron, no scheduled function, no sweep. Grep it: the column is written
by `mark_session_held` (`rls_and_rpcs.sql:256`) and rendered in the card, and that is the entire
lifetime of the value. A booking left in `held` sits there forever and the teacher is never paid.

In-person and online run the byte-identical path, which wastes the one thing that makes in-person
easy to confirm: **the two people are standing next to each other**. That is the only moment when
confirmation costs nobody anything, and we currently ask them to do it later, separately, from memory.

Three changes: a **confirm code** the learner enters while they are still together, which collapses
both steps into one tap; a **real auto-confirm** so the teacher gets paid whether or not the learner
ever acts; and moving the session photo to the confirming moment, where it is natural, while keeping
it strictly optional and never a condition of payment.

The one genuine security surface is the code itself: it must be unreadable by the learner until they
are in the room. That rules out a column on `bookings`, because `BOOKING_SELECT` is a bare `*`
(`api.ts:19`) and revoking a column would break it — the exact trap documented as pitfall #1 in
`HANDOFF.md`. It goes in a side table with RLS on and no policy, reachable only through
`security definer` RPCs, which is how every other state transition in this codebase already works.

---

## 1. Decisions

Marked `PROPOSED` — these are my calls, not yours yet. **D2 and D6 are the two worth a real nod**
before anyone writes code; the rest can proceed unless you say otherwise.

| # | Question | Decision | Why |
|---|---|---|---|
| **D1** `PROPOSED` | Who presents the code and who enters it? | Teacher presents, **learner enters** | The token flows learner → teacher, so the payer attests. A teacher who could self-confirm could pay themselves |
| **D2** `PROPOSED` ⚠ | Does the code path apply to online sessions too? | **In-person only.** Online keeps the two-step attestation | Co-presence is the whole premise. Two people on a video call can read a code aloud, so it proves nothing there, and pretending otherwise is worse than not having it |
| **D3** `PROPOSED` | Static per-booking code, or rotating? | **Static**, generated on first reveal, revealed to the teacher only from 15 minutes before the slot | A rotating code needs clock-sync handling for a threat model we do not have. The realistic failure is forgetting, not fraud |
| **D4** `PROPOSED` | Does a code confirmation still pass through `held`? | No — `confirmed` → `completed` in one call, stamping `held_at` and `confirmed_at` together | `held` exists to park a booking while it waits on the learner. With the learner standing there, there is nothing to wait for |
| **D5** `PROPOSED` | Where does the code live? | New `session_codes` table, RLS enabled, **no policies at all** | A column on `bookings` would force a `select *` revoke and break `BOOKING_SELECT` (`api.ts:19`). No-policy RLS means nobody reads it directly and both RPCs must be `security definer` |
| **D6** `PROPOSED` ⚠ | How does auto-confirm actually run? | `pg_cron` every 15 minutes, **plus** an idempotent sweep called opportunistically from `/bookings` load | Cron is the right answer; the lazy call is insurance, because if `pg_cron` cannot be scheduled from a CLI migration on this project we find out at demo time otherwise. The sweep function is one unit either way |
| **D7** `PROPOSED` | Does the learner get notified when a session is marked held? | Badge on the **Sessions** nav item, same shape as `unread` and `requestActivity` (`AppShell.tsx:69-76`) | Both badge patterns already exist and cost one hook. Anything outside the app is a non-goal |
| **D8** `PROPOSED` | Do we auto-post a "confirm this" system message into the chat thread? | **No** | `messages` has no `kind` column (`init.sql:135-142`), so it would have to be sent as `sender_id = teacher`, which puts words in a real person's mouth. Not worth a schema change |
| **D9** `PROPOSED` | Does the photo gate payment? | **Never** | Requiring a photo of yourself with a stranger to get paid is a privacy trap. It is offered at the moment it is natural and it is skippable with one tap |
| **D10** `PROPOSED` | Does `force_complete_booking` stay? | Yes, unchanged, still `DEV_TOOLS`-gated | It is the reason the demo does not have to sit through a real clock. Removing it to look principled would cost a rehearsal |

**Consequence of D2 worth stating up front:** after this, in-person and online are genuinely
different flows for the first time. That is the point — but it means `BookingCard` branches on
`booking.slot.mode`, and every "what happens next" string has two versions.

---

## 2. What it does

**Today.** The session ends. Later — hours, maybe days — the teacher remembers, opens the app, finds
the booking under *To confirm*, presses *Session happened*. The learner, with no prompt of any kind,
eventually opens the app, finds the same booking, presses *Yes, it happened*. The token moves. If
the learner never opens the app, the teacher is never paid, and the card's promise that it
auto-confirms in 48 hours never comes true.

**After.**

- **In-person.** As the session wraps up, the teacher's card shows a large 6-digit code (and a QR of
  the same thing). The learner opens their card, taps *Confirm session*, types the six digits. Done —
  one tap each, while they are still standing together, and the token moves immediately. Right after,
  the learner is offered the photo dialog, prefilled, with *Skip* as an equal-weight option.
- **Online.** The existing two-step stays, but the learner now gets a badge on **Sessions** the
  moment the teacher marks it held, so the second step is prompted rather than remembered.
- **Either way**, if the learner never acts, auto-confirm genuinely fires 48 hours after `held_at`
  and the teacher is paid. The card's promise becomes true.
- The code cannot be seen by the learner in advance, and cannot be seen by the teacher until 15
  minutes before the session starts.

---

## 3. Functional requirements

| # | Priority | Requirement | Accepted when |
|---|---|---|---|
| **FR1** | MUST | An in-person booking can be completed in one action by the learner while co-present | Learner enters the code on a `confirmed` in-person booking; status reads `completed`, `held_at` and `confirmed_at` are both set, token ledger has one `teach_earn` row |
| **FR2** | MUST | The code is not readable by the learner before confirmation | A learner calling the reveal RPC gets an exception; a direct `select` on `session_codes` returns zero rows for both participants |
| **FR3** | MUST | The code is not readable by the teacher before the session | Calling the reveal RPC more than 15 minutes before `starts_at` raises, and writes no row |
| **FR4** | MUST | A wrong code fails without side effects | Booking still `confirmed`, no ledger row, an attempt counter increments |
| **FR5** | MUST | Repeated wrong codes stop being accepted | After 5 failures the RPC refuses until `starts_at + 24h`, and the card says so |
| **FR6** | MUST | Auto-confirm actually completes held bookings after 48 hours | A booking with `auto_confirm_at` in the past reads `completed` after the sweep runs, with the teacher credited exactly once |
| **FR7** | MUST | The sweep is idempotent and safe to call from anywhere | Calling it twice in a row produces no second ledger row; calling it as any authenticated user is harmless |
| **FR8** | MUST | Confirmation records how it happened | `bookings.confirmed_method` reads one of `code`, `learner`, `auto`, `force` on every newly completed booking |
| **FR9** | SHOULD | The learner is prompted when a session needs their confirmation | Sessions nav item carries a count of bookings held-awaiting-me plus past-unconfirmed; it clears on visiting `/bookings` |
| **FR10** | SHOULD | The photo is offered at the confirming moment, not discovered later | A successful confirmation opens `ConsentPostDialog` prefilled, with a visually equal *Skip* |
| **FR11** | SHOULD | Only the partner can publish a pending post | `posts_update` restricted to `partner_id = auth.uid()`; the author calling it is rejected |
| **FR12** | SHOULD | Online bookings are unaffected by the code path | An online booking shows no code UI and completes exactly as it does today |
| **FR13** | COULD | The code can be scanned instead of typed | QR encodes `/bookings?confirm=<booking_id>&c=<code>`; opening it on the learner's phone prefills the dialog |
| **FR14** | COULD | The outcome shows how it was confirmed | Past card reads "Confirmed in person" / "Confirmed later" / "Auto-confirmed" |

---

## 4. Technical approach

### 4.1 How it works today

```
BookingCard (status=confirmed, iAmTeacher, past)
   └─ markHeld() ──> mark_session_held()      teacher only, requires 'confirmed'
                       └─ status='held', held_at=now(), auto_confirm_at=now()+48h
                                                              │
BookingCard (status=held, !iAmTeacher)                        │  ← nothing ever reads this
   └─ completeBooking() ──> complete_booking()  learner only, requires 'held'
                       └─ status='completed', confirmed_at=now(), +1 token if payment_type='token'

BookingCard (status=completed)
   └─ "Share this session" ──> ConsentPostDialog ──> posts(status='pending_consent')
                                                       └─ partner publishes from FeedPage:36
```

Both timers are decorative and both steps are unprompted. `force_complete_booking`
(`rls_and_rpcs.sql:283`) short-circuits the whole thing for demos and is UI-gated by `DEV_TOOLS`.

### 4.2 Schema

One migration, append-only (pitfall #5 in `HANDOFF.md` — never `db reset --linked`).

```sql
-- Where the confirm code lives. RLS on, deliberately NO policies, so the only
-- way in or out is through the two security-definer functions below.
create table public.session_codes (
  booking_id  uuid primary key references public.bookings on delete cascade,
  code        text not null,
  revealed_at timestamptz not null default now(),
  attempts    smallint not null default 0
);
alter table public.session_codes enable row level security;

-- How a completed booking got confirmed.
alter table public.bookings
  add column confirmed_method text
    check (confirmed_method in ('code','learner','auto','force'));
```

`confirmed_method` is nullable on purpose: existing completed rows predate it, and backfilling them
to `'learner'` would be a guess. Read null as "before this feature".

**Do not** put the code on `bookings`. `BOOKING_SELECT` is a bare `*` (`api.ts:19`), and a
column-level revoke there is the documented way to break this app.

### 4.3 RPCs

All `security definer set search_path = public`, matching the existing file.

**`reveal_session_code(p_booking_id uuid) returns text`**

- caller must be `teacher_id`, else raise
- booking must be `confirmed`, and its slot `mode = 'in_person'` (join `availability_slots`), else raise
- `now() >= starts_at - interval '15 minutes'`, else raise — this is FR3, and it is the only thing
  stopping a teacher from texting the code the day before
- upsert `session_codes` with a 6-digit code on first call and return the existing one thereafter,
  so the teacher can close and reopen the card without the code changing under the learner

**`confirm_session_with_code(p_booking_id uuid, p_code text) returns void`**

- caller must be `learner_id`, else raise
- `select ... for update` on the booking and the code row
- if `attempts >= 5` and `now() < starts_at + interval '24 hours'`, raise (FR5)
- on mismatch: `attempts = attempts + 1`, then raise. **No status change, no ledger write** (FR4)
- on match: `status='completed'`, `held_at = coalesce(held_at, now())`, `confirmed_at = now()`,
  `confirmed_method='code'`, and the `teach_earn` ledger insert **only when `payment_type='token'`** —
  copy that branch verbatim from `complete_booking` (`rls_and_rpcs.sql:274-278`) rather than
  reimplementing it. Swaps move no tokens, and that is correct, not an oversight
- delete the `session_codes` row on success

**`run_auto_confirms() returns integer`**

- no auth check; safe for anyone to call, because it only advances bookings that already earned it
- `update bookings set status='completed', confirmed_at=now(), confirmed_method='auto'
   where status='held' and auto_confirm_at <= now() returning ...`, then insert ledger rows for the
  returned set where `payment_type='token'`
- the `where status='held'` predicate inside the same statement is what makes it idempotent (FR7) —
  a second run matches nothing
- return the count, so a sweep is observable from the SQL editor

Also amend `complete_booking` and `force_complete_booking` to stamp `confirmed_method` as `'learner'`
and `'force'`. Two lines each, no behaviour change.

### 4.4 Auto-confirm scheduling

```sql
create extension if not exists pg_cron with schema extensions;
select cron.schedule('auto-confirm-bookings', '*/15 * * * *', $$select public.run_auto_confirms()$$);
```

**If that fails in the migration** — and it is the single most likely thing in this plan to fail,
since `pg_cron` may need enabling from the Supabase dashboard before a migration can schedule against
it — do not fight it. The fallback is already in the design: `fetchMyBookings` fires
`supabase.rpc('run_auto_confirms')` without awaiting it, before its own query. Every visit to
`/bookings` sweeps.

Ship the lazy call **regardless** of whether cron works. It is one indexed no-op query per page load,
and it is the thing that makes the card's promise true during a demo.

### 4.5 Client

**`api.ts`** — three thin wrappers beside `markHeld` (`api.ts:277-290`): `revealSessionCode`,
`confirmWithCode`, `runAutoConfirms`. Same `const { error } = await supabase.rpc(...)` shape as their
neighbours.

**`BookingCard.tsx`** — the action branch becomes this table. Build from it rather than adding
conditionals one at a time.

| status | mode | who | shows |
|---|---|---|---|
| `confirmed`, past | `in_person` | teacher | *Show confirm code* → big code + QR |
| `confirmed`, past | `in_person` | learner | *Confirm session* → 6-digit input |
| `confirmed`, past | `online` | teacher | *Session happened* (unchanged) |
| `held` | either | learner | *Yes, it happened* (unchanged) |
| `held` | either | teacher | "Auto-confirms {date}" — now true |
| `completed` | either | both | outcome line per FR14, plus *Share this session* |

Keep the existing `past` gate on the reveal button. The 15-minute window is enforced in the RPC
(FR3); the UI gate is a courtesy and the two deliberately disagree. Do not "fix" that by moving the
window client-side.

**New `ConfirmCodeDialog.tsx`** in `src/features/booking/` — one 6-digit input, inline error text for
both the wrong-code and locked-out cases, and on success close and immediately open
`ConsentPostDialog` (FR10) with *Skip* rendered as a peer of the submit button, not as a dismissal
`×`.

**New `useSessionActivity.ts`** — clone `useRequestActivity.ts` nearly verbatim; it already has the
`localStorage` seen-marker, the `SEEN_EVENT` dispatch and the re-read on `location.pathname`. Count =
bookings where I am the learner and (`status='held'` or `status='confirmed'` with a slot that has
started). Wire into `AppShell.tsx` beside `unread` and `requestActivity`.

**FR13 (QR)** adds one dependency: `qrcode.react`, ~10KB, renders SVG with no canvas. The deep link
is handled by reading `?confirm=` and `?c=` in `BookingsPage` and opening the dialog prefilled — no
new route and no new `RequireAuth` wrapper.

### 4.6 The consent-post hole

`posts_update` (`rls_and_rpcs.sql:454`) reads
`using (author_id = auth.uid() or partner_id = auth.uid())`, so the **author** can publish their own
pending post with a direct API call. The UI never offers it, which is why nobody has noticed. Tighten
to `using (partner_id = auth.uid())`, and add a separate author-delete path later if one is wanted.

Two lines, and it is the difference between "consent enforced in the database" and "consent enforced
in the dialog" — and `README.md:39` claims the former.

---

## 5. Phases

**Phase 1 — Auto-confirm.** `run_auto_confirms()`, the cron schedule, the lazy call in
`fetchMyBookings`, `confirmed_method` on the three existing RPCs. *Done when* a booking with
`auto_confirm_at` backdated by hand completes on its own, and the teacher's balance moves exactly
once across two consecutive runs. **No UI work at all.** Independent of everything else, fixes an
outright false statement in the interface, and is the highest value per line in this document.
Ship it first.

**Phase 2 — Codes, server side.** The migration, `reveal_session_code`,
`confirm_session_with_code`. *Done when* the whole flow is drivable from the SQL editor — teacher
reveals, learner confirms, token moves — and each of the five refusals (wrong caller, wrong status,
too early, wrong code, locked out) raises rather than silently no-ops. Depends on nothing.

**Phase 3 — Codes, client side.** The `api.ts` wrappers, the `BookingCard` branch table,
`ConfirmCodeDialog`. *Done when* two browser contexts complete an in-person booking end to end
without either of them ever seeing `held`, and an online booking is visibly unchanged. Needs Phase 2.

**Phase 4 — Photo at the moment.** Auto-open `ConsentPostDialog` on success with an equal-weight
*Skip*, plus the `posts_update` tightening. *Done when* confirming offers the photo, skipping costs
one tap, and the author can no longer publish their own post from the API. The RLS half is
independent and can ride along with Phase 1.

**Phase 5 — Sessions badge.** `useSessionActivity`, wired into `AppShell`. *Done when* the badge
appears for the learner the moment the teacher marks held, and clears on visiting `/bookings`.
Needs Phase 1 only.

**Phase 6 — QR.** `qrcode.react`, the deep link, the query-param handler. *Done when* scanning the
teacher's screen opens the learner's confirm dialog prefilled. Fully droppable.

**Cut line: Phases 1–3 are the demo.** Phase 1 alone is worth shipping even if nothing else is.
4 and 5 are polish; 6 films well and does nothing the typed code does not.

---

## 6. Risks and non-goals

| Risk | Mitigation |
|---|---|
| `pg_cron` cannot be scheduled from a CLI migration on this project | The lazy sweep from `fetchMyBookings` (§4.4) ships unconditionally and covers it. Find this out in Phase 1, not on demo day |
| The teacher texts the code and they confirm apart | Accepted. The 15-minute reveal window narrows it. The honest framing is that this makes co-presence the easy path, not that it makes remote confirmation impossible — **do not claim it is fraud-proof in the demo** |
| A third RPC that writes the ledger diverges from the other two | All three must copy the `payment_type='token'` branch verbatim from `complete_booking:274-278`. A swap that credits a token is a real bug, and `flow-test.mjs` will not catch it because it books with a token |
| `run_auto_confirms` double-credits under concurrent calls | The `where status='held'` predicate lives in the same statement as the update, so the transition is atomic, and the ledger insert reads from `returning` — it can only see rows this statement actually moved |
| The lazy sweep runs on every `/bookings` load | One indexed predicate over `status='held'`, returning nothing almost always. The `(learner_id, status)` and `(teacher_id, status)` indexes already exist (`init.sql:92-93`) |
| Splitting in-person from online doubles the strings in `BookingCard` | Real cost, accepted. §4.5's branch table is the spec |
| Tightening `posts_update` breaks a decline path | `setPostConsent` (`api.ts:443`) has exactly one caller, `FeedPage.tsx:128`, which is the partner's consent card. Verified this session — re-check before merging |
| `session_codes` with no policies looks like an omission to the next reader | Comment it in the migration. RLS-on-with-no-policy is the intent |

**Non-goals.** Push notifications, email, or anything outside the app. Geofencing or GPS proof —
in-person coordinates are jittered ~500m by design (`map_slots_in_bounds.sql:42`), and undoing that
to verify attendance trades a real privacy guarantee for a weak signal. Ratings or reviews. Disputes:
if two people disagree about whether a session happened there is no adjudication, and at this scale
there should not be one. Photo as proof of attendance (D9). A `kind` column on `messages` (D8). Any
change to how swaps settle. Removing `force_complete_booking` (D10).

---

## Grounding

**Read:** `src/features/booking/BookingCard.tsx` (whole file — the action block at 112-150 is what
changes), `BookingsPage.tsx:20-30`; `src/lib/api.ts:8-25, 241-290, 437-450`;
`src/features/feed/ConsentPostDialog.tsx`, `FeedPage.tsx:36, 128`;
`src/features/requests/useRequestActivity.ts` (the template for Phase 5);
`src/components/layout/AppShell.tsx:20-80`; `src/App.tsx:57-75`;
`supabase/migrations/20260829000001_init.sql:56-94, 125-168`;
`supabase/migrations/20260829000002_rls_and_rpcs.sql:35-51, 244-307, 448-456`.

**Verified this session:** nothing anywhere reads `auto_confirm_at` except the card's label; the only
`screenshot` match in the repo is an unrelated line in `previous-chats/recording_method.txt`;
`fetchPendingConsent` and `setPostConsent` have exactly one caller each; no `create extension`
statement exists in any migration.

**Assumed, not verified:**

- That `pg_cron` is available on this Supabase plan and grantable from a migration. **Check before
  starting — Phase 1 is built around it.**
- That `scripts/smoke.mjs` and `scripts/flow-test.mjs` do not assert on the exact column list of
  `bookings`; adding `confirmed_method` would break such an assertion. Neither script was read.
- That `flow-test.mjs` drives `complete_booking` rather than `force_complete_booking` — it matters,
  because the `confirmed_method` stamp differs.
- That no seed row sits in `held`, which the new sweep would silently complete on first run and
  change the demo data underneath you.
- That `qrcode.react` (FR13) is acceptable as a new dependency. It is the only one this plan adds.
- That the demo script in `IMPLEMENTATION_PLAN.md` §9 does not narrate the current two-step
  confirmation word for word. If it does, it needs rewriting alongside Phase 3.
