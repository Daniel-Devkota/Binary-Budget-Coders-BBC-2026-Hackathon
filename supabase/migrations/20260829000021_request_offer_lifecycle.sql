-- ============================================================================
-- Offers on a skill request get a lifecycle.
--
-- request_responses was append-only: you could offer to teach and nothing
-- could ever happen to that offer. It now carries a status, and the requester
-- answers it through an RPC rather than through the table.
--
-- The RLS policy stays exactly as it is (teacher_id = auth.uid() writes).
-- Widening it to the parent request's owner would let a requester rewrite the
-- teacher's message text, so the state change is definer-only instead.
-- ============================================================================

alter table public.request_responses
  add column if not exists status text not null default 'pending',
  add column if not exists responded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'request_responses_status_check'
  ) then
    alter table public.request_responses
      add constraint request_responses_status_check
      check (status in ('pending','accepted','declined'));
  end if;
end $$;

-- "Every offer I have made, newest first" is the My offers tab's whole query.
create index if not exists request_responses_teacher_created_idx
  on public.request_responses (teacher_id, created_at desc);

-- ─── Answering an offer ─────────────────────────────────────────────────────
-- Modelled on respond_to_swap: lock the parent, authorise, sweep the siblings,
-- all in one transaction. Returns the conversation id on accept so the client
-- can navigate straight into the thread with a single round trip.
create or replace function public.answer_request_offer(p_response_id uuid, p_accept boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_resp public.request_responses;
  v_req  public.skill_requests;
begin
  if v_me is null then raise exception 'not authenticated'; end if;

  -- Unlocked read first, purely to find the parent. Everything then serialises
  -- on the request row: two people answering two offers on the same ask in the
  -- same instant would deadlock if each locked its own offer first.
  select * into v_resp from public.request_responses where id = p_response_id;
  if v_resp.id is null then raise exception 'offer not found'; end if;

  select * into v_req from public.skill_requests where id = v_resp.request_id for update;
  if v_req.id is null then raise exception 'request not found'; end if;
  if v_req.requester_id <> v_me then raise exception 'not your request to answer'; end if;

  -- Re-read under the parent lock: the status may have moved while we waited.
  select * into v_resp from public.request_responses where id = p_response_id for update;
  if v_resp.status <> 'pending' then raise exception 'offer already answered'; end if;

  if not p_accept then
    update public.request_responses
       set status = 'declined', responded_at = now()
     where id = p_response_id;
    return null;
  end if;

  update public.request_responses
     set status = 'accepted', responded_at = now()
   where id = p_response_id;

  -- An ask is for one teacher: everyone else is answered in the same breath
  -- rather than left on pending forever.
  update public.request_responses
     set status = 'declined', responded_at = now()
   where request_id = v_resp.request_id
     and id <> p_response_id
     and status = 'pending';

  update public.skill_requests set status = 'fulfilled' where id = v_resp.request_id;

  -- No booking: the teacher may have published no slot, and the offer carries
  -- no slot reference. They talk first and book normally afterwards.
  return public.get_or_create_conversation(v_resp.teacher_id);
end;
$$;

revoke all on function public.answer_request_offer(uuid, boolean) from public, anon;
grant execute on function public.answer_request_offer(uuid, boolean) to authenticated;
