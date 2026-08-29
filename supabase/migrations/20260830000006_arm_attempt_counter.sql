-- ============================================================================
-- Arm the attempt counter when the code is revealed, not when it is first used.
--
-- Second half of the same bug. Moving the counter to a sequence was right —
-- nextval() survives the raise — but `create sequence` does not: DDL is
-- transactional, so a sequence created inside the wrong-code branch vanished
-- along with the raise, and the nextval on it vanished with it. The counter
-- still read 0.
--
-- The sequence therefore has to exist before the failing call starts. Reveal is
-- the natural place: it commits, it already happens exactly once per code, and
-- a code that was never revealed cannot be got wrong.
-- ============================================================================

/** Starts a fresh count for a code. Runs inside reveal, which commits. */
create or replace function confirm_guard.arm(p_booking_id uuid)
returns void language plpgsql as $$
declare v_name text := confirm_guard.seq_name(p_booking_id);
begin
  if to_regclass(v_name) is not null then
    execute format('drop sequence %s', v_name);
  end if;
  execute format('create sequence %s', v_name);
end;
$$;

/**
 * Counts one failure. The caller raises immediately afterwards, which rolls the
 * transaction back — nextval is not part of that, which is the whole point.
 * The sequence must already exist; confirm_guard.arm sees to that at reveal.
 */
create or replace function confirm_guard.bump(p_booking_id uuid)
returns integer language plpgsql as $$
declare v_name text := confirm_guard.seq_name(p_booking_id); v_n bigint;
begin
  if to_regclass(v_name) is null then
    -- Creating it here would be rolled back with the raise, so the count could
    -- not stick anyway. Report zero rather than pretend.
    return 0;
  end if;
  execute format('select nextval(%L)', v_name) into v_n;
  return v_n::integer;
end;
$$;

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

  -- Only a genuinely new code arms a fresh counter. Re-revealing must not be a
  -- way out of a lockout.
  if v_new then perform confirm_guard.arm(p_booking_id); end if;

  select code into v_code from public.session_codes where booking_id = p_booking_id;
  return v_code;
end;
$$;

revoke all on function public.reveal_session_code(uuid) from public, anon;
grant execute on function public.reveal_session_code(uuid) to authenticated;
