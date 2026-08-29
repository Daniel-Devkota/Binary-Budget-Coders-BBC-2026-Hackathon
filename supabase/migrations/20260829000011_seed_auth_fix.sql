-- GoTrue scans several auth.users token columns into non-nullable Go strings.
-- Seeded rows left them NULL, which surfaces as "Database error querying schema"
-- on sign-in. Empty string is what a real signup writes.
update auth.users
   set confirmation_token     = coalesce(confirmation_token, ''),
       recovery_token         = coalesce(recovery_token, ''),
       email_change_token_new = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       email_change           = coalesce(email_change, ''),
       phone_change           = coalesce(phone_change, ''),
       phone_change_token     = coalesce(phone_change_token, ''),
       reauthentication_token = coalesce(reauthentication_token, '')
 where email like '%@blocks.demo';

-- Slots are for signed-in people only.
revoke select on public.slots_public from anon;
