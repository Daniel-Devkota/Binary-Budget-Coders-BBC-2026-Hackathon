# Skill Up — trade the skills you have for the skills you want

**SYNCS Hack 2026 · theme: blocks that make up the world**

**Live:** https://blocks-syncs.vercel.app
**Demo login:** `maya@blocks.demo` / `blocks1234` (and `sam@blocks.demo`, same password —
the two are a perfect swap for each other)

---

## The idea

Everyone already knows something worth teaching, and almost nobody gets to trade it. Someone three
streets away wants the thing you already know how to do, and neither of you has any way to find
the other — because the only tool we have for trading skills is money, and money is exactly what
makes it not worth anyone's while for one hour.

Skill Up connects those people directly. You publish what you can teach and what you want to learn.
Tutors publish open hours. A learner books an hour either with **one token** or with a **swap** —
I teach you guitar, you teach me Spanish, and nothing but time changes hands. The platform finds
the perfect swaps for you automatically: the people who teach what you want *and* want what you teach.

### The economy, in one line

You start with two tokens and collect one a week, **capped at five**. Hoarding is impossible on
purpose, so teaching is the only real way to keep learning. That constraint is the product.

---

## Features

| | |
|---|---|
| **Perfect swap matching** | A self-join over the teach/learn graph surfaces every two-way match. One click opens a pre-filled proposal. |
| **Token economy** | Signup grant, lazily-computed weekly top-up, escrow on booking, refund on cancellation, credit on completion. Every movement goes through a `SECURITY DEFINER` RPC; the ledger is the source of truth. |
| **Swap bookings** | Accepting a proposal creates two linked bookings that share a `swap_group_id`. Cancelling either half cancels both and reopens both hours. |
| **Availability and booking** | Publish 60-minute hours as online or in person; book with a token or propose a swap. |
| **Completion flow** | Teacher marks the session held, learner confirms, teacher is credited. Auto-confirms after 48 hours. |
| **Privacy by construction** | Meeting links and meeting points are invisible until a booking is confirmed — enforced with column-level grants and a definer view, not with UI conditionals. |
| **Realtime messaging** | 1-1 chat over Supabase Realtime with unread badges. No booking gate: you can ask before you commit. |
| **Skill requests** | Ask for something nobody teaches yet. An Edge Function matches the request against the catalog so it reaches the right tutors; it degrades to a local heuristic when the AI service is unavailable. |
| **Consent-gated feed** | A session post is invisible until *both* people approve it. Nobody's photo goes public unilaterally. |
| **Follows** | Follow people whose skills interest you; their shared sessions appear in your feed. |
| **The globe** | `/map` opens on a 3D globe, dives into your city, and resolves into individual bookable sessions. Pins are jittered ~500m inside the database — the browser is never sent a real coordinate. |

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 · Vite · TypeScript |
| Styling | Tailwind CSS v4 with hand-built primitives on an 8px block grid |
| State | Zustand for auth/session; direct Supabase calls for server data |
| 3D | react-three-fiber + drei — landing hero only, lazy chunk, static fallback, disabled under `prefers-reduced-motion` |
| Maps | MapLibre GL (globe projection) + react-map-gl, OpenFreeMap tiles — lazy chunk, no API key |
| Backend | Supabase (Postgres 17, Auth, Realtime, Storage, RLS) in `ap-southeast-2` |
| Server logic | Supabase Edge Functions (Deno) — only where a secret is involved |
| Hosting | Vercel |

---

## Security model

RLS is on for **every** table. The guiding rule: authenticated users read broadly, write only their
own rows, and no client ever writes a token.

- **Tokens** — `token_ledger` has no client insert policy at all. `book_slot_with_token`,
  `cancel_booking`, `complete_booking` and the weekly grant are `SECURITY DEFINER` functions that
  lock the row, check the invariant, and write the ledger. A trigger keeps `profiles.token_balance`
  in sync with the ledger, which is the actual source of truth.
- **Meeting details** — `SELECT` on `availability_slots.meeting_url`, `.location_text`, `.lat` and
  `.lng` is revoked from `anon` and `authenticated`, so `select *` on the base table is a permission
  error. Clients read `slots_public`, a definer view that returns those columns only when the viewer
  is the teacher or holds a confirmed booking. This is enforced in the database, so it holds for anyone with the
  publishable key and curl.
- **Map coordinates** — the globe reads `slots_in_bounds`, the only path to `lat`/`lng`, and it
  jitters every point ~500m before returning it. The offset is derived from the slot id, so a pin
  never wanders between refetches and cannot be averaged out over repeated requests.
- **Realtime** — RLS applies to the replication stream, so the `messages` policy is what makes live
  chat both work and stay private.
- **Keys** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are safe in the browser and in
  git; RLS is what protects the data. The secret key and `GEMINI_API_KEY` exist only as Edge Function
  secrets and are never committed.

---

## Running it locally

```bash
npm install
cp .env.example .env      # fill in your Supabase project URL and publishable key
npm run dev
```

Applying the schema and seed to a fresh Supabase project:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
npx supabase functions deploy classify-request
npx supabase secrets set GEMINI_API_KEY=...   # optional; the feature degrades without it
```

Seed data is generated, not hand-written — edit `scripts/gen-seed.mjs` and regenerate:

```bash
node scripts/gen-seed.mjs --reseed > supabase/migrations/<timestamp>_reseed.sql
```

Checks:

```bash
node scripts/smoke.mjs      # auth, RLS, the masked view, realtime tables, the Edge Function
node scripts/flow-test.mjs  # book → reveal → complete → refund, against the live database
npm run build
```

---

## Repository layout

```
src/
  components/ui/       button, card, dialog, toast … the block design system
  components/domain/   slot cards, skill pills, person rows
  components/layout/   the app shell and navigation
  features/            one directory per surface: auth, home, search, skills, profile,
                       booking, messaging, requests, feed, map
  lib/                 supabase client, the typed query layer, formatting, helpers
  stores/              zustand auth store
supabase/
  migrations/          schema, RLS, RPCs, storage, generated seed
  functions/           classify-request (Deno)
scripts/               seed generator and live-database test scripts
```

---

## Third-party attributions

- [Supabase](https://supabase.com) — Postgres, Auth, Realtime, Storage, Edge Functions
- [React](https://react.dev), [Vite](https://vite.dev), [TypeScript](https://typescriptlang.org)
- [Tailwind CSS](https://tailwindcss.com) — styling
- [Radix UI](https://radix-ui.com) — accessible dialog, tabs and select primitives
- [lucide](https://lucide.dev) — icon set (ISC)
- [three.js](https://threejs.org), [react-three-fiber](https://r3f.docs.pmnd.rs),
  [drei](https://drei.docs.pmnd.rs) — the landing hero
- [MapLibre GL JS](https://maplibre.org) and [react-map-gl](https://visgl.github.io/react-map-gl/) —
  the globe (BSD-3-Clause / MIT)
- [OpenFreeMap](https://openfreemap.org) vector tiles, © [OpenMapTiles](https://openmaptiles.org),
  data from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- [zustand](https://zustand.docs.pmnd.rs), [date-fns](https://date-fns.org),
  [clsx](https://github.com/lukeed/clsx), [tailwind-merge](https://github.com/dcastil/tailwind-merge)
- Fonts: [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and
  [Inter](https://fonts.google.com/specimen/Inter), both SIL Open Font License
- Skill-request matching uses Google's Gemini API, called only from an Edge Function

All seed people, photos-free profiles, messages and session history are synthetic and generated by
`scripts/gen-seed.mjs`. No real person's data is in this repository.

---

## Contributions

<!-- Fill in before submitting to Devpost. -->

| Person | Contribution |
|---|---|
| | |
