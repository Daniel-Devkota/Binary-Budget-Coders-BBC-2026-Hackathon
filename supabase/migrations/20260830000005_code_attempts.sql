-- ============================================================================
-- Make the wrong-code counter actually count.
--
-- session_codes.attempts could never work, and the code-test caught it: the
-- wrong-code branch does `update ... set attempts = attempts + 1` and then
-- raises, and a raise aborts the whole RPC transaction — including that update.
-- The counter read 0 after five wrong codes and the lockout never armed.
--
-- Refusing without side effects (FR4) and remembering the refusal (FR5) pull in
-- opposite directions, and Postgres has exactly one thing that survives a
-- rollback: a sequence. nextval() is deliberately non-transactional. So the
-- counter is a sequence per code, and the column that could never hold the
-- truth is gone rather than left lying.
--
-- The sequences live in their own schema, which is not in the API's exposed
-- list (config.toml) and is revoked from the client roles besides. Only the
-- definer functions below touch them.
-- ============================================================================

create schema if not exists confirm_guard;
revoke all on schema confirm_guard from public, anon, authenticated;

alter table public.session_codes drop column if exists attempts;

comment on table public.session_codes is
  'Confirm codes. RLS enabled with no policies on purpose — reachable only through reveal_session_code and confirm_session_with_code. The failed-attempt count is a sequence in confirm_guard, because a counter that raises cannot also be a table write.';

create or replace function confirm_guard.seq_name(p_booking_id uuid)
returns text language sql immutable as $$
  select 'confirm_guard.a' || replace(p_booking_id::text, '-', '')
$$;

/** Failed attempts so far. 0 when nothing has been counted yet. */
create or replace function confirm_guard.attempts(p_booking_id uuid)
returns integer language plpgsql as $$
declare v_name text := confirm_guard.seq_name(p_booking_id); v_n bigint;
begin
  if to_regclass(v_name) is null then return 0; end if;
  execute format('select case when is_called then last_value else 0 end from %s', v_name) into v_n;
  return v_n::integer;
end;
$$;

/** Counts one failure. Survives the raise that follows it. */
create or replace function confirm_guard.bump(p_booking_id uuid)
returns integer language plpgsql as $$
declare v_name text := confirm_guard.seq_name(p_booking_id); v_n bigint;
begin
  execute format('create sequence if not exists %s', v_name);
  execute format('select nextval(%L)', v_name) into v_n;
  return v_n::integer;
end;
$$;

/** Forgets a code's history. Called when the code is consumed or discarded. */
create or replace function confirm_guard.reset(p_booking_id uuid)
returns void language plpgsql as $$
declare v_name text := confirm_guard.seq_name(p_booking_id);
begin
  if to_regclass(v_name) is not null then
    execute format('drop sequence %s', v_name);
  end if;
end;
$$;

-- ─── Reveal, unchanged except that a fresh code starts from a clean count ───
create or replace function public.reveal_session_code(p_booking_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_b    public.bookings;
  v_slot public.availability_slots;
  v_code text;
  v_new  boolean := false;
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
  v_new := found;

  -- Only a genuinely new code clears the count. Re-revealing must not be a way
  -- out of a lockout.
  if v_new then perform confirm_guard.reset(p_booking_id); end if;

  select code into v_code from public.session_codes where booking_id = p_booking_id;
  return v_code;
end;
$$;

-- ─── Confirm, now with a counter that remembers ─────────────────────────────
create or replace function public.confirm_session_with_code(p_booking_id uuid, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_b        public.bookings;
  v_c        public.session_codes;
  v_slot     public.availability_slots;
  v_attempts integer;
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

  v_attempts := confirm_guard.attempts(p_booking_id);
  if v_attempts >= 5 and now() < v_slot.starts_at + interval '24 hours' then
    raise exception 'too many wrong codes — confirm this session the usual way instead';
  end if;

  if v_c.code <> p_code then
    -- The counter moves and nothing else does. The raise below rolls this
    -- transaction back; the sequence is not part of it, which is the point.
    v_attempts := confirm_guard.bump(p_booking_id);
    if v_attempts >= 5 then
      raise exception 'too many wrong codes — confirm this session the usual way instead';
    end if;
    raise exception 'that code does not match — % attempt(s) left', 5 - v_attempts;
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
  perform confirm_guard.reset(p_booking_id);
end;
$$;

revoke all on function public.reveal_session_code(uuid) from public, anon;
grant execute on function public.reveal_session_code(uuid) to authenticated;
revoke all on function public.confirm_session_with_code(uuid, text) from public, anon;
grant execute on function public.confirm_session_with_code(uuid, text) to authenticated;

-- ─── The sweep is also the janitor ──────────────────────────────────────────
-- A code whose booking is no longer awaiting confirmation is dead weight, and
-- so is its counter. run_auto_confirms already runs every 15 minutes and on
-- every /bookings load, so it is the natural place to tidy up.
create or replace function public.run_auto_confirms()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer; v_dead uuid;
begin
  with moved as (
    update public.bookings
       set status           = 'completed',
           confirmed_at     = now(),
           confirmed_method = 'auto'
     where status = 'held'
       and auto_confirm_at is not null
       and auto_confirm_at <= now()
    returning id, teacher_id, payment_type
  ),
  credited as (
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    select teacher_id, 1, 'teach_earn', id from moved where payment_type = 'token'
    returning 1
  )
  select count(*) into v_n from moved;

  for v_dead in
    delete from public.session_codes c
     using public.bookings b
     where b.id = c.booking_id and b.status <> 'confirmed'
    returning c.booking_id
  loop
    perform confirm_guard.reset(v_dead);
  end loop;

  return v_n;
end;
$$;

revoke all on function public.run_auto_confirms() from public;
grant execute on function public.run_auto_confirms() to authenticated, anon;
