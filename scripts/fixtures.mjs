/**
 * Bookings in states the client API cannot reach — a session that already
 * started, a held booking whose 48 hours are up. Shared by the confirmation
 * tests. Everything created here carries a marker so cleanup is total — which
 * also means the suites share one namespace and have to be run one at a time.
 * Two at once and each one's cleanup deletes the other's fixtures mid-run.
 */
import { q, q1 } from './dbq.mjs'

/** Test slots are tagged in location_text so a stray run can always be swept. */
export const MARK = '__confirm-test__'

export const DEMO = {
  maya: 'maya@blocks.demo',
  sam: 'sam@blocks.demo',
  password: 'blocks1234',
}

export const idOf = (email) =>
  q1(`select id from auth.users where email = '${email}'`).id

/**
 * Creates a slot and a booking on it in one go.
 *   mode         'in_person' | 'online'
 *   payment      'token' | 'swap'
 *   status       booking status
 *   startsIn     interval SQL, e.g. `-'30 minutes'::interval`, relative to now()
 */
export function mkBooking({
  teacher, learner, mode = 'in_person', payment = 'token',
  status = 'confirmed', startsAt = "now() - interval '30 minutes'",
  heldAt = 'null', autoConfirmAt = 'null',
}) {
  return q1(`
    with s as (
      insert into public.availability_slots
        (teacher_id, skill_id, starts_at, ends_at, mode, location_text, meeting_url, status)
      select '${teacher}',
             (select skill_id from public.user_skills where user_id = '${teacher}' and kind = 'teach' limit 1),
             ${startsAt}, ${startsAt} + interval '1 hour', '${mode}',
             ${mode === 'in_person' ? `'${MARK} Newtown Library'` : 'null'},
             ${mode === 'online' ? `'https://meet.example.com/${MARK}'` : 'null'},
             'booked'
      returning id, skill_id
    )
    insert into public.bookings
      (slot_id, teacher_id, learner_id, skill_id, payment_type, status, held_at, auto_confirm_at)
    select s.id, '${teacher}', '${learner}', s.skill_id, '${payment}', '${status}', ${heldAt}, ${autoConfirmAt}
      from s
    returning id, slot_id
  `)
}

/** Deletes every booking, ledger row and slot this file ever created. */
export function cleanup() {
  // session_codes and its attempt counters only exist from the Phase 2
  // migrations onwards, and the counters are sequences rather than rows.
  q(`do $$
     declare v_id uuid;
     begin
       if to_regclass('public.session_codes') is null then return; end if;
       for v_id in
         delete from public.session_codes c
          where c.booking_id in (
            select b.id from public.bookings b
              join public.availability_slots s on s.id = b.slot_id
             where s.location_text like '${MARK}%' or s.meeting_url like '%${MARK}%')
         returning c.booking_id
       loop
         perform confirm_guard.reset(v_id);
       end loop;
     end $$`)
  return q1(`
    with slots as (
      select id from public.availability_slots
       where location_text like '${MARK}%' or meeting_url like '%${MARK}%'
    ),
    bk as (select id from public.bookings where slot_id in (select id from slots)),
    dl as (delete from public.token_ledger where booking_id in (select id from bk)
             returning user_id, delta),
    -- The ledger trigger only fires on insert, so deleting a test row leaves
    -- profiles.token_balance high. Put back exactly what we removed.
    fix as (
      update public.profiles p set token_balance = p.token_balance - x.d
        from (select user_id, sum(delta) as d from dl group by user_id) x
       where p.id = x.user_id returning 1
    ),
    dp as (delete from public.posts where booking_id in (select id from bk) returning 1),
    db as (delete from public.bookings where id in (select id from bk) returning 1),
    ds as (delete from public.availability_slots where id in (select id from slots) returning 1)
    select (select count(*) from dl)::int as ledger,
           (select count(*) from db)::int as bookings,
           (select count(*) from ds)::int as slots
  `)
}

export const balanceOf = (id) =>
  q1(`select token_balance from public.profiles where id = '${id}'`).token_balance

export const bookingOf = (id) =>
  q1(`select status, confirmed_method, held_at, confirmed_at, payment_type
        from public.bookings where id = '${id}'`)

export const earnRowsFor = (id) =>
  q1(`select count(*)::int as n from public.token_ledger
       where booking_id = '${id}' and reason = 'teach_earn'`).n

