-- ============================================================================
-- Sweep attempt counters whose code is gone.
--
-- session_codes cascades from bookings, but a sequence in confirm_guard is not
-- a row and nothing cascades to it. Delete a booking — which a profile deletion
-- does — and its counter is orphaned. Nothing breaks; it just accumulates.
--
-- run_auto_confirms is already the janitor for dead codes, so it takes this
-- too: any counter with no session_codes row behind it has nothing left to
-- count.
-- ============================================================================

create or replace function public.run_auto_confirms()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n integer; v_dead uuid; v_seq text;
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

  -- A code on a booking that is no longer awaiting confirmation is dead weight.
  for v_dead in
    delete from public.session_codes c
     using public.bookings b
     where b.id = c.booking_id and b.status <> 'confirmed'
    returning c.booking_id
  loop
    perform confirm_guard.reset(v_dead);
  end loop;

  -- And a counter with no code behind it has nothing left to count.
  for v_seq in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'confirm_guard'
       and c.relkind = 'S'
       and not exists (
         select 1 from public.session_codes sc
          where confirm_guard.seq_name(sc.booking_id) = 'confirm_guard.' || c.relname
       )
  loop
    execute format('drop sequence confirm_guard.%I', v_seq);
  end loop;

  return v_n;
end;
$$;

revoke all on function public.run_auto_confirms() from public;
grant execute on function public.run_auto_confirms() to authenticated, anon;
