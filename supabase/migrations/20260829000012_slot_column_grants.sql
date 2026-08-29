-- Postgres will not let you carve a column out of an existing table-wide grant:
-- the table-level SELECT has to go first, then the safe columns are granted back.
-- Without this, `select meeting_url from availability_slots` still succeeds.
revoke select on public.availability_slots from anon, authenticated;

grant select (
  id, teacher_id, skill_id, starts_at, ends_at, mode, lat, lng, status, created_at
) on public.availability_slots to authenticated;
