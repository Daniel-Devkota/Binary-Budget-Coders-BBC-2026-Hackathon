-- ============================================================================
-- BLOCKS — skill exchange platform. Initial schema.
-- All timestamps are timestamptz in UTC; the client renders in local time.
-- ============================================================================

-- ─── Profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  avatar_url    text,
  bio           text,
  headline      text,
  city          text,
  country       text,
  lat           double precision,   -- parked map support
  lng           double precision,
  timezone      text not null default 'Australia/Sydney',
  token_balance int  not null default 0 check (token_balance >= 0),
  last_grant_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- ─── Skills ─────────────────────────────────────────────────────────────────
create table public.skill_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  slug  text not null unique,
  icon  text,                       -- lucide icon name
  sort  int not null default 0
);

create table public.skills (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.skill_categories on delete cascade,
  name        text not null,
  slug        text not null unique,
  description text,
  created_by  uuid references public.profiles on delete set null,
  status      text not null default 'approved' check (status in ('approved','pending')),
  created_at  timestamptz not null default now()
);
create index on public.skills (category_id);

create table public.user_skills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,
  skill_id    uuid not null references public.skills on delete cascade,
  kind        text not null check (kind in ('teach','learn')),
  proficiency text check (proficiency in ('beginner','intermediate','advanced','expert')),
  blurb       text,
  created_at  timestamptz not null default now(),
  unique (user_id, skill_id, kind)
);
create index on public.user_skills (skill_id, kind);
create index on public.user_skills (user_id, kind);

-- ─── Availability and bookings ──────────────────────────────────────────────
create table public.availability_slots (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.profiles on delete cascade,
  skill_id      uuid not null references public.skills on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  mode          text not null check (mode in ('online','in_person')),
  location_text text,               -- in_person meeting point; revealed post-confirmation
  meeting_url   text,               -- online link; revealed post-confirmation
  lat           double precision,   -- parked map support
  lng           double precision,
  status        text not null default 'open' check (status in ('open','booked','cancelled')),
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.availability_slots (skill_id, status, starts_at);
create index on public.availability_slots (teacher_id, starts_at);

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  slot_id         uuid not null unique references public.availability_slots on delete cascade,
  teacher_id      uuid not null references public.profiles on delete cascade,
  learner_id      uuid not null references public.profiles on delete cascade,
  skill_id        uuid not null references public.skills on delete cascade,
  payment_type    text not null check (payment_type in ('token','swap')),
  swap_group_id   uuid,             -- the two bookings of a swap share this
  status          text not null default 'confirmed'
                  check (status in ('confirmed','held','completed','cancelled')),
  held_at         timestamptz,
  confirmed_at    timestamptz,
  auto_confirm_at timestamptz,
  cancelled_by    uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now(),
  check (teacher_id <> learner_id)
);
create index on public.bookings (learner_id, status);
create index on public.bookings (teacher_id, status);
create index on public.bookings (swap_group_id);

create table public.swap_proposals (
  id                uuid primary key default gen_random_uuid(),
  proposer_id       uuid not null references public.profiles on delete cascade,
  responder_id      uuid not null references public.profiles on delete cascade,
  responder_slot_id uuid not null references public.availability_slots on delete cascade, -- what proposer wants
  proposer_slot_id  uuid not null references public.availability_slots on delete cascade, -- what proposer offers
  message           text,
  status            text not null default 'pending'
                    check (status in ('pending','accepted','declined','withdrawn')),
  created_at        timestamptz not null default now(),
  check (proposer_id <> responder_id)
);
create index on public.swap_proposals (responder_id, status);
create index on public.swap_proposals (proposer_id, status);

-- ─── Tokens ─────────────────────────────────────────────────────────────────
create table public.token_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  delta      int  not null,
  reason     text not null check (reason in
             ('signup_grant','weekly_grant','booking_hold','booking_refund','teach_earn')),
  booking_id uuid references public.bookings on delete set null,
  created_at timestamptz not null default now()
);
create index on public.token_ledger (user_id, created_at desc);

-- ─── Messaging ──────────────────────────────────────────────────────────────
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles on delete cascade,
  user_b          uuid not null references public.profiles on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  check (user_a < user_b),          -- canonical ordering prevents duplicates
  unique (user_a, user_b)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations on delete cascade,
  sender_id       uuid not null references public.profiles on delete cascade,
  body            text not null check (length(body) between 1 and 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);

-- ─── Social ─────────────────────────────────────────────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  followee_id uuid not null references public.profiles on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index on public.follows (followee_id);

create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings on delete cascade,
  author_id  uuid not null references public.profiles on delete cascade,
  partner_id uuid not null references public.profiles on delete cascade,
  caption    text,
  photo_url  text,
  status     text not null default 'pending_consent'
             check (status in ('pending_consent','published','declined')),
  created_at timestamptz not null default now()
);
create index on public.posts (status, created_at desc);
create index on public.posts (author_id);
create index on public.posts (partner_id);

-- ─── Skill requests ─────────────────────────────────────────────────────────
create table public.skill_requests (
  id                uuid primary key default gen_random_uuid(),
  requester_id      uuid not null references public.profiles on delete cascade,
  title             text not null,
  description       text,
  resolved_skill_id uuid references public.skills on delete set null,
  status            text not null default 'pending_review'
                    check (status in ('pending_review','open','fulfilled','rejected')),
  ai_verdict        jsonb,
  created_at        timestamptz not null default now()
);
create index on public.skill_requests (status, created_at desc);

create table public.request_responses (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.skill_requests on delete cascade,
  teacher_id uuid not null references public.profiles on delete cascade,
  message    text,
  created_at timestamptz not null default now(),
  unique (request_id, teacher_id)
);
