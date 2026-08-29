/**
 * Generates the seed migration. Deterministic: same input, same SQL, so the
 * demo is reproducible and the file diffs cleanly.
 *
 *   node scripts/gen-seed.mjs > supabase/migrations/20260829000010_seed.sql
 */

// ─── deterministic PRNG ──────────────────────────────────────────────────────
let s = 0x9e3779b9
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
const pick = (a) => a[Math.floor(rnd() * a.length)]
const pickN = (a, n) => {
  const c = [...a]
  const out = []
  while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0])
  return out
}
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
const chance = (p) => rnd() < p

const q = (v) =>
  v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`

// UUID v4, deterministic from the PRNG.
const uuid = () => {
  const h = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 32; i++) {
    if (i === 12) out += '4'
    else if (i === 16) out += h[(Math.floor(rnd() * 16) & 0x3) | 0x8]
    else out += h[Math.floor(rnd() * 16)]
    if (i === 7 || i === 11 || i === 15 || i === 19) out += '-'
  }
  return out
}

// ─── catalog ─────────────────────────────────────────────────────────────────
const CATALOG = [
  ['Music', 'music', 'Music2', [
    ['Acoustic Guitar', 'Chords, strumming patterns and your first ten songs.'],
    ['Piano', 'Sight reading, scales and playing by ear.'],
    ['Music Production', 'Ableton and Logic: arrangement, mixing, releasing a track.'],
    ['Singing', 'Breath support, pitch and stage nerves.'],
    ['Drums', 'Grooves, rudiments and keeping time under pressure.'],
    ['DJing', 'Beatmatching, transitions and reading a room.'],
  ]],
  ['Languages', 'languages', 'Languages', [
    ['Spanish', 'Conversational Spanish from zero to holding your own.'],
    ['Mandarin', 'Tones, characters and everyday conversation.'],
    ['Japanese', 'Hiragana through to ordering dinner without pointing.'],
    ['French', 'Pronunciation, grammar and real conversation practice.'],
    ['Auslan', 'Australian Sign Language for everyday situations.'],
    ['Arabic', 'Levantine and Modern Standard for beginners.'],
    ['Korean', 'Hangul, polite forms and K-drama comprehension.'],
  ]],
  ['Software', 'software', 'Code', [
    ['React', 'Components, hooks and shipping something people use.'],
    ['Python', 'From first script to something genuinely useful.'],
    ['SQL & Databases', 'Joins, indexes and thinking in sets.'],
    ['Git & GitHub', 'Branching, rebasing and getting out of trouble.'],
    ['Rust', 'Ownership, borrowing and why the compiler is your friend.'],
    ['Machine Learning', 'Practical models without the maths PhD.'],
    ['iOS & Swift', 'Build and ship your first app to TestFlight.'],
  ]],
  ['Design', 'design', 'PenTool', [
    ['Figma', 'Auto layout, components and handing off cleanly.'],
    ['Illustration', 'Line, shape and finding your own style.'],
    ['Typography', 'Choosing type and setting it like you mean it.'],
    ['3D & Blender', 'Modelling, lighting and your first render.'],
    ['Brand Identity', 'Logos, systems and telling a story visually.'],
  ]],
  ['Cooking', 'cooking', 'ChefHat', [
    ['Pasta from Scratch', 'Dough, shaping and sauces that cling.'],
    ['Thai Cooking', 'Curry pastes, balance and wok control.'],
    ['Sourdough Bread', 'Starter care, shaping and a proper crust.'],
    ['Dumplings', 'Wrappers, folds and fillings that stay juicy.'],
    ['Knife Skills', 'Grip, technique and speed without losing a finger.'],
    ['Vegan Cooking', 'Flavour and protein without the substitutes.'],
  ]],
  ['Fitness', 'fitness', 'Dumbbell', [
    ['Bouldering', 'Movement, footwork and reading a problem.'],
    ['Running Form', 'Cadence, breathing and building to 10k.'],
    ['Yoga', 'Alignment, breath and a sustainable home practice.'],
    ['Olympic Lifting', 'Snatch and clean & jerk, safely.'],
    ['Swimming Technique', 'Freestyle stroke correction and breathing.'],
    ['Boxing Basics', 'Stance, footwork and pad work.'],
  ]],
  ['Crafts', 'crafts', 'Scissors', [
    ['Pottery', 'Centring, throwing and your first mug.'],
    ['Knitting', 'Cast on, cables and finishing properly.'],
    ['Woodworking', 'Hand tools, joinery and a shelf that lasts.'],
    ['Sewing & Mending', 'Machine basics and rescuing clothes you love.'],
    ['Bike Maintenance', 'Gears, brakes and never being stranded.'],
  ]],
  ['Photo & Video', 'photo-video', 'Camera', [
    ['Film Photography', 'Exposure, developing and the joy of waiting.'],
    ['Video Editing', 'Premiere and DaVinci: cut, colour, export.'],
    ['Portrait Lighting', 'One light, many looks.'],
    ['Phone Videography', 'Everything you need is already in your pocket.'],
  ]],
  ['Business', 'business', 'Briefcase', [
    ['Public Speaking', 'Structure, nerves and holding a room.'],
    ['Personal Finance', 'Budgets, super and compounding.'],
    ['Freelancing', 'Pricing, contracts and finding clients.'],
    ['Product Management', 'Discovery, prioritisation and saying no.'],
    ['Resume & Interviews', 'Telling your story so people remember it.'],
  ]],
  ['Academic', 'academic', 'GraduationCap', [
    ['Calculus', 'Limits, derivatives and integrals that finally click.'],
    ['Statistics', 'Distributions, inference and reading a paper critically.'],
    ['Essay Writing', 'Argument, structure and editing ruthlessly.'],
    ['Chemistry', 'Bonding, reactions and exam technique.'],
    ['Physics', 'Mechanics and electromagnetism, intuitively.'],
  ]],
  ['Games & Play', 'games', 'Dices', [
    ['Chess', 'Openings, tactics and thinking a move ahead.'],
    ['Board Game Design', 'Mechanics, balance and playtesting.'],
    ['Dungeon Mastering', 'Running a table people talk about for years.'],
    ['Speedcubing', 'CFOP and sub-30 seconds.'],
  ]],
  ['Life Skills', 'life-skills', 'Sprout', [
    ['Gardening', 'Balcony to backyard, and keeping things alive.'],
    ['Car Basics', 'Oil, tyres and not being sold something you do not need.'],
    ['First Aid', 'CPR, bleeding control and staying calm.'],
    ['Meditation', 'A practice that survives a busy week.'],
    ['Home Coffee', 'Grind, ratio and dialling in an espresso.'],
  ]],
]

const CITIES = [
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Sydney', 'Australia', -33.8688, 151.2093],
  ['Newtown', 'Australia', -33.8983, 151.1793],
  ['Surry Hills', 'Australia', -33.8845, 151.2116],
  ['Parramatta', 'Australia', -33.8150, 151.0011],
  ['Chatswood', 'Australia', -33.7969, 151.1803],
  ['Bondi', 'Australia', -33.8915, 151.2767],
  ['Melbourne', 'Australia', -37.8136, 144.9631],
  ['Brisbane', 'Australia', -27.4698, 153.0251],
]

const FIRST = ['Maya','Sam','Priya','Tom','Aisha','Ben','Linh','Ravi','Chloe','Omar','Sophie','Daniel','Hana','Jack','Fatima','Leo','Mei','Noah','Zara','Ethan','Isla','Kai','Amara','Felix','Nina','Arjun','Grace','Hugo','Yuki','Marcus','Layla','Oscar','Ivy','Diego','Freya','Aria','Elias','Rosa','Theo','Nadia','Callum','Jia','Sione','Emilia','Rowan','Tara','Micah','Elena','Jonas','Anika','Bilal','Cleo']
const LAST = ['Chen','Okafor','Nguyen','Sharma','Rahman','Walker','Tran','Patel','Moreau','Haddad','Ellis','Kovac','Sato','Murphy','Alvi','Bianchi','Lin','Hughes','Ahmed','Brooks','Kelly','Tupou','Osei','Reyes','Novak','Kaur','Dumont','Bauer','Yamada','Silva','Karam','Whitfield','Larsen','Costa','Berg','Popov','Mensah','Ferreira','Ivanov','Kaya','Doyle','Wong','Fifita','Rossi','Byrne','Shah','Levy','Petrov','Halvorsen','Devi','Aziz','Marchetti']

const HEADLINES = [
  'Learns fast, teaches slower and more patiently',
  'Weekend maker, weekday everything else',
  'Will trade almost anything for good coffee',
  'Two years in, still a beginner at most things',
  'Happiest explaining something to someone new',
  'Collector of half-finished projects',
  'Believes everyone should be able to fix one thing',
  'Show up curious, leave slightly better',
  'Teaching is how I actually learn it',
  'Ask me the obvious question, I like those',
]

const BIOS = [
  'I picked this up during lockdown and never stopped. Happy to start from absolute zero with you — no assumed knowledge, no jargon.',
  'Self-taught, which means I remember exactly which bits were confusing. I teach the way I wish someone had taught me.',
  'Ten years of doing this badly, three of doing it well. The gap between those is what I can save you.',
  'I run sessions like a conversation, not a lecture. Bring a question and we will follow it wherever it goes.',
  'Patient, unhurried and allergic to gatekeeping. If you have been told you are "not a natural", come anyway.',
  'I mostly teach beginners and I genuinely prefer it. The first hour is the one that decides whether you keep going.',
  'Studying at uni, teaching on the side to pay for the hobby that got out of hand.',
  'Moved here three years ago and learned half of what I know by swapping lessons with strangers. Returning the favour.',
]

const ONLINE_URLS = [
  'https://meet.google.com/kxr-demo-blk',
  'https://zoom.us/j/98213470012',
  'https://meet.google.com/pqa-demo-blk',
  'https://whereby.com/blocks-session',
]
const PLACES = [
  'Fisher Library, level 2 study rooms, USyd',
  'Single O Surry Hills — the long bench at the back',
  'Camperdown Memorial Rest Park, near the rotunda',
  'Newtown Neighbourhood Centre, room 3',
  'The Rocks Bouldering Gym, front desk',
  'Chatswood Library, meeting room B',
  'Bondi Pavilion, upstairs studio',
  'Marrickville Library, group study 4',
]

// ─── build ───────────────────────────────────────────────────────────────────
const out = []
const w = (line) => out.push(line)

w(`-- ============================================================================`)
w(`-- Seed data. Generated by scripts/gen-seed.mjs — edit that, not this file.`)
w(`--`)
w(`-- Demo accounts (password: blocks1234):`)
w(`--   maya@blocks.demo  — teaches Spanish, wants Acoustic Guitar`)
w(`--   sam@blocks.demo   — teaches Acoustic Guitar, wants Spanish`)
w(`-- They are a perfect swap for each other, which is the demo's opening move.`)
w(`-- ============================================================================`)
w(``)
w(`do $seed$`)
w(`declare`)
w(`  v_now timestamptz := date_trunc('hour', now());`)
w(`begin`)
w(``)

// categories
const catIds = {}
CATALOG.forEach(([name, slug, icon], i) => {
  const id = uuid()
  catIds[slug] = id
  w(`insert into public.skill_categories (id, name, slug, icon, sort) values (${q(id)}, ${q(name)}, ${q(slug)}, ${q(icon)}, ${i});`)
})
w(``)

// skills
const skills = []
for (const [, catSlug, , list] of CATALOG) {
  for (const [name, desc] of list) {
    const id = uuid()
    const slug = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    skills.push({ id, name, slug, catSlug })
    w(`insert into public.skills (id, category_id, name, slug, description) values (${q(id)}, ${q(catIds[catSlug])}, ${q(name)}, ${q(slug)}, ${q(desc)});`)
  }
}
w(``)

const skillBySlug = Object.fromEntries(skills.map((s) => [s.slug, s]))

// ─── users ───────────────────────────────────────────────────────────────────
const users = []
const usedNames = new Set()

function makeUser(email, first, last) {
  const id = uuid()
  const [city, country, lat, lng] = pick(CITIES)
  const u = {
    id,
    email,
    name: `${first} ${last}`,
    city, country,
    lat: lat + (rnd() - 0.5) * 0.05,
    lng: lng + (rnd() - 0.5) * 0.05,
    headline: pick(HEADLINES),
    bio: pick(BIOS),
    teach: [],
    learn: [],
  }
  users.push(u)
  return u
}

// Demo pair first, so their ids are stable at the top of the file.
const maya = makeUser('maya@blocks.demo', 'Maya', 'Chen')
const sam = makeUser('sam@blocks.demo', 'Sam', 'Okafor')

for (let i = 0; i < 52; i++) {
  let first = pick(FIRST), last = pick(LAST), tries = 0
  while (usedNames.has(`${first} ${last}`) && tries++ < 40) { first = pick(FIRST); last = pick(LAST) }
  usedNames.add(`${first} ${last}`)
  makeUser(`${first.toLowerCase()}.${last.toLowerCase()}${i}@blocks.demo`, first, last)
}

// auth users + identities. The handle_new_user trigger creates the profile and
// the 2-token signup grant, so we only patch the profile afterwards.
w(`-- Accounts. Password for every seeded account is 'blocks1234'.`)
for (const u of users) {
  w(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)}, extensions.crypt('blocks1234', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', ${q(JSON.stringify({ display_name: u.name }))}::jsonb, now(), now());`)
  w(`insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (${q(u.id)}, ${q(u.id)}, ${q(JSON.stringify({ sub: u.id, email: u.email, email_verified: true }))}::jsonb, 'email', now(), now(), now());`)
}
w(``)

for (const u of users) {
  w(`update public.profiles set display_name = ${q(u.name)}, headline = ${q(u.headline)}, bio = ${q(u.bio)}, city = ${q(u.city)}, country = ${q(u.country)}, lat = ${u.lat.toFixed(5)}, lng = ${u.lng.toFixed(5)}, created_at = now() - (interval '1 day' * ${int(3, 240)}) where id = ${q(u.id)};`)
}
w(``)

// ─── teach / learn ───────────────────────────────────────────────────────────
const PROF = ['beginner', 'intermediate', 'advanced', 'expert']
const TEACH_BLURBS = [
  'Happy to go at whatever pace suits you.',
  'I bring everything you need — just turn up.',
  'We will have you doing the real thing in the first session.',
  'Absolute beginners genuinely welcome.',
  'I keep it practical: less theory, more doing.',
  'Bring a specific goal and we will aim straight at it.',
]
const LEARN_BLURBS = [
  'Complete beginner, keen and slightly nervous.',
  'Tried teaching myself and hit a wall.',
  'Want to get good enough to be useful, not perfect.',
  'Have about an hour a week and want to use it well.',
  'Been meaning to start this for about four years.',
]

// The demo pair is wired by hand so "perfect swaps" has something to find.
maya.teach = [{ slug: 'spanish', prof: 'expert' }, { slug: 'sourdough-bread', prof: 'advanced' }]
maya.learn = ['acoustic-guitar', 'bouldering']
sam.teach = [{ slug: 'acoustic-guitar', prof: 'advanced' }, { slug: 'music-production', prof: 'intermediate' }]
sam.learn = ['spanish', 'sourdough-bread']

for (const u of users) {
  if (u.teach.length === 0) {
    const t = pickN(skills, int(1, 3))
    u.teach = t.map((sk) => ({ slug: sk.slug, prof: pick(PROF.slice(1)) }))
    const teachSlugs = new Set(u.teach.map((t) => t.slug))
    u.learn = pickN(skills.filter((sk) => !teachSlugs.has(sk.slug)), int(1, 3)).map((sk) => sk.slug)
  }
  for (const t of u.teach) {
    w(`insert into public.user_skills (user_id, skill_id, kind, proficiency, blurb) values (${q(u.id)}, ${q(skillBySlug[t.slug].id)}, 'teach', ${q(t.prof)}, ${q(pick(TEACH_BLURBS))});`)
  }
  for (const l of u.learn) {
    w(`insert into public.user_skills (user_id, skill_id, kind, proficiency, blurb) values (${q(u.id)}, ${q(skillBySlug[l].id)}, 'learn', 'beginner', ${q(pick(LEARN_BLURBS))});`)
  }
}
w(``)

// ─── slots ───────────────────────────────────────────────────────────────────
// Times are expressed relative to v_now so the demo never shows a stale calendar.
const slots = []
function emitSlot(u, skillSlug, offsetHours, mode) {
  const id = uuid()
  const online = mode === 'online'
  slots.push({ id, teacher: u.id, skill: skillSlug, offsetHours })
  w(`insert into public.availability_slots (id, teacher_id, skill_id, starts_at, ends_at, mode, location_text, meeting_url, lat, lng, status)
values (${q(id)}, ${q(u.id)}, ${q(skillBySlug[skillSlug].id)}, v_now + interval '${offsetHours} hours', v_now + interval '${offsetHours + 1} hours', ${q(mode)}, ${online ? 'null' : q(pick(PLACES))}, ${online ? q(pick(ONLINE_URLS)) : 'null'}, ${online ? 'null' : (u.lat).toFixed(5)}, ${online ? 'null' : (u.lng).toFixed(5)}, 'open');`)
  return id
}

for (const u of users) {
  const n = u === maya || u === sam ? 4 : int(0, 4)
  for (let i = 0; i < n; i++) {
    const t = pick(u.teach)
    // Daytime-ish slots spread over the next fortnight.
    const day = int(1, 13)
    const hour = pick([9, 10, 11, 13, 14, 15, 17, 18, 19])
    emitSlot(u, t.slug, day * 24 + hour, chance(0.6) ? 'online' : 'in_person')
  }
}
w(``)

// ─── history: completed sessions so the platform looks lived-in ──────────────
w(`-- Past sessions. These give the feed, the ledger and profiles some history.`)
const completedPairs = []
for (let i = 0; i < 40; i++) {
  const teacher = pick(users)
  if (!teacher.teach.length) continue
  const learner = pick(users.filter((x) => x.id !== teacher.id))
  const t = pick(teacher.teach)
  const slotId = uuid()
  const bookingId = uuid()
  const daysAgo = int(2, 60)
  const hour = int(9, 19)
  const paymentType = chance(0.45) ? 'swap' : 'token'
  w(`insert into public.availability_slots (id, teacher_id, skill_id, starts_at, ends_at, mode, location_text, meeting_url, status)
values (${q(slotId)}, ${q(teacher.id)}, ${q(skillBySlug[t.slug].id)}, v_now - interval '${daysAgo} days' + interval '${hour} hours', v_now - interval '${daysAgo} days' + interval '${hour + 1} hours', 'online', null, ${q(pick(ONLINE_URLS))}, 'booked');`)
  w(`insert into public.bookings (id, slot_id, teacher_id, learner_id, skill_id, payment_type, status, held_at, confirmed_at, created_at)
values (${q(bookingId)}, ${q(slotId)}, ${q(teacher.id)}, ${q(learner.id)}, ${q(skillBySlug[t.slug].id)}, ${q(paymentType)}, 'completed', v_now - interval '${daysAgo} days' + interval '${hour + 1} hours', v_now - interval '${daysAgo - 1} days', v_now - interval '${daysAgo + 4} days');`)
  if (paymentType === 'token') {
    w(`insert into public.token_ledger (user_id, delta, reason, booking_id) values (${q(learner.id)}, -1, 'booking_hold', ${q(bookingId)});`)
    w(`insert into public.token_ledger (user_id, delta, reason, booking_id) values (${q(teacher.id)}, 1, 'teach_earn', ${q(bookingId)});`)
  }
  completedPairs.push({ bookingId, teacher, learner, skill: t.slug, daysAgo })
}
w(``)

// Keep balances plausible without letting the seed drive anyone negative.
w(`update public.profiles set token_balance = greatest(0, least(5, token_balance));`)
w(``)

// ─── follows ─────────────────────────────────────────────────────────────────
for (const u of users) {
  for (const other of pickN(users.filter((x) => x.id !== u.id), int(2, 9))) {
    w(`insert into public.follows (follower_id, followee_id) values (${q(u.id)}, ${q(other.id)}) on conflict do nothing;`)
  }
}
w(``)

// ─── feed posts from completed sessions ──────────────────────────────────────
const CAPTIONS = [
  'First time holding a barre chord without wincing. Two more sessions and I might be dangerous.',
  'Traded an hour of Spanish for an hour of sourdough. Both of us went home with something.',
  'Turns out the thing I found impossible was just one grip adjustment away.',
  'An hour in and I understood more than six months of videos gave me.',
  'Swapped skills over coffee. Best hour of my week, and it cost nothing.',
  'Taught this for the first time today. Explaining it made me realise how much I actually know.',
  'Absolute beginner this morning, made a genuinely edible thing by lunch.',
  'Booked one session to try it. Booked three more before I left.',
]
for (const p of pickN(completedPairs, 14)) {
  const published = chance(0.75)
  w(`insert into public.posts (booking_id, author_id, partner_id, caption, status, created_at)
values (${q(p.bookingId)}, ${q(p.learner.id)}, ${q(p.teacher.id)}, ${q(pick(CAPTIONS))}, ${q(published ? 'published' : 'pending_consent')}, v_now - interval '${p.daysAgo - 1} days');`)
}
w(``)

// ─── conversations ───────────────────────────────────────────────────────────
const OPENERS = [
  'Hey! Saw your Thursday slot — is it alright if I turn up with zero experience?',
  'Hi, I am keen to book but Thursday is tight for me. Any chance of the weekend?',
  'Your profile says beginners welcome — does that include someone who has never touched one?',
  'Would you be up for a swap instead of a token? I teach something you have on your list.',
]
const REPLIES = [
  'Absolutely, zero experience is my favourite starting point. Just bring yourself.',
  'Sunday morning works for me — I will put a slot up tonight.',
  'Yes, genuinely. Half the people I teach have never tried it before.',
  'A swap sounds great. Send the proposal through and I will accept it.',
]
for (let i = 0; i < 18; i++) {
  const a = pick(users)
  const b = pick(users.filter((x) => x.id !== a.id))
  const [ua, ub] = a.id < b.id ? [a, b] : [b, a]
  const convId = uuid()
  const hoursAgo = int(1, 200)
  w(`insert into public.conversations (id, user_a, user_b, last_message_at, created_at) values (${q(convId)}, ${q(ua.id)}, ${q(ub.id)}, v_now - interval '${hoursAgo} hours', v_now - interval '${hoursAgo + 2} hours') on conflict do nothing;`)
  const idx = int(0, OPENERS.length - 1)
  w(`insert into public.messages (conversation_id, sender_id, body, read_at, created_at) select ${q(convId)}, ${q(a.id)}, ${q(OPENERS[idx])}, now(), v_now - interval '${hoursAgo + 2} hours' where exists (select 1 from public.conversations where id = ${q(convId)});`)
  w(`insert into public.messages (conversation_id, sender_id, body, read_at, created_at) select ${q(convId)}, ${q(b.id)}, ${q(REPLIES[idx])}, now(), v_now - interval '${hoursAgo} hours' where exists (select 1 from public.conversations where id = ${q(convId)});`)
}
w(``)

// A live conversation for the demo pair.
const demoConv = uuid()
const [da, db] = maya.id < sam.id ? [maya, sam] : [sam, maya]
w(`insert into public.conversations (id, user_a, user_b, last_message_at, created_at) values (${q(demoConv)}, ${q(da.id)}, ${q(db.id)}, v_now - interval '3 hours', v_now - interval '2 days') on conflict do nothing;`)
w(`insert into public.messages (conversation_id, sender_id, body, read_at, created_at) values (${q(demoConv)}, ${q(sam.id)}, 'Hey Maya — I saw you teach Spanish and want guitar. That is exactly the other way around from me.', now(), v_now - interval '5 hours');`)
w(`insert into public.messages (conversation_id, sender_id, body, read_at, created_at) values (${q(demoConv)}, ${q(maya.id)}, 'Ha, perfect. Send a swap through and I will take a look tonight.', null, v_now - interval '3 hours');`)
w(``)

// ─── open skill requests ─────────────────────────────────────────────────────
const REQUESTS = [
  ['Anyone teach Auslan around Newtown?', 'My partner’s family signs and I want to hold a real conversation by Christmas. Happy to swap for Python or bike repair.', 'auslan'],
  ['Want to learn to fix my own bike', 'Gears slip and I keep paying someone $80 to fix it in ten minutes. Would rather learn.', 'bike-maintenance'],
  ['Beginner pottery, ideally hands-on', 'Tried a one-off class, loved it, want someone patient for a few sessions.', 'pottery'],
  ['Help me get through first-year statistics', 'I can follow the lectures and then freeze on the assignments. Need someone to work problems with me.', 'statistics'],
  ['Looking for conversational Japanese practice', 'N5-ish. I do not need grammar drills, I need someone to talk to me slowly.', 'japanese'],
  ['Teach me to make dumplings properly', 'Mine leak every single time. I have given up diagnosing it alone.', 'dumplings'],
  ['Anyone up for teaching sea kayaking?', 'Nothing on the platform for this yet — happy to travel to wherever the water is.', null],
]
for (const [title, desc, slug] of REQUESTS) {
  const requester = pick(users)
  w(`insert into public.skill_requests (requester_id, title, description, resolved_skill_id, status, created_at)
values (${q(requester.id)}, ${q(title)}, ${q(desc)}, ${slug ? q(skillBySlug[slug].id) : 'null'}, ${q(slug ? 'open' : 'pending_review')}, v_now - interval '${int(2, 120)} hours');`)
}
w(``)

w(`end`)
w(`$seed$;`)

process.stdout.write(out.join('\n') + '\n')
