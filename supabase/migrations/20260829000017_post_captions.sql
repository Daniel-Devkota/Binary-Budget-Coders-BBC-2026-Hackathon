-- Seeded captions were picked at random and often described a different skill
-- from the session they hung off. Rewrite them from the post's own skill so the
-- feed reads like something real people wrote.
update public.posts p
   set caption = case abs(hashtext(p.id::text)) % 8
     when 0 then 'First hour of ' || s.name || ' and I already understand more than six months of videos gave me.'
     when 1 then 'Traded an hour of ' || s.name || ' for an hour of something I know. Both of us went home with something.'
     when 2 then 'Turns out the ' || s.name || ' thing I found impossible was one small adjustment away.'
     when 3 then 'Absolute beginner at ' || s.name || ' this morning. Not any more.'
     when 4 then 'Taught ' || s.name || ' for the first time today. Explaining it made me realise how much I actually know.'
     when 5 then 'Swapped ' || s.name || ' over coffee. Best hour of my week, and it cost nothing.'
     when 6 then 'Booked one ' || s.name || ' session to try it. Booked three more before I left.'
     else 'Nobody has ever explained ' || s.name || ' to me without making me feel stupid. Until today.'
   end
  from public.skills s
 where s.id = p.skill_id;
