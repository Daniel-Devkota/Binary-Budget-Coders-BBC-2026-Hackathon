-- ============================================================================
-- Auto-confirm: make the card's promise true.
--
-- mark_session_held has always written auto_confirm_at = now() + 48h, and
-- BookingCard has always rendered "Auto-confirms {date}". Nothing has ever
-- read the column. A booking left in 'held' sat there forever and the teacher
-- was never paid.
--
-- run_auto_confirms() is the sweep. It takes no auth check on purpose: it can
-- only advance bookings that already earned it, so it is safe to call from
-- pg_cron, from the SQL editor, or unawaited from a page load.
-- ============================================================================

-- How a completed booking got confirmed. Nullable on purpose: rows completed
-- before this feature predate the distinction and backfilling them would be a
-- guess. Read null as "before this feature".
alter table public.bookings
  add column if not exists confirmed_method text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_confirmed_method_check') then
    alter table public.bookings
      add constraint bookings_confirmed_method_check
      check (confirmed_method in ('code','learner','auto','force'));
  end if;
end $$;

-- ─── The sweep ──────────────────────────────────────────────────────────────
create or replace function public.run_auto_confirms()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer;
begin
  -- The `status = 'held'` predicate lives in the same statement as the update,
  -- so the transition is atomic and a second run matches nothing. The ledger
  -- insert reads from `returning`, so it can only ever see rows this statement
  -- actually moved — that is what makes the whole thing idempotent.
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

  return v_n;
end;
$$;

comment on function public.run_auto_confirms() is
  'Completes held bookings past their auto_confirm_at. Idempotent; safe to call by anyone.';

revoke all on function public.run_auto_confirms() from public;
grant execute on function public.run_auto_confirms() to authenticated, anon;

-- ─── The existing transitions now record how they happened ──────────────────
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_b.learner_id <> auth.uid() then raise exception 'only the learner can confirm'; end if;
  if v_b.status <> 'held' then raise exception 'session has not been marked as held'; end if;

  update public.bookings
     set status = 'completed', confirmed_at = now(), confirmed_method = 'learner'
   where id = p_booking_id;

  if v_b.payment_type = 'token' then
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    values (v_b.teacher_id, 1, 'teach_earn', v_b.id);
  end if;
end;
$$;

create or replace function public.force_complete_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if auth.uid() not in (v_b.teacher_id, v_b.learner_id) then raise exception 'not your booking'; end if;
  if v_b.status = 'completed' then return; end if;
  if v_b.status = 'cancelled' then raise exception 'booking was cancelled'; end if;

  update public.bookings
     set status           = 'completed',
         held_at          = coalesce(held_at, now()),
         confirmed_at     = now(),
         confirmed_method = 'force'
   where id = p_booking_id;

  if v_b.payment_type = 'token' then
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    values (v_b.teacher_id, 1, 'teach_earn', v_b.id);
  end if;
end;
$$;
