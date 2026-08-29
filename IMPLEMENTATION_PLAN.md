# Implementation Plan — Skill Exchange Platform

**Event:** SYNCS Hack 2026 (24 hours, 29–30 Aug 2026)
**Theme:** *Blocks that make up the world* — connecting underused human blocks: skills, knowledge, time.
**Product name:** `Skill Up` *(set in the `APP_NAME` constant; mark lives in `src/components/brand/Logo.tsx`)*

---

## 1. What we are building

A peer-to-peer skill exchange. People publish the skills they can teach and the skills they want to
learn. Tutors publish availability slots; learners book them. Payment is either **one token** or a
**mutual swap** — I teach you guitar, you teach me Spanish, no tokens move. The platform surfaces
perfect swap pairs automatically.

The pitch line: *every person is a block of knowledge, and most of those blocks are sitting
disconnected. We connect them directly, without money.*

### Scope, in priority order

| Tier | Features | Status |
|---|---|---|
| **P0 — must ship** | Auth, profiles, skill catalog, tutor availability, search, booking (token or swap), swap matching, completion flow, token ledger | Build first |
| **P1 — strongly wanted** | Realtime 1-1 messaging, skill requests with AI dedupe, follows | Build second |
| **P2 — if time** | Social feed with consented photos | Build third |
| **Parked** | Map page, group sessions, ratings/reviews, recurring slots | Route stub only |

**Parked but pre-wired:** profiles carry `city`, `country`, `lat`, `lng` from day one so the map page
drops in later with no migration. `/map` exists as a "coming soon" placeholder so navigation is complete.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | Fast HMR, no framework overhead |
| Routing | React Router v6 | Simple, no SSR needed |
| State | Zustand | Auth/session/token stores; server data via direct Supabase calls |
| Styling | Tailwind CSS + shadcn/ui | Cohesive design fast; 15 design points depend on this |
| 3D | react-three-fiber + drei | **Home hero only.** Lazy-loaded chunk, static gradient fallback |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, RLS) | Auth + storage + realtime free; no server to deploy |
| Server logic | Supabase Edge Functions (Deno) | Only for the Anthropic API call (key must not touch frontend) |
| Hosting | Vercel | Git-push deploys |
| Maps (later) | MapLibre GL + OpenFreeMap tiles | Free, no API key, no card |

**Region:** Supabase `ap-southeast-2` (Sydney) — lowest latency for demo day.

### Key hygiene
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are safe in the frontend and in git. RLS is what protects data.
- `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` live **only** in Edge Function secrets. Never in the frontend, never committed.
- Repo ships `.env.example`; real `.env` is gitignored.

---

## 3. Data model

All timestamps are `timestamptz` stored in **UTC**, rendered in the viewer's local timezone.

### 3.1 Profiles

```sql
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  avatar_url    text,
  bio           text,
  city          text,
  country       text,
  lat           double precision,   -- parked map support
  lng           double precision,
  timezone      text not null default 'Australia/Sydney',
  token_balance int  not null default 2 check (token_balance >= 0),
  last_grant_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
```

`token_balance` is a cached value. The ledger is the source of truth; a trigger keeps them in sync.

### 3.2 Skills

```sql
create table skill_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  slug  text not null unique,
  icon  text                        -- lucide icon name
);

create table skills (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references skill_categories on delete cascade,
  name        text not null,
  slug        text not null unique,
  description text,
  created_by  uuid references profiles,
  status      text not null default 'approved'
              check (status in ('approved','pending')),
  created_at  timestamptz not null default now()
);

create table user_skills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete cascade,
  skill_id    uuid not null references skills on delete cascade,
  kind        text not null check (kind in ('teach','learn')),
  proficiency text check (proficiency in ('beginner','intermediate','advanced','expert')),
  blurb       text,
  created_at  timestamptz not null default now(),
  unique (user_id, skill_id, kind)
);
create index on user_skills (skill_id, kind);
```

`user_skills` with `kind` is the whole matching engine. Keep it clean.

### 3.3 Availability and bookings

```sql
create table availability_slots (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references profiles on delete cascade,
  skill_id     uuid not null references skills,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  mode         text not null check (mode in ('online','in_person')),
  location_text text,               -- in_person: meeting point, revealed post-confirmation
  meeting_url   text,               -- online: Zoom/Meet link, revealed post-confirmation
  lat          double precision,    -- parked map support
  lng          double precision,
  status       text not null default 'open'
               check (status in ('open','booked','cancelled')),
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on availability_slots (skill_id, status, starts_at);
create index on availability_slots (teacher_id, starts_at);

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid not null unique references availability_slots,
  teacher_id     uuid not null references profiles,
  learner_id     uuid not null references profiles,
  skill_id       uuid not null references skills,
  payment_type   text not null check (payment_type in ('token','swap')),
  swap_group_id  uuid,              -- two bookings share this for a swap
  status         text not null default 'confirmed'
                 check (status in ('confirmed','held','completed','cancelled')),
  held_at        timestamptz,       -- teacher marked "session held"
  confirmed_at   timestamptz,       -- learner confirmed
  auto_confirm_at timestamptz,      -- held_at + 48h
  cancelled_by   uuid references profiles,
  created_at     timestamptz not null default now(),
  check (teacher_id <> learner_id)
);
create index on bookings (learner_id, status);
create index on bookings (teacher_id, status);
create index on bookings (swap_group_id);

create table swap_proposals (
  id                uuid primary key default gen_random_uuid(),
  proposer_id       uuid not null references profiles,
  responder_id      uuid not null references profiles,
  responder_slot_id uuid not null references availability_slots,  -- what proposer wants
  proposer_slot_id  uuid not null references availability_slots,  -- what proposer offers
  message           text,
  status            text not null default 'pending'
                    check (status in ('pending','accepted','declined','withdrawn')),
  created_at        timestamptz not null default now()
);
```

### 3.4 Tokens

```sql
create table token_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  delta      int  not null,
  reason     text not null check (reason in
             ('signup_grant','weekly_grant','booking_hold','booking_refund','teach_earn')),
  booking_id uuid references bookings,
  created_at timestamptz not null default now()
);
create index on token_ledger (user_id, created_at desc);
```

A trigger on insert applies `delta` to `profiles.token_balance`. All token movement goes through
`SECURITY DEFINER` RPCs — never a direct client write.

### 3.5 Messaging

```sql
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references profiles on delete cascade,
  user_b          uuid not null references profiles on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  check (user_a < user_b),          -- canonical ordering prevents duplicates
  unique (user_a, user_b)
);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  sender_id       uuid not null references profiles on delete cascade,
  body            text not null check (length(body) between 1 and 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at desc);
```

Realtime replication enabled on `messages`.

### 3.6 Social (P2)

```sql
create table follows (
  follower_id uuid not null references profiles on delete cascade,
  followee_id uuid not null references profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table posts (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings,
  author_id  uuid not null references profiles,
  partner_id uuid not null references profiles,
  caption    text,
  photo_url  text,                  -- Supabase Storage public URL
  status     text not null default 'pending_consent'
             check (status in ('pending_consent','published','declined')),
  created_at timestamptz not null default now()
);
```

A post is visible only at `status = 'published'`, which requires the partner's explicit consent.
No photo of anyone goes public without both people agreeing.

### 3.7 Skill requests (P1)

A learner posts a *wanted* request when nobody teaches what they need. Tutors browse and answer.

```sql
create table skill_requests (
  id                uuid primary key default gen_random_uuid(),
  requester_id      uuid not null references profiles on delete cascade,
  title             text not null,
  description       text,
  resolved_skill_id uuid references skills,   -- AI matched it to an existing skill
  status            text not null default 'pending_review'
                    check (status in ('pending_review','open','fulfilled','rejected')),
  ai_verdict        jsonb,                    -- {decision, reasoning, matched_skill, suggested_category}
  created_at        timestamptz not null default now()
);

create table request_responses (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references skill_requests on delete cascade,
  teacher_id uuid not null references profiles on delete cascade,
  message    text,
  created_at timestamptz not null default now(),
  unique (request_id, teacher_id)
);
```

---

## 4. Business rules

### 4.1 Tokens

| Event | Effect |
|---|---|
| Signup | `+2` (`signup_grant`) |
| Weekly | `+1` (`weekly_grant`), **capped at 5**, computed lazily on login — no cron |
| Learner books with a token | `-1` learner (`booking_hold`) — held in escrow |
| Booking cancelled | `+1` learner (`booking_refund`) |
| Session completed | `+1` teacher (`teach_earn`) |
| Swap booking | No token movement on either side |

The cap at 5 means hoarding is impossible; **teaching is the only real way to earn**. That is the
economic argument in the pitch.

**Lazy weekly grant:** on session load, if `now() - last_grant_at >= 7 days` and `token_balance < 5`,
insert a `weekly_grant` and bump `last_grant_at`. Idempotent, no scheduler to break at 3am.

### 4.2 Booking lifecycle

```
  slot open
     │  learner books (token) ── token held ──┐
     │  learner proposes swap ── teacher accepts ──┘
     ▼
  confirmed  ── meeting link / address now revealed to both
     │  teacher marks "session held"
     ▼
  held  ── learner prompted to confirm; auto-confirms after 48h
     │  learner confirms
     ▼
  completed  ── teacher credited 1 token; both offered a feed post
```

Cancellation is allowed any time before `starts_at`. Cancelling one half of a swap cancels both and
reopens both slots.

**Demo shortcut:** a dev-only `force_complete_booking` RPC, so the completion flow can be shown on
stage without waiting on the clock. Gated behind an env flag.

### 4.3 Swap matching — "Perfect swaps for you"

The headline feature. A self-join finds every user where my wants intersect their teaches **and**
their wants intersect my teaches:

```sql
create or replace function perfect_swaps(p_user uuid)
returns table (partner_id uuid, they_teach uuid, they_want uuid) as $$
  select their_teach.user_id,
         their_teach.skill_id,
         their_want.skill_id
  from user_skills my_want
  join user_skills their_teach
    on their_teach.skill_id = my_want.skill_id and their_teach.kind = 'teach'
  join user_skills their_want
    on their_want.user_id = their_teach.user_id and their_want.kind = 'learn'
  join user_skills my_teach
    on my_teach.skill_id = their_want.skill_id
   and my_teach.user_id = p_user and my_teach.kind = 'teach'
  where my_want.user_id = p_user
    and my_want.kind = 'learn'
    and their_teach.user_id <> p_user;
$$ language sql stable;
```

Rendered on the home page as: *"Bob teaches Spanish (you want it) and wants Guitar (you teach it)."*
One click opens a pre-filled swap proposal.

### 4.4 Messaging access

Anyone whose profile you can see may be messaged. No booking gate — a learner needs to ask
"can you do Thursday instead?" before committing.

### 4.5 Privacy

- `meeting_url` and `location_text` are hidden until a booking is `confirmed`. Enforced in RLS, not just UI.
- Feed photos require both parties' consent before publication.
- In-person slot coordinates will be jittered ~500m when the map ships. Exact point only post-confirmation.

---

## 5. RLS policies

RLS **on for every table**. Guiding rule: authenticated users read broadly, write only their own rows,
and all token movement goes through `SECURITY DEFINER` functions.

| Table | Read | Write |
|---|---|---|
| `profiles` | any authenticated | own row only |
| `skill_categories`, `skills` | any authenticated | insert via Edge Function only |
| `user_skills` | any authenticated | own rows |
| `availability_slots` | any authenticated (**sensitive columns masked via view**) | teacher owns |
| `bookings` | participants only | via RPC only |
| `swap_proposals` | proposer or responder | proposer inserts; responder updates status |
| `token_ledger` | own rows | **no client writes** — RPC only |
| `conversations` | participants | participants insert |
| `messages` | conversation participants | sender inserts own |
| `follows` | any authenticated | own follower row |
| `posts` | published, or own/partner | author inserts; partner updates consent |
| `skill_requests` | any authenticated | requester owns |

**Sensitive-column masking:** clients read `slots_public`, a view that nulls `meeting_url` and
`location_text` unless the viewer is the teacher or has a confirmed booking. This is the one RLS
subtlety worth the time — the rest stay deliberately simple.

**Realtime note:** RLS applies to realtime subscriptions too. The `messages` policy must be right or
live chat silently delivers nothing.

---

## 6. Pages

| Route | Purpose | Tier |
|---|---|---|
| `/` | Landing — 3D block hero, value prop, sign up | P0 |
| `/home` | Next booking, token balance, **Perfect swaps for you**, upcoming sessions, recent activity | P0 |
| `/search` | Filter by skill/category, online vs in-person, date. Results = tutors with open slots. Empty state → "request this skill" | P0 |
| `/skill/:slug` | Skill detail — who teaches it, open slots | P0 |
| `/u/:id` | Public profile — teaches, wants, open slots, follow, message, session album | P0 |
| `/bookings` | Your schedule: upcoming, pending swap proposals, awaiting confirmation, past | P0 |
| `/profile` | Edit your profile, manage teach/learn skills, publish availability slots | P0 |
| `/messages` | Conversation list + realtime thread | P1 |
| `/requests` | Open skill requests; tutors respond | P1 |
| `/feed` | Posts from people you follow | P2 |
| `/map` | 3D globe → zoom into city → bookable session pins (§12) | Planned |

### Design direction

Theme is literally *blocks*, so the design leans in: an 8px modular grid, chunky rounded-square
cards with a subtle offset shadow suggesting stacked blocks, and a landing hero of floating 3D blocks
that snap together as two users match.

- **Palette:** warm and human, not corporate SaaS. Deep indigo base, warm amber accent, off-white paper ground.
- **Type:** one strong display face for headings, a clean sans for body.
- **Motion:** restrained. Cards lift on hover, blocks settle on match. Nothing that distracts a judge.
- **Accessibility:** WCAG AA contrast, real focus rings, keyboard-navigable dialogs, `prefers-reduced-motion` disables the 3D hero. Judges score readability and accessibility explicitly.

**3D discipline:** `react-three-fiber` on the landing hero **only**, lazy-loaded, with a static
gradient fallback. It must never block first paint or drop frames on a mid-range laptop.

---

## 7. Build order

24 hours. Times are elapsed hours from kickoff, and assume the foundation phase is serial.

### Phase 0 — Foundation (H0–H3, one session, no parallelism)

This phase is inherently serial. Two agents here would collide on every file.

1. Vite + React + TS scaffold, Tailwind, shadcn/ui init, React Router shell
2. Design tokens: palette, type scale, spacing, the block-card primitive
3. Supabase project linked; migration `0001_init.sql` with all tables above
4. RLS policies + `slots_public` view + token RPCs
5. Auth: signup, login, protected routes, profile bootstrap trigger
6. Zustand stores: `authStore`, `profileStore`, `tokenStore`
7. Seed script: 12 categories, ~60 skills, ~50 fake users with skills, slots, and a few completed sessions
8. Deploy to Vercel — **get a working URL on day one**, not at hour 23

**Exit criteria:** you can sign up, land on `/home`, see your token balance, and the deployed URL works.

### Phase 1 — Fan out (H3–H14, two or three sessions on branches)

Hard file ownership. Nobody edits another lane's directory. Shared files (`router.tsx`, design tokens,
`types/db.ts`) are frozen — changes announced before they happen.

| Lane | Owns | Deliverables |
|---|---|---|
| **A — Booking core** | `src/features/booking/`, `src/features/slots/` | Publish availability, book with token, swap proposal + accept/decline, bookings page, completion flow |
| **B — Discovery** | `src/features/search/`, `src/features/profile/`, `src/features/skills/` | Search + filters, skill pages, public profiles, teach/learn management, **perfect swaps** widget |
| **C — Comms** | `src/features/messaging/`, `src/features/follows/` | Realtime chat, conversation list, unread badges, follow/unfollow |

Merge to `main` every 2 hours. Long-lived branches are how hackathons die.

### Phase 2 — Integration (H14–H18, back to one session)

- Merge all lanes, resolve conflicts, fix the seams
- Home page assembled from every lane's pieces
- 3D landing hero
- Skill requests + Anthropic Edge Function for dedupe
- Empty states, loading skeletons, error toasts everywhere

### Phase 3 — Polish and P2 (H18–H22)

- Social feed with consented photo posts, if the schedule holds
- Responsive pass: desktop first, then a genuine mobile layout (web, not native)
- Accessibility sweep: contrast, focus, keyboard, reduced motion
- Seed data realism pass — the demo lives or dies on this

### Phase 4 — Submission (H22–H24)

- **Freeze code at H22.** Non-negotiable.
- Record the 3-minute video
- README: description, features, third-party attributions, per-person contributions
- Devpost submission with the public repo link

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| RLS misconfiguration silently returns empty arrays | High — looks like a frontend bug, wastes hours | Write policies in Phase 0 with a test user; if realtime delivers nothing, suspect RLS first |
| Merge conflicts between lanes | High | Hard directory ownership, frozen shared files, 2-hourly merges |
| Weak seed data | High — a real product on empty tables looks like a prototype | ~50 users with plausible names, skills, cities, and session history. Budget real time here |
| 3D hero tanks performance | Medium | Lazy chunk, fallback, `prefers-reduced-motion`, hero only |
| Anthropic key unavailable | Low | Skill requests degrade to manual/heuristic dedupe; everything else unaffected |
| Timezone bugs in the demo | Medium | UTC in the database, format at render, seed data in the demo timezone |
| Scope creep into the map | High | Map is parked. Route stub only. Do not open it before H22 |

---

## 9. Demo script (3 minutes)

1. **Problem (20s)** — the world runs on skills that sit unused because there's no way to trade them.
2. **Signup (20s)** — a new user picks what they teach and what they want. Two tokens to start.
3. **Perfect swap (45s)** — the home page has already found a match. *"Maya teaches Spanish, which you want, and wants Guitar, which you teach."* One click proposes the swap.
4. **Accept and schedule (30s)** — switch accounts, accept, two linked bookings appear. Zoom link revealed.
5. **Message (20s)** — realtime chat, live on screen between two windows.
6. **Complete (25s)** — force-complete, teacher earns a token, both consent to a feed post.
7. **Close (20s)** — the economy: cap of 5 tokens means teaching is the only way to earn. Blocks connecting blocks.

Rehearse it twice before H22. Have the two demo accounts pre-seeded and logged into separate browser profiles.

---

## 10. Setup checklist

**You (browser, needs email/OAuth):**
- [ ] GitHub repo made **public** — judges score version history, so commit steadily all 24h
- [ ] Supabase account → new project → region `ap-southeast-2` → save the DB password
- [ ] Vercel account (sign in with GitHub)
- [ ] Anthropic API key when convenient — only blocks the skill-request AI

**Then in this session:**
```
! npx supabase login
! npx vercel login
```
and paste the Supabase **Project URL** and **anon key** from Settings → API.

**Me, once those exist:** link the project, push migrations, wire env vars, first deploy.

I can build the entire schema, migrations, and every page with credentials stubbed in `.env.example`
while you do the above — nothing stalls waiting on accounts.

---

## 11. Open decisions

Deliberately deferred; defaults chosen so nothing blocks. All are cheap to change later.

- ~~Final app name and logo~~ — decided: **Skill Up**, with the two-hands swap mark
- Session length fixed at 60 minutes; no recurring slots
- ~~Map pin semantics (teachers vs open sessions vs completed-session heatmap)~~ — decided: **open sessions** (§12.6)
- Group sessions, ratings, and reviews — explicitly out of scope

---

## 12. The globe map (unparked)

The map stops being a placeholder and becomes the spatial centrepiece: a **3D globe** you land on,
spin, and dive into until individual sessions resolve under your cursor. It is the second half of the
"blocks" idea — the landing hero shows two blocks snapping together, the globe shows every block on
Earth waiting for a partner.

### 12.1 Why a globe

A flat map opens zoomed into one city and quietly says *this is a local app*. A globe opens on the
whole planet and says *pick anywhere* — then the zoom-in is the story. It also matches the demo
script's Slide 7 (`demo-video-script.md:99`), which already promises world → country → city.

### 12.2 Stack

| Concern | Choice | Why |
|---|---|---|
| Renderer | **MapLibre GL JS v5** with `projection: { type: 'globe' }` | True globe projection, built in, no plugin. Smoothly interpolates to Mercator as you zoom — the dive-in is free |
| React binding | **`react-map-gl`** (maplibre entrypoint) | Declarative `<Marker>` / `<Popup>` so pins are ordinary React components in our Tailwind classes |
| Tiles | **OpenFreeMap** vector tiles | Free, no API key, no credit card, no rate ceiling to babysit during judging |
| Clustering | MapLibre native GeoJSON `cluster: true` | Handled in the style layer, not JS. 140 seeded slots overlap badly in Sydney without it |

```
npm i maplibre-gl react-map-gl
```

No new 3D dependency: this is WebGL via MapLibre, entirely separate from the `react-three-fiber`
landing hero, and subject to the same discipline — lazy-loaded, never blocking first paint.

### 12.3 The zoom ladder

Four bands, each answering a different question. The pin layer swaps as you cross a threshold, so the
globe never renders 140 individual markers at once.

| Zoom | View | What renders | Question answered |
|---|---|---|---|
| 0–3 | Globe | Country halos, sized by open-session count | *Where on Earth is this happening?* |
| 3–6 | Country | City clusters with counts | *Which cities are active?* |
| 6–11 | City | Clustered pins, spidering apart as you zoom | *What's near me?* |
| 11+ | Street | Individual session pins, jittered | *Can I book this one?* |

Camera transitions use `flyTo` with an eased curve so a click on a cluster feels like a dive, not a
jump cut. `prefers-reduced-motion` collapses every `flyTo` to an instant `jumpTo`.

### 12.4 Privacy

Non-negotiable, and it is the reason the coordinates cannot simply be selected and rendered.

- In-person slot coordinates are **jittered ~500m server-side**, inside the RPC, before they ever
  reach the browser. Jittering in React would ship the true point anyway.
- The jitter offset is **deterministic per slot** (seeded from the slot id), so a pin does not visibly
  wander between refetches and cannot be averaged out across repeated requests.
- The exact point, `location_text`, and `meeting_url` stay revoked until a booking is `confirmed` —
  already enforced by column grants in `20260829000012_slot_column_grants.sql`.
- Online-only slots never appear on the globe at all. They have no location to reveal.

### 12.5 Data layer

The schema needs **no migration** — `profiles` and `availability_slots` have carried `lat`/`lng` since
Phase 0, and the reseed populates them across Sydney, Brisbane, Melbourne, Parramatta, Newtown and
Bondi.

What's new is one RPC:

```sql
slots_in_bounds(min_lat, min_lng, max_lat, max_lng, zoom)
  -- returns open, future, in-person slots within the viewport
  -- coordinates jittered ~500m, deterministic on slot id
  -- above zoom 6: individual rows
  -- at or below zoom 6: pre-aggregated {city, lat, lng, count}
```

Aggregating server-side below zoom 6 is what keeps the globe view to one small response instead of
every slot on the platform.

### 12.6 Pin semantics — decided

Pins are **open sessions**, not teachers and not a heatmap. A session is the only one of the three
that is directly bookable, so every pin has an obvious next action, and it reuses `BookSlotDialog`
unchanged. This closes the open decision in §11.

Popup contents: skill, teacher name and avatar, start time in the viewer's timezone, token cost, and
a **Book** button. Swap-eligible sessions get the same amber "perfect swap" treatment as `/home`.

### 12.7 Build order

1. Install deps; lazy-route the map component behind `React.lazy`.
2. Globe with OpenFreeMap tiles, restrained custom style tuned to the indigo/amber palette.
3. `slots_in_bounds` RPC with deterministic jitter — **write and verify the jitter before any pin renders**.
4. GeoJSON source + clustered pin layers; the zoom-band swap.
5. Popup wired to `BookSlotDialog`.
6. Debounced refetch on `moveend`.
7. "Use my location" via `navigator.geolocation`, falling back to the profile's city centroid.
8. Empty state for a viewport with no sessions — offer `/requests` rather than a blank ocean.
9. Dark-mode style variant; `prefers-reduced-motion`; keyboard pan/zoom and a text list fallback for
   screen readers, since a canvas globe is invisible to them.
10. Drop "(coming soon)" from the footer link (`AppShell.tsx:169`) and update the §6 route table.

Steps 1–6 are the feature. 7–9 are what make it shippable rather than demo-only.

### 12.8 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Globe drops frames on a mid-range laptop mid-demo | High | Lazy chunk, cap pin count per viewport, test on the demo machine before filming |
| Jitter implemented client-side by mistake | High — leaks exact home addresses | Jitter lives in the RPC; assert in review that the client never receives a raw coordinate |
| Judges open the map on a region with no sessions | Medium | Default camera flies to the viewer's city, not to (0,0) |
| Scope creep — routing, directions, heatmaps | Medium | Pins and popups only. Anything else is post-hackathon |
