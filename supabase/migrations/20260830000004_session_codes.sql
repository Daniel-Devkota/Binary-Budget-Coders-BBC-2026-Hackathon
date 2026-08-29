-- ============================================================================
-- Confirm codes for in-person sessions.
--
-- Completing a session takes two people making two unprompted return visits to
-- the app. In person that is absurd: the one moment confirmation costs nobody
-- anything is while the two of them are still standing together. The teacher
-- shows a six-digit code, the learner types it, and the whole thing collapses
-- into one tap each.
--
-- Online sessions keep the two-step attestation. Two people on a video call can
-- read a code aloud, so co-presence is exactly what it does not prove there,
-- and pretending otherwise would be worse than not having it at all.
--
-- This is not fraud-proof and is not meant to be. A teacher can text the code.
-- What it does is make co-presence the easy path.
-- ============================================================================

-- RLS on, and deliberately NO policies. That is not an omission: with no policy
-- nobody can read or write this table through the API at all, and the only way
-- in or out is the two security-definer functions below. The alternative — a
-- column on bookings — would need a column-level SELECT revoke, and
-- BOOKING_SELECT (api.ts) is a bare `*`. That is the documented way to break
-- this app (HANDOFF.md, pitfall #1).
create table if not exists public.session_codes (
  booking_id  uuid primary key references public.bookings on delete cascade,
  code        text not null,
  revealed_at timestamptz not null default now(),
  attempts    smallint not null default 0
);
alter table public.session_codes enable row level security;

comment on table public.session_codes is
  'Confirm codes. RLS enabled with no policies on purpose — reachable only through reveal_session_code and confirm_session_with_code.';

-- ─── Teacher reveals ────────────────────────────────────────────────────────
create or replace function public.reveal_session_code(p_booking_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_b     public.bookings;
  v_slot  public.availability_slots;
  v_code  text;
begin
  select * into v_b from public.bookings where id = p_booking_id;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_b.teacher_id <> auth.uid() then
    raise exception 'only the teacher can show the confirm code';
  end if;
  if v_b.status <> 'confirmed' then
    raise exception 'this session is not awaiting confirmation';
  end if;

  select * into v_slot from public.availability_slots where id = v_b.slot_id;
  if v_slot.mode <> 'in_person' then
    raise exception 'confirm codes are for in-person sessions only';
  end if;

  -- The 15-minute window is the only thing stopping a teacher from sending the
  -- code the day before. The UI gates the button on the session having started;
  -- the two deliberately disagree, and the server is the one that counts.
  if now() < v_slot.starts_at - interval '15 minutes' then
    raise exception 'the confirm code appears 15 minutes before the session starts';
  end if;

  -- Generated once and returned unchanged thereafter, so the teacher can close
  -- and reopen the card without it changing under the learner mid-typing.
  insert into public.session_codes (booking_id, code)
  values (p_booking_id, lpad((floor(random() * 1000000))::int::text, 6, '0'))
  on conflict (booking_id) do nothing;

  select code into v_code from public.session_codes where booking_id = p_booking_id;
  return v_code;
end;
$$;

revoke all on function public.reveal_session_code(uuid) from public, anon;
grant execute on function public.reveal_session_code(uuid) to authenticated;

-- ─── Learner confirms ───────────────────────────────────────────────────────
create or replace function public.confirm_session_with_code(p_booking_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_b    public.bookings;
  v_c    public.session_codes;
  v_slot public.availability_slots;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;

  -- The token flows learner -> teacher, so the payer attests. A teacher who
  -- could self-confirm could pay themselves.
  if v_b.learner_id <> auth.uid() then
    raise exception 'only the learner can confirm with a code';
  end if;
  if v_b.status <> 'confirmed' then
    raise exception 'this session is not awaiting confirmation';
  end if;

  select * into v_slot from public.availability_slots where id = v_b.slot_id;
  if v_slot.mode <> 'in_person' then
    raise exception 'confirm codes are for in-person sessions only';
  end if;

  select * into v_c from public.session_codes where booking_id = p_booking_id for update;
  if v_c.booking_id is null then
    raise exception 'ask them to show the confirm code first';
  end if;

  if v_c.attempts >= 5 and now() < v_slot.starts_at + interval '24 hours' then
    raise exception 'too many wrong codes — confirm this session the usual way instead';
  end if;

  if v_c.code <> p_code then
    -- Counter moves, nothing else does: no status change and no ledger row.
    update public.session_codes
       set attempts = attempts + 1
     where booking_id = p_booking_id;
    raise exception 'that code does not match';
  end if;

  -- 'held' exists to park a booking while it waits on the learner. The learner
  -- is standing right there, so there is nothing to wait for — both timestamps
  -- land at once and the booking goes straight to completed.
  update public.bookings
     set status           = 'completed',
         held_at          = coalesce(held_at, now()),
         confirmed_at     = now(),
         confirmed_method = 'code'
   where id = p_booking_id;

  -- Copied from complete_booking. A swap moves no tokens, and that is correct.
  if v_b.payment_type = 'token' then
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    values (v_b.teacher_id, 1, 'teach_earn', v_b.id);
  end if;

  delete from public.session_codes where booking_id = p_booking_id;
end;
$$;

revoke all on function public.confirm_session_with_code(uuid, text) from public, anon;
grant execute on function public.confirm_session_with_code(uuid, text) to authenticated;
