-- Session photos. Public read (posts are only visible once both people consent,
-- and the URL is unguessable), authenticated write into your own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-photos', 'session-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "session photos are readable"
  on storage.objects for select
  using (bucket_id = 'session-photos');

create policy "upload your own session photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'session-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete your own session photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'session-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Avatars, same shape.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars are readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "upload your own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "replace your own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
