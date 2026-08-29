-- ============================================================================
-- The globe map.
--
-- Two rules drive everything here:
--   1. The browser never receives a real coordinate. Slot points are jittered
--      ~500m inside this file, before they leave Postgres. Jittering in React
--      would ship the true point anyway.
--   2. The offset is deterministic on the slot id, so a pin does not wander
--      between refetches and cannot be averaged away over repeated requests.
--
-- No schema change: profiles and availability_slots have carried lat/lng since
-- Phase 0.
-- ============================================================================

-- ─── lat/lng leave the client's grants ──────────────────────────────────────
-- Raw coordinates now reach the browser only through slots_in_bounds, which
-- jitters them. The masked view nulls them for the same reason it nulls
-- location_text: an exact position is a post-confirmation detail.
revoke select (lat, lng) on public.availability_slots from anon, authenticated;

create or replace view public.slots_public as
select
  s.id, s.teacher_id, s.skill_id, s.starts_at, s.ends_at, s.mode, s.status,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.lat end as lat,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.lng end as lng,
  s.created_at,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.location_text end as location_text,
  case when public.viewer_may_see_slot_details(s.id, s.teacher_id)
       then s.meeting_url end as meeting_url
from public.availability_slots s;

alter view public.slots_public set (security_invoker = off);
grant select on public.slots_public to authenticated, anon;

-- ─── deterministic ~500m jitter ─────────────────────────────────────────────
-- hashtext is stable for a given input, so a slot lands on the same fake point
-- forever. Two independent hashes give a radius and an angle; the sqrt spreads
-- points evenly across the disc instead of clumping them at the centre.
create or replace function public.jitter_point(
  p_seed uuid,
  p_lat double precision,
  p_lng double precision,
  p_metres double precision default 500
)
returns table (lat double precision, lng double precision)
language sql stable
as $$
  with h as (
    select
      (abs(hashtext(p_seed::text || ':radius')) % 100000)::double precision / 100000 as u1,
      (abs(hashtext(p_seed::text || ':angle'))  % 100000)::double precision / 100000 as u2
  ),
  o as (select p_metres * sqrt(h.u1) as r, 2 * pi() * h.u2 as theta from h)
  select
    p_lat + (o.r * cos(o.theta)) / 111320,
    p_lng + (o.r * sin(o.theta)) / (111320 * greatest(cos(radians(p_lat)), 0.01))
  from o;
$$;

-- ─── viewport query ─────────────────────────────────────────────────────────
-- Above zoom 6 the map wants individual, bookable pins. At or below it wants
-- one row per city, so the globe view is a single small response instead of
-- every open session on the platform.
--
-- SECURITY DEFINER because lat/lng are no longer granted to authenticated:
-- this function is the only path to them, and it never returns a raw one.
create or replace function public.slots_in_bounds(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom    double precision default 12
)
returns table (
  kind           text,
  slot_id        uuid,
  lat            double precision,
  lng            double precision,
  session_count  int,
  label          text,
  skill_id       uuid,
  skill_name     text,
  skill_slug     text,
  teacher_id     uuid,
  teacher_name   text,
  teacher_avatar text,
  starts_at      timestamptz,
  ends_at        timestamptz
)
language sql stable security definer set search_path = public
as $$
  with visible as (
    select s.id, s.skill_id, s.teacher_id, s.starts_at, s.ends_at,
           j.lat, j.lng, coalesce(nullif(p.city, ''), 'Nearby') as city
      from public.availability_slots s
      join public.profiles p on p.id = s.teacher_id
      cross join lateral public.jitter_point(s.id, s.lat, s.lng) j
     where s.status = 'open'
       and s.mode = 'in_person'
       and s.starts_at > now()
       and s.lat is not null and s.lng is not null
       and s.lat between p_min_lat and p_max_lat
       -- A globe viewport can wrap past the antimeridian, and when zoomed all
       -- the way out it is wider than the world.
       and (
         p_max_lng - p_min_lng >= 360
         or (p_min_lng <= p_max_lng and s.lng between p_min_lng and p_max_lng)
         or (p_min_lng >  p_max_lng and (s.lng >= p_min_lng or s.lng <= p_max_lng))
       )
  ),
  pins as (
    select 'slot'::text as kind, v.id as slot_id, v.lat, v.lng, 1 as session_count,
           v.city as label,
           sk.id as skill_id, sk.name as skill_name, sk.slug as skill_slug,
           pr.id as teacher_id, pr.display_name as teacher_name, pr.avatar_url as teacher_avatar,
           v.starts_at, v.ends_at
      from visible v
      join public.skills sk on sk.id = v.skill_id
      join public.profiles pr on pr.id = v.teacher_id
     where p_zoom > 6
     order by v.starts_at
     limit 300
  ),
  clusters as (
    select 'cluster'::text, null::uuid, avg(v.lat), avg(v.lng), count(*)::int,
           v.city,
           null::uuid, null::text, null::text,
           null::uuid, null::text, null::text,
           min(v.starts_at), null::timestamptz
      from visible v
     where p_zoom <= 6
     group by v.city
     order by count(*) desc
     limit 200
  )
  select * from pins
  union all
  select * from clusters;
$$;

revoke all on function public.slots_in_bounds(
  double precision, double precision, double precision, double precision, double precision
) from public, anon;

grant execute on function public.slots_in_bounds(
  double precision, double precision, double precision, double precision, double precision
) to authenticated;
