# Handoff — Skill Up (SYNCS Hack 2026)

Written at the end of the first build session. Read this plus `IMPLEMENTATION_PLAN.md`
and you have everything.

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

---

## The one thing that still needs a person

**Set the Groq key** so skill-request dedupe uses the model instead of the local heuristic:

```bash
npx supabase secrets set GROQ_API_KEY=<key from console.groq.com>
npx supabase functions deploy classify-request
```

The function talks to Groq (`llama-3.3-70b-versatile`); the Gemini path is gone. Nothing breaks
without the key — `scripts/smoke.mjs` reports *"Catalog matching is running without the AI service
configured"*, and the client falls back to token overlap. But it is a visible AI feature for judging.

One consequence worth knowing: with the key missing, a brand-new skill proposed from the request
dialog lands as `status = 'pending'` instead of `approved`, so it stays out of search. See
*Releasing a stuck skill* below.

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

7. **Slot times are authored in Sydney local time** in the seed and converted to UTC. Do not go back
   to bare `now() + interval` or the demo calendar reads as 1am sessions.

---

## Checks to run before you trust a change

```bash
npm run build          # typecheck + bundle
node scripts/smoke.mjs # auth, RLS, masked view, realtime tables, Edge Function
node scripts/flow-test.mjs   # book → reveal → complete → refund, against the live database
```

`flow-test.mjs` writes real bookings as Sam. That is fine — it makes the data look lived-in — but be
aware it is not read-only.

---

## What is left, in the order I would do it

### Before the demo (highest value first)

1. **Set `GEMINI_API_KEY`** — see above.
2. **Rehearse the demo twice.** The script in `IMPLEMENTATION_PLAN.md` §9 works as written, with one
   caveat: step 6 says "force-complete, teacher earns a token", but the demo booking is a **swap**,
   and swaps correctly move no tokens. Either say "no tokens move, that is the point", or book a
   token session first and force-complete that one. Decide which and rehearse it.
3. **Fill in the contributions table** at the bottom of `README.md` — Devpost scores it.
4. **Record the 3-minute video.**
5. **Push to GitHub and make the repo public.** `origin` is
   `Daniel-Devkota/Binary-Budget-Coders-BBC-2026-Hackathon`, and `main` is **6 commits ahead** of it —
   nothing from this session has been pushed. Judges score version history, so push early and keep
   pushing. `git push origin main`.

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
- The whole P2/parked list in the plan: map, group sessions, ratings, recurring slots.

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
IMPLEMENTATION_PLAN.md   the original plan — still accurate
README.md                submission-ready; contributions table needs filling in
HANDOFF.md               this file
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
scripts/                 gen-seed.mjs, smoke.mjs, flow-test.mjs
```

Design tokens live in `src/index.css` under `@theme` — palette, type, the `.block-card` primitive.
Change the brand there and in `src/lib/constants.ts` (`APP_NAME`) plus `public/block.svg`.
