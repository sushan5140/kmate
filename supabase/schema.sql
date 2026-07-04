-- GKS Connect schema
-- Safe to re-run: every statement is idempotent (create if not exists / drop-then-create
-- for policies and triggers). Ordered in four passes so nothing references an
-- object that doesn't exist yet: (1) tables, (2) functions, (3) RLS policies
-- (which can reference any table/function since all now exist), (4) triggers
-- + seed data.

create extension if not exists pgcrypto;

-- =========================================================================
-- PASS 1: tables
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  bio text check (char_length(bio) <= 150),
  avatar_url text,
  track text check (track in ('gks_u', 'gks_g')),
  -- Only meaningful when track = 'gks_u'; drives the "up to 3, >=1 Type B" vs
  -- "up to 2, both Type B" embassy-track selection rules. See
  -- lib/validation/university-eligibility.ts for enforcement -- this is the
  -- most assumption-laden piece of the schema (the PRD's plain-English rules
  -- imply this sub-choice; it isn't a literal PRD data-model field),
  -- isolated here so it's a contained fix if wrong.
  gks_u_embassy_path text check (gks_u_embassy_path in ('general_overseas', 'r_gks')),
  major text,
  application_year int,
  is_admin boolean not null default false,
  onboarding_completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

drop index if exists profiles_username_lower_idx;
create unique index profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- Universities + eligibility as a many-rows-per-university join table, since
-- one school can appear under several track/category combinations -- e.g.
-- Ajou University is GKS-U embassy Type A, GKS-U UIC bachelor's, AND GKS-G
-- Type A all at once.
create table if not exists public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_ko text,
  city text
);

create table if not exists public.university_eligibility (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  track text not null check (track in ('gks_u', 'gks_g')),
  category text not null check (
    category in ('embassy_type_a', 'embassy_type_b_rgks', 'uic_bachelors', 'associate_degree', 'type_a', 'type_b')
  ),
  embassy_type text check (embassy_type in ('type_a', 'type_b')),
  specialization text check (specialization in ('rnd_program', 'global_network_program')),
  unique (university_id, track, category)
);

create table if not exists public.university_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  university_id uuid not null references public.universities(id),
  eligibility_id uuid references public.university_eligibility(id),
  priority smallint not null check (priority between 1 and 4),
  unique (user_id, priority),
  unique (user_id, university_id)
);

-- Never joined into any public profile query; only visible to the owner or
-- an accepted connection (RLS below), and structurally the app never
-- selects this table on the public profile render path at all -- see
-- app/profile/[username]/page.tsx.
create table if not exists public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('instagram', 'tiktok', 'whatsapp', 'telegram', 'discord', 'other')),
  value text not null,
  unique (user_id, type)
);

create table if not exists public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user_id <> to_user_id)
);

drop index if exists connection_requests_one_pending_pair_idx;
create unique index connection_requests_one_pending_pair_idx
  on public.connection_requests (least(from_user_id, to_user_id), greatest(from_user_id, to_user_id))
  where status = 'pending';

-- Added beyond the PRD's literal table list -- required to implement
-- "in-app notification on request + accept".
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('connection_request', 'connection_accepted')),
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  category text not null check (
    category in ('motivation', 'academic_background', 'korea_specific', 'major_specific', 'behavioral', 'curveball')
  ),
  submitted_by uuid references public.profiles(id) on delete set null,
  upvotes_count int not null default 0,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.question_upvotes (
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.draft_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('profile', 'question')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- =========================================================================
-- PASS 2: functions (all tables above already exist, so these can
-- reference any of them)
-- =========================================================================

-- security definer avoids RLS self-recursion when a policy on profiles
-- itself needs to check is_admin.
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_question_upvote_change() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    update public.interview_questions set upvotes_count = upvotes_count + 1 where id = new.question_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.interview_questions set upvotes_count = greatest(0, upvotes_count - 1) where id = old.question_id;
    return old;
  end if;
  return null;
end;
$$;

-- Writes profiles + university_choices + contact_methods atomically so
-- onboarding can never leave a partial state (e.g. username saved but
-- universities failed).
create or replace function public.complete_onboarding(
  p_user_id uuid,
  p_track text,
  p_gks_u_embassy_path text,
  p_major text,
  p_application_year int,
  p_username text,
  p_bio text,
  p_university_choices jsonb, -- [{university_id, eligibility_id, priority}]
  p_contacts jsonb            -- [{type, value}]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  choice jsonb;
  contact jsonb;
begin
  update public.profiles
  set track = p_track,
      gks_u_embassy_path = p_gks_u_embassy_path,
      major = p_major,
      application_year = p_application_year,
      username = p_username,
      bio = p_bio,
      onboarding_completed_at = now()
  where id = p_user_id;

  delete from public.university_choices where user_id = p_user_id;
  for choice in select * from jsonb_array_elements(p_university_choices) loop
    insert into public.university_choices (user_id, university_id, eligibility_id, priority)
    values (
      p_user_id,
      (choice->>'university_id')::uuid,
      nullif(choice->>'eligibility_id', '')::uuid,
      (choice->>'priority')::smallint
    );
  end loop;

  delete from public.contact_methods where user_id = p_user_id;
  for contact in select * from jsonb_array_elements(p_contacts) loop
    if coalesce(contact->>'value', '') <> '' then
      insert into public.contact_methods (user_id, type, value)
      values (p_user_id, contact->>'type', contact->>'value');
    end if;
  end loop;
end;
$$;

-- =========================================================================
-- PASS 3: RLS -- enable + policies (service-role bypasses all of this and
-- is the primary enforcement for app routes; RLS here is defense-in-depth,
-- and the only real client-facing gate for anon-key reads like Discover)
-- =========================================================================

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

alter table public.universities enable row level security;
drop policy if exists "universities_select_all" on public.universities;
create policy "universities_select_all" on public.universities for select using (true);

alter table public.university_eligibility enable row level security;
drop policy if exists "university_eligibility_select_all" on public.university_eligibility;
create policy "university_eligibility_select_all" on public.university_eligibility for select using (true);

alter table public.university_choices enable row level security;
drop policy if exists "university_choices_select_all" on public.university_choices;
create policy "university_choices_select_all" on public.university_choices for select using (true);
drop policy if exists "university_choices_write_own" on public.university_choices;
create policy "university_choices_write_own" on public.university_choices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.contact_methods enable row level security;
drop policy if exists "contact_methods_select" on public.contact_methods;
create policy "contact_methods_select" on public.contact_methods for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.connection_requests cr
      where cr.status = 'accepted'
        and (
          (cr.from_user_id = auth.uid() and cr.to_user_id = contact_methods.user_id)
          or (cr.to_user_id = auth.uid() and cr.from_user_id = contact_methods.user_id)
        )
    )
  );
drop policy if exists "contact_methods_write_own" on public.contact_methods;
create policy "contact_methods_write_own" on public.contact_methods for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.connection_requests enable row level security;
drop policy if exists "connection_requests_select_own" on public.connection_requests;
create policy "connection_requests_select_own" on public.connection_requests for select
  using (auth.uid() in (from_user_id, to_user_id));
drop policy if exists "connection_requests_insert_own" on public.connection_requests;
create policy "connection_requests_insert_own" on public.connection_requests for insert
  with check (
    auth.uid() = from_user_id
    and not exists (
      select 1 from public.blocks b where b.blocker_id = to_user_id and b.blocked_id = from_user_id
    )
  );
drop policy if exists "connection_requests_update_parties" on public.connection_requests;
create policy "connection_requests_update_parties" on public.connection_requests for update
  using (auth.uid() in (from_user_id, to_user_id));

alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id);

alter table public.interview_questions enable row level security;
drop policy if exists "interview_questions_select" on public.interview_questions;
create policy "interview_questions_select" on public.interview_questions for select
  using (status = 'approved' or submitted_by = auth.uid() or public.is_admin());
drop policy if exists "interview_questions_insert_own" on public.interview_questions;
create policy "interview_questions_insert_own" on public.interview_questions for insert
  with check (submitted_by = auth.uid());
drop policy if exists "interview_questions_update_admin" on public.interview_questions;
create policy "interview_questions_update_admin" on public.interview_questions for update
  using (public.is_admin());

alter table public.question_upvotes enable row level security;
drop policy if exists "question_upvotes_select_all" on public.question_upvotes;
create policy "question_upvotes_select_all" on public.question_upvotes for select using (true);
drop policy if exists "question_upvotes_insert_own" on public.question_upvotes;
create policy "question_upvotes_insert_own" on public.question_upvotes for insert with check (auth.uid() = user_id);
drop policy if exists "question_upvotes_delete_own" on public.question_upvotes;
create policy "question_upvotes_delete_own" on public.question_upvotes for delete using (auth.uid() = user_id);

alter table public.draft_answers enable row level security;
drop policy if exists "draft_answers_all_own" on public.draft_answers;
create policy "draft_answers_all_own" on public.draft_answers for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.reports enable row level security;
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin" on public.reports for select
  using (public.is_admin() or auth.uid() = reporter_id);

alter table public.blocks enable row level security;
drop policy if exists "blocks_all_own" on public.blocks;
create policy "blocks_all_own" on public.blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- =========================================================================
-- PASS 4: triggers + seed data
-- =========================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_question_upvote_insert on public.question_upvotes;
create trigger on_question_upvote_insert after insert on public.question_upvotes
  for each row execute function public.handle_question_upvote_change();

drop trigger if exists on_question_upvote_delete on public.question_upvotes;
create trigger on_question_upvote_delete after delete on public.question_upvotes
  for each row execute function public.handle_question_upvote_change();

-- Curated starter questions, published directly as 'approved'.
insert into public.interview_questions (text, category, submitted_by, status)
select v.text, v.category, null, 'approved'
from (values
  ('Why do you want to study in Korea specifically, rather than another country?', 'motivation'),
  ('What are your plans after you complete your GKS program?', 'motivation'),
  ('Why did you choose this major?', 'academic_background'),
  ('Tell us about a project or paper you are most proud of.', 'academic_background'),
  ('What do you know about Korean history or culture?', 'korea_specific'),
  ('How would you handle culture shock or homesickness in Korea?', 'korea_specific'),
  ('Which professor or lab at your target university would you like to work with, and why?', 'major_specific'),
  ('How does your major connect to Korea''s industry or research strengths?', 'major_specific'),
  ('Describe a time you worked in a team with a difficult member.', 'behavioral'),
  ('Tell us about a time you failed at something and what you learned.', 'behavioral'),
  ('If you were not accepted into your first-choice university, what would you do?', 'curveball'),
  ('What would you do if you disagreed with your Korean academic advisor?', 'curveball')
) as v(text, category)
where not exists (
  select 1 from public.interview_questions iq where iq.text = v.text
);
