-- ============================================================================
-- Triggers, token engine, RLS, masked slot view, and RPCs.
-- Rule: authenticated users read broadly, write only their own rows, and every
-- token movement goes through a SECURITY DEFINER function.
-- ============================================================================

-- ─── Profile bootstrap + signup grant ───────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, timezone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'Australia/Sydney')
  )
  on conflict (id) do nothing;

  insert into public.token_ledger (user_id, delta, reason)
  values (new.id, 2, 'signup_grant');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Ledger is the source of truth; profiles.token_balance is the cache ─────
create or replace function public.apply_ledger_delta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles
     set token_balance = token_balance + new.delta
   where id = new.user_id;
  return new;
end;
$$;

create trigger token_ledger_applies_delta
  after insert on public.token_ledger
  for each row execute function public.apply_ledger_delta();

-- ─── Weekly grant, computed lazily on session load. No cron. ────────────────
create or replace function public.claim_weekly_grant()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p.id is null then
    raise exception 'no profile';
  end if;

  if p.token_balance < 5 and now() - p.last_grant_at >= interval '7 days' then
    insert into public.token_ledger (user_id, delta, reason) values (p.id, 1, 'weekly_grant');
    update public.profiles set last_grant_at = now() where id = p.id;
    return p.token_balance + 1;
  end if;

  return p.token_balance;
end;
$$;

-- ─── Booking with a token ───────────────────────────────────────────────────
create or replace function public.book_slot_with_token(p_slot_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_slot    public.availability_slots;
  v_learner uuid := auth.uid();
  v_balance int;
  v_booking uuid;
begin
  if v_learner is null then raise exception 'not authenticated'; end if;

  select * into v_slot from public.availability_slots where id = p_slot_id for update;
  if v_slot.id is null then raise exception 'slot not found'; end if;
  if v_slot.status <> 'open' then raise exception 'slot is no longer open'; end if;
  if v_slot.teacher_id = v_learner then raise exception 'you cannot book your own slot'; end if;
  if v_slot.starts_at <= now() then raise exception 'slot is in the past'; end if;

  select token_balance into v_balance from public.profiles where id = v_learner for update;
  if v_balance < 1 then raise exception 'insufficient tokens'; end if;

  update public.availability_slots set status = 'booked' where id = p_slot_id;

  insert into public.bookings (slot_id, teacher_id, learner_id, skill_id, payment_type, status)
  values (p_slot_id, v_slot.teacher_id, v_learner, v_slot.skill_id, 'token', 'confirmed')
  returning id into v_booking;

  insert into public.token_ledger (user_id, delta, reason, booking_id)
  values (v_learner, -1, 'booking_hold', v_booking);

  return v_booking;
end;
$$;

-- ─── Cancellation. Cancelling half a swap cancels both. ─────────────────────
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_b  public.bookings;
  v_row public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_me not in (v_b.teacher_id, v_b.learner_id) then raise exception 'not your booking'; end if;
  if v_b.status in ('completed','cancelled') then raise exception 'booking is already closed'; end if;

  for v_row in
    select * from public.bookings
     where id = p_booking_id
        or (v_b.swap_group_id is not null and swap_group_id = v_b.swap_group_id)
  loop
    if v_row.status in ('completed','cancelled') then continue; end if;

    update public.bookings
       set status = 'cancelled', cancelled_by = v_me
     where id = v_row.id;

    update public.availability_slots set status = 'open' where id = v_row.slot_id;

    if v_row.payment_type = 'token' then
      insert into public.token_ledger (user_id, delta, reason, booking_id)
      values (v_row.learner_id, 1, 'booking_refund', v_row.id);
    end if;
  end loop;
end;
$$;

-- ─── Swap proposals ─────────────────────────────────────────────────────────
create or replace function public.propose_swap(
  p_responder_slot_id uuid,
  p_proposer_slot_id  uuid,
  p_message           text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_mine public.availability_slots;
  v_theirs public.availability_slots;
  v_id   uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  select * into v_theirs from public.availability_slots where id = p_responder_slot_id;
  select * into v_mine   from public.availability_slots where id = p_proposer_slot_id;

  if v_theirs.id is null or v_mine.id is null then raise exception 'slot not found'; end if;
  if v_mine.teacher_id <> v_me then raise exception 'you can only offer your own slot'; end if;
  if v_theirs.teacher_id = v_me then raise exception 'you cannot swap with yourself'; end if;
  if v_theirs.status <> 'open' or v_mine.status <> 'open' then
    raise exception 'both slots must still be open';
  end if;

  insert into public.swap_proposals
    (proposer_id, responder_id, responder_slot_id, proposer_slot_id, message)
  values (v_me, v_theirs.teacher_id, p_responder_slot_id, p_proposer_slot_id, p_message)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.respond_to_swap(p_proposal_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_p  public.swap_proposals;
  v_mine public.availability_slots;
  v_theirs public.availability_slots;
  v_group uuid := gen_random_uuid();
begin
  select * into v_p from public.swap_proposals where id = p_proposal_id for update;
  if v_p.id is null then raise exception 'proposal not found'; end if;
  if v_p.responder_id <> v_me then raise exception 'not yours to answer'; end if;
  if v_p.status <> 'pending' then raise exception 'proposal already answered'; end if;

  if not p_accept then
    update public.swap_proposals set status = 'declined' where id = p_proposal_id;
    return null;
  end if;

  select * into v_theirs from public.availability_slots where id = v_p.responder_slot_id for update;
  select * into v_mine   from public.availability_slots where id = v_p.proposer_slot_id  for update;
  if v_theirs.status <> 'open' or v_mine.status <> 'open' then
    raise exception 'one of the slots is no longer open';
  end if;

  update public.swap_proposals set status = 'accepted' where id = p_proposal_id;
  update public.availability_slots set status = 'booked'
   where id in (v_p.responder_slot_id, v_p.proposer_slot_id);

  -- responder teaches, proposer learns
  insert into public.bookings
    (slot_id, teacher_id, learner_id, skill_id, payment_type, swap_group_id, status)
  values (v_theirs.id, v_theirs.teacher_id, v_p.proposer_id, v_theirs.skill_id, 'swap', v_group, 'confirmed');

  -- proposer teaches, responder learns
  insert into public.bookings
    (slot_id, teacher_id, learner_id, skill_id, payment_type, swap_group_id, status)
  values (v_mine.id, v_mine.teacher_id, v_p.responder_id, v_mine.skill_id, 'swap', v_group, 'confirmed');

  -- any other pending proposal touching these slots is now dead
  update public.swap_proposals set status = 'withdrawn'
   where status = 'pending'
     and id <> p_proposal_id
     and (responder_slot_id in (v_theirs.id, v_mine.id) or proposer_slot_id in (v_theirs.id, v_mine.id));

  return v_group;
end;
$$;

create or replace function public.withdraw_swap(p_proposal_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.swap_proposals
     set status = 'withdrawn'
   where id = p_proposal_id and proposer_id = auth.uid() and status = 'pending';
end;
$$;

-- ─── Completion flow ────────────────────────────────────────────────────────
create or replace function public.mark_session_held(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_b public.bookings;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'booking not found'; end if;
  if v_b.teacher_id <> auth.uid() then raise exception 'only the teacher can do this'; end if;
  if v_b.status <> 'confirmed' then raise exception 'booking is not confirmed'; end if;

  update public.bookings
     set status = 'held', held_at = now(), auto_confirm_at = now() + interval '48 hours'
   where id = p_booking_id;
end;
$$;

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

  update public.bookings set status = 'completed', confirmed_at = now() where id = p_booking_id;

  if v_b.payment_type = 'token' then
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    values (v_b.teacher_id, 1, 'teach_earn', v_b.id);
  end if;
end;
$$;

-- Demo shortcut: collapse held + confirm into one call. Gated in the UI by
-- VITE_ENABLE_DEV_TOOLS; either participant may run it.
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
     set status = 'completed',
         held_at = coalesce(held_at, now()),
         confirmed_at = now()
   where id = p_booking_id;

  if v_b.payment_type = 'token' then
    insert into public.token_ledger (user_id, delta, reason, booking_id)
    values (v_b.teacher_id, 1, 'teach_earn', v_b.id);
  end if;
end;
$$;

-- ─── Perfect swaps: my wants ∩ their teaches, and their wants ∩ my teaches ──
create or replace function public.perfect_swaps(p_user uuid)
returns table (
  partner_id     uuid,
  they_teach_id  uuid,
  they_want_id   uuid
)
language sql stable security definer set search_path = public
as $$
  select distinct
         their_teach.user_id,
         their_teach.skill_id,
         their_want.skill_id
    from public.user_skills my_want
    join public.user_skills their_teach
      on their_teach.skill_id = my_want.skill_id and their_teach.kind = 'teach'
    join public.user_skills their_want
      on their_want.user_id = their_teach.user_id and their_want.kind = 'learn'
    join public.user_skills my_teach
      on my_teach.skill_id = their_want.skill_id
     and my_teach.user_id = p_user and my_teach.kind = 'teach'
   where my_want.user_id = p_user
     and my_want.kind = 'learn'
     and their_teach.user_id <> p_user;
$$;

-- ─── Conversations: get or create, canonical ordering ───────────────────────
create or replace function public.get_or_create_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid; v_b uuid; v_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_me = p_other then raise exception 'cannot message yourself'; end if;

  v_a := least(v_me, p_other);
  v_b := greatest(v_me, p_other);

  insert into public.conversations (user_a, user_b) values (v_a, v_b)
  on conflict (user_a, user_b) do nothing;

  select id into v_id from public.conversations where user_a = v_a and user_b = v_b;
  return v_id;
end;
$$;

create or replace function public.touch_conversation()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create trigger message_touches_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ============================================================================
-- Row level security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.skill_categories   enable row level security;
alter table public.skills             enable row level security;
alter table public.user_skills        enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings           enable row level security;
alter table public.swap_proposals     enable row level security;
alter table public.token_ledger       enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.follows            enable row level security;
alter table public.posts              enable row level security;
alter table public.skill_requests     enable row level security;
alter table public.request_responses  enable row level security;

-- profiles: everyone signed in reads; you write only your own row
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- catalog: read-only to clients
create policy categories_read on public.skill_categories for select to authenticated using (true);
create policy skills_read     on public.skills for select to authenticated using (true);
create policy skills_insert   on public.skills for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');

-- user_skills: read all, write your own
create policy user_skills_read  on public.user_skills for select to authenticated using (true);
create policy user_skills_write on public.user_skills for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- slots: read all (sensitive columns masked by slots_public), teacher owns writes
create policy slots_read  on public.availability_slots for select to authenticated using (true);
create policy slots_write on public.availability_slots for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- bookings: participants read. All writes go through RPCs.
create policy bookings_read on public.bookings for select to authenticated
  using (teacher_id = auth.uid() or learner_id = auth.uid());

-- swap proposals: both sides read; RPCs write
create policy swaps_read on public.swap_proposals for select to authenticated
  using (proposer_id = auth.uid() or responder_id = auth.uid());

-- ledger: own rows, read only
create policy ledger_read on public.token_ledger for select to authenticated
  using (user_id = auth.uid());

-- conversations and messages
create policy conversations_read on public.conversations for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

create policy messages_read on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and exists (
    select 1 from public.conversations c
     where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

create policy messages_mark_read on public.messages for update to authenticated
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  ));

-- follows
create policy follows_read  on public.follows for select to authenticated using (true);
create policy follows_write on public.follows for all to authenticated
  using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- posts: published to everyone, drafts to the two people in them
create policy posts_read on public.posts for select to authenticated
  using (status = 'published' or author_id = auth.uid() or partner_id = auth.uid());
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid());
create policy posts_update on public.posts for update to authenticated
  using (author_id = auth.uid() or partner_id = auth.uid());

-- skill requests
create policy requests_read   on public.skill_requests for select to authenticated using (true);
create policy requests_write  on public.skill_requests for all to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());
create policy responses_read  on public.request_responses for select to authenticated using (true);
create policy responses_write on public.request_responses for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ============================================================================
-- slots_public: meeting_url and location_text stay hidden until the viewer is
-- the teacher or holds a confirmed booking on that slot.
-- ============================================================================
create or replace function public.viewer_may_see_slot_details(p_slot uuid, p_teacher uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_teacher = auth.uid()
      or exists (
        select 1 from public.bookings b
         where b.slot_id = p_slot
           and b.status in ('confirmed','held','completed')
           and (b.teacher_id = auth.uid() or b.learner_id = auth.uid())
      );
$$;

create view public.slots_public
with (security_invoker = on) as
select
  s.id, s.teacher_id, s.skill_id, s.starts_at, s.ends_at, s.mode, s.status,
  s.lat, s.lng, s.created_at,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.location_text end as location_text,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.meeting_url end as meeting_url
from public.availability_slots s;

grant select on public.slots_public to authenticated, anon;

-- Realtime for live chat. RLS still applies to the stream.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.swap_proposals;
alter publication supabase_realtime add table public.bookings;
