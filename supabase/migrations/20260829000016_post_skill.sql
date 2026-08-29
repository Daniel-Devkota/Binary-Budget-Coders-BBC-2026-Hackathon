-- A post embeds its booking only to name the skill, but bookings are readable
-- by their two participants alone — so for everyone else the join came back
-- null and the feed lost its labels. Denormalise the skill onto the post.
alter table public.posts add column skill_id uuid references public.skills on delete set null;

update public.posts p
   set skill_id = b.skill_id
  from public.bookings b
 where b.id = p.booking_id;

create index on public.posts (skill_id);
