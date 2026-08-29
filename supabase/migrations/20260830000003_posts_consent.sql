-- ============================================================================
-- Consent on a post belongs to the partner, and only to the partner.
--
-- posts_update read `author_id = auth.uid() or partner_id = auth.uid()`, so the
-- author could publish their own pending_consent post with one direct API call.
-- The UI has never offered it, which is why nobody noticed — but README.md
-- claims consent is enforced in the database, and until now it was enforced in
-- the dialog.
--
-- setPostConsent (api.ts) has exactly one caller, the partner's consent card on
-- FeedPage, so nothing in the app loses a path it was using. An author-delete
-- route can be added separately if one is ever wanted.
-- ============================================================================

drop policy if exists posts_update on public.posts;

create policy posts_update on public.posts for update to authenticated
  using (partner_id = auth.uid())
  with check (partner_id = auth.uid());
