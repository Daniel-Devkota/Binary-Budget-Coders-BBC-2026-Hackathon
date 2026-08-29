-- ============================================================================
-- Sensitive-column masking, enforced by the database rather than by the UI.
--
-- meeting_url and location_text are stripped from the grants that clients hold
-- on availability_slots, so `select *` can never return them. Clients read
-- slots through public.slots_public, which is a definer view: it decides, per
-- row, whether the viewer has earned the details.
-- ============================================================================

alter view public.slots_public set (security_invoker = off);

revoke select (meeting_url, location_text) on public.availability_slots from anon, authenticated;

grant select on public.slots_public to authenticated;
