-- ============================================================================
-- Schedule the sweep every 15 minutes.
--
-- Deliberately its own migration, and deliberately wrapped so it cannot fail
-- the push. pg_cron is a superuser-ish extension and whether a CLI migration
-- may create and schedule against it varies by project; the sweep itself
-- (20260830000001) is what matters and it is already in. If this block only
-- raises a notice, the lazy call from fetchMyBookings still covers us — that
-- call ships regardless, for exactly this reason.
--
-- Note: on this Supabase build pg_cron installs into pg_catalog, not
-- `extensions`. Do not add `with schema extensions` — it is rejected.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;

  -- unschedule first so re-running is harmless
  begin
    perform cron.unschedule('auto-confirm-bookings');
  exception when others then null;
  end;

  perform cron.schedule(
    'auto-confirm-bookings',
    '*/15 * * * *',
    $cron$select public.run_auto_confirms()$cron$
  );
  raise notice 'pg_cron: auto-confirm-bookings scheduled every 15 minutes';
exception when others then
  raise notice 'pg_cron unavailable (%) — auto-confirm relies on the lazy sweep from /bookings', sqlerrm;
end $$;
