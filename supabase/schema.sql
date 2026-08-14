-- KMate schema
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

-- Admin-only override: when true, track-scoped pages (Scholar Stats,
-- Apostille Guide) show both GKS-G and GKS-U content to this user instead of
-- scoping to their own `track`. Never user-settable -- see
-- guard_profiles_locked_fields() below, mirroring how is_admin is locked.
alter table public.profiles add column if not exists dual_track_access boolean not null default false;

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

-- GKS scholar placement statistics for the 2026 Final Round -- which
-- universities and countries GKS-G/GKS-U scholars actually ended up at,
-- sourced from NIIED's official successful-candidate PDFs (Embassy track,
-- University track, and the combined Final Round list), cross-matched by
-- Candidate Number and validated row-for-row. Plain text university/country
-- columns rather than a foreign key into `universities` -- this dataset's
-- coverage of institution names isn't guaranteed to line up with that
-- table's, and nothing here needs to join against a user's saved choices.
-- Read-only reference data (like `universities`), not staging -- loaded once
-- via a one-off script, not meant to be re-verified before showing to users.
create table if not exists public.gks_university_stats (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('gks_g', 'gks_u')),
  university text not null,
  total_selected_count int not null,
  embassy_track_count int not null,
  university_track_count int not null,
  distinct_country_count int not null,
  degree_level_breakdown text not null,
  unique (track, university)
);

create table if not exists public.gks_country_stats (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('gks_g', 'gks_u')),
  country text not null,
  total_selected_count int not null,
  embassy_track_count int not null,
  university_track_count int not null,
  distinct_university_count int not null,
  degree_level_breakdown text not null,
  unique (track, country)
);

-- One row per (university, country) pair that actually has at least one
-- seat -- the cross-tab that gks_university_stats/gks_country_stats' marginal
-- totals alone can't answer (e.g. "at Korea University, which countries got
-- the most seats, and what share of that country's total seats is that?").
create table if not exists public.gks_university_country_stats (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('gks_g', 'gks_u')),
  university text not null,
  country text not null,
  seat_count int not null,
  pct_of_university_seats numeric not null,
  pct_of_country_seats numeric not null,
  unique (track, university, country)
);

-- Staging area for the "University Insights" web-research pass (structured,
-- sourced facts pulled per university -- QS rankings, majors, language of
-- instruction, cost of living, post-arrival support, degree-timeline quirks).
-- Deliberately separate from `universities`: nothing here is shown in the app
-- or treated as verified until a manual spot-check pass promotes it. RLS below
-- has no select/write policies at all, so it's service-role-only by design.
create table if not exists public.university_insights_staging (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  university_name text not null,

  qs_overall_rank text,
  qs_overall_rank_year int,
  qs_overall_rank_source_url text,

  -- one row per relevant subject: [{ subject, rank, year, source_url }], or
  -- [{ subject, rank: "not ranked", source_url }] when no subject ranking exists
  qs_subject_rankings jsonb not null default '[]'::jsonb,

  -- [{ major, source_url }]
  majors_offered jsonb not null default '[]'::jsonb,

  -- [{ program, language, source_url }] -- language is 'english' | 'korean' | 'not stated'
  language_of_instruction jsonb not null default '[]'::jsonb,

  city text,
  campus_location_source_url text,
  cost_of_living_note text,
  cost_of_living_source_url text,

  dorm_guarantee_gks text check (dorm_guarantee_gks in ('yes', 'no', 'conditional', 'not stated')),
  dorm_guarantee_source_url text,
  mentor_buddy_program text check (mentor_buddy_program in ('yes', 'no', 'not stated')),
  mentor_buddy_source_url text,
  international_student_office text check (international_student_office in ('yes', 'no', 'not stated')),
  international_student_office_source_url text,

  mandatory_korean_prep_year text check (mandatory_korean_prep_year in ('yes', 'no', 'conditional', 'not stated')),
  mandatory_korean_prep_source_url text,
  thesis_track_options text,
  thesis_track_source_url text,

  research_status text not null default 'partial' check (research_status in ('complete', 'partial', 'failed')),
  research_notes text,
  last_checked_date date not null default current_date,
  created_at timestamptz not null default now(),

  unique (university_id)
);

-- AI Mock Interview: per-session record + per-question results. Ported from
-- a standalone prototype (mock-interview-prototype.html) -- deliberately
-- persists ONLY transcript text, computed metrics, and the final feedback
-- text. No frame/video/image column exists anywhere here, on purpose: raw
-- camera data and captured frames are used transiently in the browser for
-- the single end-of-interview Gemini call and never sent to or stored by
-- this backend. Gemini access is BYOK (user's own key, client-side only),
-- so there's no API-key column here either.
create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (
    category in ('all', 'motivation', 'academic', 'korea', 'behavioral', 'curveball')
  ),
  question_count int not null check (question_count > 0),
  -- getMaxMidInterviewPauses(question_count) from the prototype, stored at
  -- session start rather than recomputed later so a future change to that
  -- scaling function can't retroactively alter what an old session allowed.
  max_mid_pauses int not null,
  mid_pauses_used int not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  final_feedback_text text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.interview_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  question_index int not null check (question_index >= 0),
  question_text text not null,
  transcript text not null default '',
  eye_contact_pct int,
  wpm int,
  filler_count int,
  long_pause_count int,
  longest_pause_sec numeric,
  posture_stability int,
  duration_sec int,
  unique (session_id, question_index)
);
alter table public.interview_session_questions add column if not exists refined_answer text;

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

-- 'admin_warning' added post-creation -- the inline check above only
-- applies at table creation, so this widens it for already-existing
-- databases too. Sent via the admin moderation queue's "Warn" action (see
-- app/api/admin/users/[id]/warn) -- payload carries { reason, warnedBy }.
--
-- 'contact_wallet_empty' added later still -- fired once per sign-in (see
-- app/auth/callback/route.ts) for an onboarded user with zero
-- contact_methods rows, so the notification bell reflects that KMate has no
-- in-app messaging and the user hasn't given anyone a way to reach them yet.
-- Auto-resolved (marked read) the moment they save >=1 contact via
-- /api/contacts -- see that route -- there's no manual dismiss for this type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = ANY (ARRAY['connection_request'::text, 'connection_accepted'::text, 'admin_warning'::text, 'contact_wallet_empty'::text]));

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  category text not null check (
    category in ('motivation', 'academic_background', 'korea_specific', 'major_specific', 'behavioral', 'curveball')
  ),
  submitted_by uuid references public.profiles(id) on delete set null,
  upvotes_count int not null default 0,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  -- 'interview' = questions applicants get asked; 'interviewer' = the
  -- separate Ask-the-Interviewer bank (PRD §4.4) -- same shape/tagging/
  -- upvote pattern, so it's a flag on this table rather than a duplicate one.
  kind text not null default 'interview' check (kind in ('interview', 'interviewer')),
  downvotes_count int not null default 0
);

-- Idempotent column add for databases that already ran an earlier version of
-- this file before `kind` existed.
alter table public.interview_questions add column if not exists kind text not null default 'interview';
alter table public.interview_questions drop constraint if exists interview_questions_kind_check;
alter table public.interview_questions add constraint interview_questions_kind_check check (kind in ('interview', 'interviewer'));
alter table public.interview_questions add column if not exists downvotes_count int not null default 0;

-- Despite the name (kept for backward compatibility -- this table predates
-- downvoting), this now stores either direction of vote, one row per
-- (question, user), distinguished by vote_type. A user can hold at most one
-- vote per question; switching direction updates the row rather than adding
-- a second one.
create table if not exists public.question_upvotes (
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  vote_type text not null default 'up' check (vote_type in ('up', 'down')),
  primary key (question_id, user_id)
);

alter table public.question_upvotes add column if not exists vote_type text not null default 'up';
alter table public.question_upvotes drop constraint if exists question_upvotes_vote_type_check;
alter table public.question_upvotes add constraint question_upvotes_vote_type_check check (vote_type in ('up', 'down'));

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
  target_type text not null check (target_type in ('profile', 'question', 'eca', 'mistake', 'app')),
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

-- PRD §12.1 Applicant Timeline. `route`/`country` nullable = applies
-- regardless of that dimension -- MVP ships one generic default template
-- (both null), with route/country-specific overrides added incrementally
-- without any app-logic changes (same "admin-editable data, not hardcoded
-- rules" lesson already applied to the universities table).
create table if not exists public.timeline_templates (
  id uuid primary key default gen_random_uuid(),
  route text check (route in ('embassy', 'university')),
  country text,
  item_label text not null,
  item_description text,
  typical_deadline_offset_days int,
  sort_order int not null default 0
);

create table if not exists public.user_timeline_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  timeline_template_item_id uuid not null references public.timeline_templates(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, timeline_template_item_id)
);

-- PRD §4.5 Extracurricular Activities ranking.
create table if not exists public.eca_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  track text not null default 'both' check (track in ('gks_u', 'gks_g', 'both')),
  submitted_by uuid references public.profiles(id) on delete set null,
  upvotes_count int not null default 0,
  downvotes_count int not null default 0,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  -- Populated only for research-seeded entries (data/gks-extracurriculars-seed-data.md);
  -- null for ordinary user submissions.
  activity_type text check (activity_type in (
    'academic_competition', 'cultural_engagement_korea', 'internship_work_experience',
    'language_study_topik', 'leadership_role', 'online_course_certification',
    'other', 'research_publication', 'volunteering_community_service'
  )),
  impact_area text check (impact_area in (
    'general_competitiveness', 'interview_talking_point', 'scoring_points_niied',
    'strengthens_recommendation', 'strengthens_sop', 'strengthens_study_plan'
  )),
  source_platform text check (source_platform in ('facebook', 'reddit', 'blog', 'forum', 'other')),
  source_url text,
  confidence text check (confidence in ('recurring_theme', 'single_anecdote'))
);

alter table public.eca_entries add column if not exists activity_type text;
alter table public.eca_entries drop constraint if exists eca_entries_activity_type_check;
alter table public.eca_entries add constraint eca_entries_activity_type_check
  check (activity_type in (
    'academic_competition', 'cultural_engagement_korea', 'internship_work_experience',
    'language_study_topik', 'leadership_role', 'online_course_certification',
    'other', 'research_publication', 'volunteering_community_service'
  ));
alter table public.eca_entries add column if not exists impact_area text;
alter table public.eca_entries drop constraint if exists eca_entries_impact_area_check;
alter table public.eca_entries add constraint eca_entries_impact_area_check
  check (impact_area in (
    'general_competitiveness', 'interview_talking_point', 'scoring_points_niied',
    'strengthens_recommendation', 'strengthens_sop', 'strengthens_study_plan'
  ));
alter table public.eca_entries add column if not exists source_platform text;
alter table public.eca_entries drop constraint if exists eca_entries_source_platform_check;
alter table public.eca_entries add constraint eca_entries_source_platform_check
  check (source_platform in ('facebook', 'reddit', 'blog', 'forum', 'other'));
alter table public.eca_entries add column if not exists source_url text;
alter table public.eca_entries add column if not exists confidence text;
alter table public.eca_entries drop constraint if exists eca_entries_confidence_check;
alter table public.eca_entries add constraint eca_entries_confidence_check
  check (confidence in ('recurring_theme', 'single_anecdote'));
alter table public.eca_entries add column if not exists downvotes_count int not null default 0;

-- Same shape/semantics as question_upvotes -- see comment above that table.
create table if not exists public.eca_upvotes (
  entry_id uuid not null references public.eca_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  vote_type text not null default 'up' check (vote_type in ('up', 'down')),
  primary key (entry_id, user_id)
);

alter table public.eca_upvotes add column if not exists vote_type text not null default 'up';
alter table public.eca_upvotes drop constraint if exists eca_upvotes_vote_type_check;
alter table public.eca_upvotes add constraint eca_upvotes_vote_type_check check (vote_type in ('up', 'down'));

-- PRD §12.2 Application Mistakes & Rejection Reasons (merged, searchable by
-- either dimension).
create table if not exists public.mistake_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  document_type text not null check (
    document_type in ('passport', 'apostille', 'recommendation', 'medical', 'transcript', 'study_plan', 'sop', 'interview', 'university_choice', 'other')
  ),
  reason_category text not null check (
    reason_category in ('weak_study_plan', 'generic_sop', 'missing_document', 'poor_interview', 'wrong_university_choice', 'other')
  ),
  submitted_by uuid references public.profiles(id) on delete set null,
  upvotes_count int not null default 0,
  downvotes_count int not null default 0,
  status text not null default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamptz not null default now(),
  -- Populated only for research-seeded entries (data/gks-mistakes-seed-data.md);
  -- null for ordinary user submissions.
  source_platform text check (source_platform in ('facebook', 'reddit', 'blog', 'forum', 'other')),
  source_url text,
  confidence text check (confidence in ('recurring_theme', 'single_anecdote'))
);

alter table public.mistake_entries add column if not exists source_platform text;
alter table public.mistake_entries drop constraint if exists mistake_entries_source_platform_check;
alter table public.mistake_entries add constraint mistake_entries_source_platform_check
  check (source_platform in ('facebook', 'reddit', 'blog', 'forum', 'other'));
alter table public.mistake_entries add column if not exists source_url text;
alter table public.mistake_entries add column if not exists confidence text;
alter table public.mistake_entries drop constraint if exists mistake_entries_confidence_check;
alter table public.mistake_entries add constraint mistake_entries_confidence_check
  check (confidence in ('recurring_theme', 'single_anecdote'));
alter table public.mistake_entries add column if not exists downvotes_count int not null default 0;

-- Same shape/semantics as question_upvotes -- see comment above that table.
create table if not exists public.mistake_upvotes (
  entry_id uuid not null references public.mistake_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  vote_type text not null default 'up' check (vote_type in ('up', 'down')),
  primary key (entry_id, user_id)
);

alter table public.mistake_upvotes add column if not exists vote_type text not null default 'up';
alter table public.mistake_upvotes drop constraint if exists mistake_upvotes_vote_type_check;
alter table public.mistake_upvotes add constraint mistake_upvotes_vote_type_check check (vote_type in ('up', 'down'));

-- PRD §12.3 AI Interview Feedback. Scoped strictly to clarity/confidence/
-- repetition/length -- never content correctness (see app/api call site).
-- Stores a snapshot of the answer text alongside the feedback rather than
-- just a draft_answer_id FK, since a draft keeps changing after the fact and
-- past feedback should stay legible against what was actually reviewed.
create table if not exists public.answer_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  answer_snapshot text not null,
  feedback_json jsonb not null,
  created_at timestamptz not null default now()
);

-- Audit trail for admin_bootstrap_promote() (see PASS 2 and
-- supabase/scripts/bootstrap-admin.ts) -- the one-time, manual, secret-gated
-- ceremony for promoting an admin when no admin session exists to do it
-- through the normal app flow. Logs both successful promotions and failed
-- attempts (e.g. wrong secret), so a leaked service-role key being used to
-- probe this is at least visible after the fact.
create table if not exists public.admin_actions_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid,
  target_email text,
  outcome text not null check (outcome in ('success', 'failure')),
  detail text,
  created_at timestamptz not null default now()
);

-- Holds the SHA-256 hash of the admin-bootstrap secret (never the plaintext
-- secret itself). A single-row table rather than a Postgres GUC/config
-- setting -- ALTER DATABASE/ROLE SET is not permitted for the connecting
-- role on Supabase's hosted Postgres (persistent config changes are
-- reserved for their control plane), so a plain RLS-locked table is the
-- portable equivalent. `id boolean primary key default true` plus the check
-- constraint enforces there can only ever be one row.
create table if not exists public.admin_bootstrap_config (
  id boolean primary key default true,
  secret_hash text not null,
  updated_at timestamptz not null default now(),
  constraint admin_bootstrap_config_singleton check (id)
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

-- Second, independent layer of defense on top of profiles_update_own's RLS
-- policy: WITH CHECK alone can only judge "is the new row acceptable," not
-- "which columns changed," so it can't stop a user from PATCHing their own
-- row with is_admin=true via a direct Supabase REST call. This trigger
-- silently reverts is_admin to its prior value unless the ACTING user
-- (auth.uid()) is already an admin -- is_admin() reads the pre-update
-- committed state, so this can't be bypassed by racing the same statement.
-- The bootstrap_promote transaction-local flag is set in exactly one place:
-- inside admin_bootstrap_promote() below, after it has already verified the
-- caller's secret. Nothing else in this codebase ever sets it, and clients
-- can't set it themselves -- PostgREST only exposes functions that live in
-- the public schema, and set_config() is a pg_catalog builtin, not one of
-- them.
create or replace function public.guard_profiles_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin
     and not public.is_admin()
     and current_setting('kmate.bootstrap_promote', true) is distinct from 'true' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

-- Locks `track` (once set) and `dual_track_access` against a normal user's
-- own direct REST call -- same shape of gap as guard_profiles_is_admin
-- guards against (profiles_update_own's RLS policy has no per-column WITH
-- CHECK, so without this a user could PATCH either field on their own row
-- directly). auth.uid() is only non-null when the request carries an actual
-- end-user session; both legitimate write paths for these two columns --
-- complete_onboarding (sets track for the first time, old.track is null)
-- and the admin user-management route (app/api/admin/users/[id]/update,
-- which checks is_admin in application code before ever reaching the DB) --
-- use the service-role client, which has no session and so skips this
-- guard entirely. dual_track_access has no legitimate self-service path at
-- all, onboarding included, so it's always locked once auth.uid() is set.
create or replace function public.guard_profiles_locked_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dual_track_access is distinct from old.dual_track_access and auth.uid() is not null then
    new.dual_track_access := old.dual_track_access;
  end if;

  if new.track is distinct from old.track and old.track is not null and auth.uid() is not null then
    new.track := old.track;
  end if;

  return new;
end;
$$;

-- One-time admin-bootstrap ceremony (see supabase/scripts/bootstrap-admin.ts
-- and SECURITY.md "Admin bootstrap"). This is the ONLY code path allowed to
-- bypass guard_profiles_is_admin()'s normal restriction when no admin
-- session exists yet to promote one through the ordinary route.
--
-- Gated on a secret whose SHA-256 hash lives only in
-- admin_bootstrap_config (a single-row, RLS-locked table set once via a
-- plain upsert in the SQL editor -- see that table's comment for why it's a
-- table and not a Postgres GUC) -- never committed to the repo, never in
-- application code. Every call is logged to admin_actions_log, success or
-- failure, so repeated wrong-secret attempts are visible after the fact.
create or replace function public.admin_bootstrap_promote(target_email text, secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_hash text;
  v_provided_hash text;
  v_user_id uuid;
begin
  v_secret_hash := (select secret_hash from public.admin_bootstrap_config limit 1);
  -- pgcrypto lives in the `extensions` schema on this project, not `public`
  -- -- fully qualified rather than widening this function's search_path.
  v_provided_hash := encode(extensions.digest(coalesce(secret, ''), 'sha256'), 'hex');

  if v_secret_hash is null or v_secret_hash = '' then
    insert into public.admin_actions_log (action, target_email, outcome, detail)
      values ('admin_bootstrap_promote', target_email, 'failure', 'no secret configured on this database');
    return false;
  end if;

  if v_provided_hash is distinct from v_secret_hash then
    insert into public.admin_actions_log (action, target_email, outcome, detail)
      values ('admin_bootstrap_promote', target_email, 'failure', 'secret mismatch');
    return false;
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(target_email);

  if v_user_id is null then
    insert into public.admin_actions_log (action, target_email, outcome, detail)
      values ('admin_bootstrap_promote', target_email, 'failure', 'no such user');
    return false;
  end if;

  perform set_config('kmate.bootstrap_promote', 'true', true);

  update public.profiles set is_admin = true where id = v_user_id;

  insert into public.admin_actions_log (action, target_user_id, target_email, outcome, detail)
    values ('admin_bootstrap_promote', v_user_id, target_email, 'success', 'promoted via admin_bootstrap_promote()');

  return true;
end;
$$;

-- PostgREST grants EXECUTE on public-schema functions to PUBLIC by default,
-- which would otherwise expose this as POST /rest/v1/rpc/admin_bootstrap_promote
-- to anon/authenticated callers. The secret check inside is the real gate,
-- but this removes the function from the deployed app's reachable surface
-- entirely -- only the service-role key (used exclusively by
-- bootstrap-admin.ts, run locally) can invoke it.
revoke all on function public.admin_bootstrap_promote(text, text) from public, anon, authenticated;
grant execute on function public.admin_bootstrap_promote(text, text) to service_role;

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
    if new.vote_type = 'up' then
      update public.interview_questions set upvotes_count = upvotes_count + 1 where id = new.question_id;
    else
      update public.interview_questions set downvotes_count = downvotes_count + 1 where id = new.question_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.vote_type = 'up' then
      update public.interview_questions set upvotes_count = greatest(0, upvotes_count - 1) where id = old.question_id;
    else
      update public.interview_questions set downvotes_count = greatest(0, downvotes_count - 1) where id = old.question_id;
    end if;
    return old;
  elsif (tg_op = 'UPDATE') then
    -- Switching direction (up<->down) on the same row, e.g. clicking
    -- downvote while already upvoted -- move the count from one column to
    -- the other rather than treating it as a fresh vote.
    if new.vote_type is distinct from old.vote_type then
      if old.vote_type = 'up' then
        update public.interview_questions set upvotes_count = greatest(0, upvotes_count - 1) where id = old.question_id;
      else
        update public.interview_questions set downvotes_count = greatest(0, downvotes_count - 1) where id = old.question_id;
      end if;
      if new.vote_type = 'up' then
        update public.interview_questions set upvotes_count = upvotes_count + 1 where id = new.question_id;
      else
        update public.interview_questions set downvotes_count = downvotes_count + 1 where id = new.question_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create or replace function public.handle_eca_upvote_change() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.vote_type = 'up' then
      update public.eca_entries set upvotes_count = upvotes_count + 1 where id = new.entry_id;
    else
      update public.eca_entries set downvotes_count = downvotes_count + 1 where id = new.entry_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.vote_type = 'up' then
      update public.eca_entries set upvotes_count = greatest(0, upvotes_count - 1) where id = old.entry_id;
    else
      update public.eca_entries set downvotes_count = greatest(0, downvotes_count - 1) where id = old.entry_id;
    end if;
    return old;
  elsif (tg_op = 'UPDATE') then
    if new.vote_type is distinct from old.vote_type then
      if old.vote_type = 'up' then
        update public.eca_entries set upvotes_count = greatest(0, upvotes_count - 1) where id = old.entry_id;
      else
        update public.eca_entries set downvotes_count = greatest(0, downvotes_count - 1) where id = old.entry_id;
      end if;
      if new.vote_type = 'up' then
        update public.eca_entries set upvotes_count = upvotes_count + 1 where id = new.entry_id;
      else
        update public.eca_entries set downvotes_count = downvotes_count + 1 where id = new.entry_id;
      end if;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create or replace function public.handle_mistake_upvote_change() returns trigger
language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    if new.vote_type = 'up' then
      update public.mistake_entries set upvotes_count = upvotes_count + 1 where id = new.entry_id;
    else
      update public.mistake_entries set downvotes_count = downvotes_count + 1 where id = new.entry_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.vote_type = 'up' then
      update public.mistake_entries set upvotes_count = greatest(0, upvotes_count - 1) where id = old.entry_id;
    else
      update public.mistake_entries set downvotes_count = greatest(0, downvotes_count - 1) where id = old.entry_id;
    end if;
    return old;
  elsif (tg_op = 'UPDATE') then
    if new.vote_type is distinct from old.vote_type then
      if old.vote_type = 'up' then
        update public.mistake_entries set upvotes_count = greatest(0, upvotes_count - 1) where id = old.entry_id;
      else
        update public.mistake_entries set downvotes_count = greatest(0, downvotes_count - 1) where id = old.entry_id;
      end if;
      if new.vote_type = 'up' then
        update public.mistake_entries set upvotes_count = upvotes_count + 1 where id = new.entry_id;
      else
        update public.mistake_entries set downvotes_count = downvotes_count + 1 where id = new.entry_id;
      end if;
    end if;
    return new;
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

alter table public.gks_university_stats enable row level security;
drop policy if exists "gks_university_stats_select_all" on public.gks_university_stats;
create policy "gks_university_stats_select_all" on public.gks_university_stats for select using (true);

alter table public.gks_country_stats enable row level security;
drop policy if exists "gks_country_stats_select_all" on public.gks_country_stats;
create policy "gks_country_stats_select_all" on public.gks_country_stats for select using (true);

alter table public.gks_university_country_stats enable row level security;
drop policy if exists "gks_university_country_stats_select_all" on public.gks_university_country_stats;
create policy "gks_university_country_stats_select_all" on public.gks_university_country_stats for select using (true);

-- No policies at all -- service-role only, by design, until spot-checked and promoted.
alter table public.university_insights_staging enable row level security;

-- Private practice data, unlike university_choices -- no public "select_all"
-- policy. Only the owner can ever see their own mock-interview sessions.
alter table public.interview_sessions enable row level security;
drop policy if exists "interview_sessions_owner_all" on public.interview_sessions;
create policy "interview_sessions_owner_all" on public.interview_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.interview_session_questions enable row level security;
drop policy if exists "interview_session_questions_owner_all" on public.interview_session_questions;
create policy "interview_session_questions_owner_all" on public.interview_session_questions for all
  using (exists (
    select 1 from public.interview_sessions s
    where s.id = interview_session_questions.session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.interview_sessions s
    where s.id = interview_session_questions.session_id and s.user_id = auth.uid()
  ));

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
-- Replaced by the two policies below: this single blanket policy had no
-- WITH CHECK, so its USING clause (either party) was the only gate on an
-- UPDATE -- letting the *sender* PATCH their own outgoing request straight
-- to status='accepted' via a direct Supabase REST call, bypassing the
-- recipient-only check that only exists in app/api/connections/respond's
-- application code. That immediately unlocks contact_methods for both
-- parties (see contact_methods_select) without the recipient's consent.
drop policy if exists "connection_requests_update_parties" on public.connection_requests;

-- Only the recipient may accept/decline a pending request, and only into
-- those two statuses.
drop policy if exists "connection_requests_accept_or_decline" on public.connection_requests;
create policy "connection_requests_accept_or_decline" on public.connection_requests for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id and status in ('accepted', 'declined'));

-- Either party may revoke (only app/api/connections/revoke's own status
-- check restricts this to previously-accepted requests -- RLS just fixes
-- the destination status, matching the accept/decline split above).
drop policy if exists "connection_requests_revoke" on public.connection_requests;
create policy "connection_requests_revoke" on public.connection_requests for update
  using (auth.uid() in (from_user_id, to_user_id))
  with check (status = 'revoked');

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
drop policy if exists "question_upvotes_update_own" on public.question_upvotes;
create policy "question_upvotes_update_own" on public.question_upvotes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

alter table public.timeline_templates enable row level security;
drop policy if exists "timeline_templates_select_all" on public.timeline_templates;
create policy "timeline_templates_select_all" on public.timeline_templates for select using (true);

alter table public.user_timeline_progress enable row level security;
drop policy if exists "user_timeline_progress_all_own" on public.user_timeline_progress;
create policy "user_timeline_progress_all_own" on public.user_timeline_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.eca_entries enable row level security;
drop policy if exists "eca_entries_select" on public.eca_entries;
create policy "eca_entries_select" on public.eca_entries for select
  using (status = 'approved' or submitted_by = auth.uid() or public.is_admin());
drop policy if exists "eca_entries_insert_own" on public.eca_entries;
create policy "eca_entries_insert_own" on public.eca_entries for insert
  with check (submitted_by = auth.uid());
drop policy if exists "eca_entries_update_admin" on public.eca_entries;
create policy "eca_entries_update_admin" on public.eca_entries for update
  using (public.is_admin());

alter table public.eca_upvotes enable row level security;
drop policy if exists "eca_upvotes_select_all" on public.eca_upvotes;
create policy "eca_upvotes_select_all" on public.eca_upvotes for select using (true);
drop policy if exists "eca_upvotes_insert_own" on public.eca_upvotes;
create policy "eca_upvotes_insert_own" on public.eca_upvotes for insert with check (auth.uid() = user_id);
drop policy if exists "eca_upvotes_delete_own" on public.eca_upvotes;
create policy "eca_upvotes_delete_own" on public.eca_upvotes for delete using (auth.uid() = user_id);
drop policy if exists "eca_upvotes_update_own" on public.eca_upvotes;
create policy "eca_upvotes_update_own" on public.eca_upvotes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.mistake_entries enable row level security;
drop policy if exists "mistake_entries_select" on public.mistake_entries;
create policy "mistake_entries_select" on public.mistake_entries for select
  using (status = 'approved' or submitted_by = auth.uid() or public.is_admin());
drop policy if exists "mistake_entries_insert_own" on public.mistake_entries;
create policy "mistake_entries_insert_own" on public.mistake_entries for insert
  with check (submitted_by = auth.uid());
drop policy if exists "mistake_entries_update_admin" on public.mistake_entries;
create policy "mistake_entries_update_admin" on public.mistake_entries for update
  using (public.is_admin());

alter table public.mistake_upvotes enable row level security;
drop policy if exists "mistake_upvotes_select_all" on public.mistake_upvotes;
create policy "mistake_upvotes_select_all" on public.mistake_upvotes for select using (true);
drop policy if exists "mistake_upvotes_insert_own" on public.mistake_upvotes;
create policy "mistake_upvotes_insert_own" on public.mistake_upvotes for insert with check (auth.uid() = user_id);
drop policy if exists "mistake_upvotes_delete_own" on public.mistake_upvotes;
create policy "mistake_upvotes_delete_own" on public.mistake_upvotes for delete using (auth.uid() = user_id);
drop policy if exists "mistake_upvotes_update_own" on public.mistake_upvotes;
create policy "mistake_upvotes_update_own" on public.mistake_upvotes for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.answer_feedback enable row level security;
drop policy if exists "answer_feedback_all_own" on public.answer_feedback;
create policy "answer_feedback_all_own" on public.answer_feedback for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Deliberately no policies -- deny-all for anon/authenticated via the REST
-- API. Only the service-role client or admin_bootstrap_promote() (itself
-- SECURITY DEFINER) can read/write this table.
alter table public.admin_actions_log enable row level security;

-- Same treatment -- deny-all via REST. Setting the secret is a deliberate
-- service-role/SQL-editor-only action.
alter table public.admin_bootstrap_config enable row level security;

-- =========================================================================
-- PASS 4: triggers + seed data
-- =========================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_profiles_update_guard_admin on public.profiles;
create trigger on_profiles_update_guard_admin before update on public.profiles
  for each row execute function public.guard_profiles_is_admin();

drop trigger if exists on_profiles_update_guard_locked_fields on public.profiles;
create trigger on_profiles_update_guard_locked_fields before update on public.profiles
  for each row execute function public.guard_profiles_locked_fields();

drop trigger if exists on_question_upvote_insert on public.question_upvotes;
create trigger on_question_upvote_insert after insert on public.question_upvotes
  for each row execute function public.handle_question_upvote_change();

drop trigger if exists on_question_upvote_delete on public.question_upvotes;
create trigger on_question_upvote_delete after delete on public.question_upvotes
  for each row execute function public.handle_question_upvote_change();

drop trigger if exists on_question_upvote_update on public.question_upvotes;
create trigger on_question_upvote_update after update on public.question_upvotes
  for each row execute function public.handle_question_upvote_change();

drop trigger if exists on_eca_upvote_insert on public.eca_upvotes;
create trigger on_eca_upvote_insert after insert on public.eca_upvotes
  for each row execute function public.handle_eca_upvote_change();

drop trigger if exists on_eca_upvote_delete on public.eca_upvotes;
create trigger on_eca_upvote_delete after delete on public.eca_upvotes
  for each row execute function public.handle_eca_upvote_change();

drop trigger if exists on_eca_upvote_update on public.eca_upvotes;
create trigger on_eca_upvote_update after update on public.eca_upvotes
  for each row execute function public.handle_eca_upvote_change();

drop trigger if exists on_mistake_upvote_insert on public.mistake_upvotes;
create trigger on_mistake_upvote_insert after insert on public.mistake_upvotes
  for each row execute function public.handle_mistake_upvote_change();

drop trigger if exists on_mistake_upvote_delete on public.mistake_upvotes;
create trigger on_mistake_upvote_delete after delete on public.mistake_upvotes
  for each row execute function public.handle_mistake_upvote_change();

drop trigger if exists on_mistake_upvote_update on public.mistake_upvotes;
create trigger on_mistake_upvote_update after update on public.mistake_upvotes
  for each row execute function public.handle_mistake_upvote_change();

-- Curated starter questions, published directly as 'approved'. Cleaned,
-- deduplicated, and categorized from applicant-submitted questions.
insert into public.interview_questions (text, category, submitted_by, status)
select v.text, v.category, null, 'approved'
from (values
  ('Why Korea?', 'motivation'),
  ('Why South Korea specifically, rather than another country?', 'motivation'),
  ('How did you come to know about GKS, and why did you apply?', 'motivation'),
  ('How did you hear about GKS?', 'motivation'),
  ('What motivated you to apply for GKS? Why pursue your studies in Korea rather than elsewhere?', 'motivation'),
  ('Why this scholarship?', 'motivation'),
  ('Why do you think this scholarship is a good opportunity for you?', 'motivation'),
  ('What does the GKS scholarship provide?', 'motivation'),
  ('Why should we consider you for this program? Mention your strengths, weaknesses, and competencies.', 'motivation'),
  ('Did you apply anywhere else?', 'motivation'),
  ('Introduce yourself.', 'academic_background'),
  ('Please briefly introduce yourself.', 'academic_background'),
  ('Tell us about your school.', 'academic_background'),
  ('What''s the name of your school?', 'academic_background'),
  ('Did you receive your bachelor''s degree there?', 'academic_background'),
  ('Could you define your major?', 'academic_background'),
  ('What exactly do you want to study?', 'academic_background'),
  ('Why did you choose this major?', 'academic_background'),
  ('Why did you choose this specific degree, and how does it align with your future goals?', 'academic_background'),
  ('How will your major help your future, and the relationship between your country and Korea?', 'academic_background'),
  ('Tell us about your research paper.', 'academic_background'),
  ('Is there a professor at your target university whose work you''re interested in? Do you know their work?', 'academic_background'),
  ('Have you contacted a professor there? If so, what did they say?', 'academic_background'),
  ('What are your career goals?', 'academic_background'),
  ('What do you see yourself doing in 5 years, after graduation?', 'academic_background'),
  ('Where do you see yourself in 5 years?', 'academic_background'),
  ('What are your future plans?', 'academic_background'),
  ('What will you do after graduation, and why this particular field?', 'academic_background'),
  ('What are your plans during your studies?', 'academic_background'),
  ('Why this major in Korea specifically?', 'korea_specific'),
  ('Do you like Korean food?', 'korea_specific'),
  ('What do you know about Korea?', 'korea_specific'),
  ('What Korean culture do you like, and why?', 'korea_specific'),
  ('Have you experienced Korean culture before?', 'korea_specific'),
  ('Is there anything you''d like to say in Korean?', 'korea_specific'),
  ('What is it like learning the Korean language as a foreigner?', 'korea_specific'),
  ('How will you learn Korean?', 'korea_specific'),
  ('How will you manage to adapt to Korean society?', 'korea_specific'),
  ('Do you think you will adapt well to Korea?', 'korea_specific'),
  ('How do you deal with culture shock?', 'korea_specific'),
  ('What aspect of Korean society do you think is most challenging, and why?', 'korea_specific'),
  ('Why do you admire Korean work culture?', 'korea_specific'),
  ('How would you promote Korea in your home country?', 'korea_specific'),
  ('What are the similarities between your home country and Korea?', 'korea_specific'),
  ('How will you manage stress and homesickness?', 'korea_specific'),
  ('How do you feel about having to stay in a dorm for a year?', 'korea_specific'),
  ('Why this university?', 'major_specific'),
  ('What do you know about this university?', 'major_specific'),
  ('How did you find out about this university?', 'major_specific'),
  ('How do you plan to contribute to the university community?', 'major_specific'),
  ('How will you contribute to your university''s society, and to the relationship between your country and Korea?', 'major_specific'),
  ('Have you ever lived abroad? What were the challenges, and how did you overcome them?', 'behavioral'),
  ('Have you had experience living alone?', 'behavioral'),
  ('Have you lived with a roommate before?', 'behavioral'),
  ('Have you traveled to or lived in other foreign countries?', 'behavioral'),
  ('How do you act when you are stressed?', 'behavioral'),
  ('How do you handle stress?', 'behavioral'),
  ('If you face stress during your degree, how will you deal with it without affecting your studies?', 'behavioral'),
  ('Are you physically and mentally prepared to study abroad? What do you do to maintain your health?', 'behavioral'),
  ('How will you stay physically active?', 'behavioral'),
  ('Describe a challenge you''ve faced and how you overcame it.', 'behavioral'),
  ('What was the most important thing you''ve learned from a past experience?', 'behavioral'),
  ('What is one achievement you''re most proud of? Why?', 'behavioral'),
  ('Have you ever been unhappy with the quality of your own work? How did you react?', 'behavioral'),
  ('How would your friends describe you?', 'behavioral'),
  ('Who is someone who inspires you?', 'behavioral'),
  ('Tell us something you learned recently that fascinated you.', 'behavioral'),
  ('What is your favorite movie?', 'behavioral'),
  ('What''s something else you''d like us to know about you?', 'behavioral'),
  ('Describe your family. What do your parents do?', 'behavioral'),
  ('If your supervisor won''t pass you or won''t grant your degree, what will you do?', 'curveball'),
  ('If you have a disagreement with your supervisor or someone in a position of authority, how will you handle it?', 'curveball'),
  ('Describe a situation where you had a conflict, or had to follow a rule you didn''t agree with. How did you handle it?', 'curveball'),
  ('If you were leading a team with a multicultural background, what would be the challenges?', 'curveball'),
  ('Do you think cultural exchange is more important than academic excellence?', 'curveball'),
  ('How will you ensure you remain disciplined and accountable during your studies?', 'curveball'),
  ('Suppose your professor gives you an assignment with very short notice. How would you respond?', 'curveball'),
  ('How would you react if your professor or advisor made an inappropriate comment?', 'curveball'),
  ('What do you think will be the biggest challenge of living in Korea, and how do you plan to overcome it?', 'curveball'),
  ('Do you have any questions for us?', 'curveball')
) as v(text, category)
where not exists (
  select 1 from public.interview_questions iq where iq.text = v.text
);

-- PRD §12.1 MVP: one generic default timeline (route/country null = applies
-- to everyone), ordered roughly by how early each item typically needs to
-- start. Route/country-specific overrides come later without touching app code.
insert into public.timeline_templates (route, country, item_label, item_description, typical_deadline_offset_days, sort_order)
select null, null, v.item_label, v.item_description, v.offset_days, v.sort_order
from (values
  ('Passport', 'Valid passport, with enough validity left to cover the full program length.', 180, 1),
  ('Recommendation letters', 'Usually 1-2 letters from professors or academic advisors -- ask early, they take time to write.', 150, 2),
  ('Study plan', 'A clear, specific plan for what you''ll study and why in Korea -- avoid generic language.', 120, 3),
  ('Personal statement / self-introduction', 'Your personal story and motivation -- keep it honest and specific, not a template.', 120, 4),
  ('Medical check', 'A general health exam covering the items GKS requires -- book with enough lead time for results.', 90, 5),
  ('Apostille / notarization', 'Apostille or consular authentication for degree certificates and transcripts -- rules vary by country.', 75, 6),
  ('Transcript', 'Official academic transcript(s), translated if not already in English or Korean.', 75, 7),
  ('Degree certificate', 'Proof of degree completion (or expected completion) -- translated and authenticated as required.', 75, 8)
) as v(item_label, item_description, offset_days, sort_order)
where not exists (
  select 1 from public.timeline_templates t where t.item_label = v.item_label and t.route is null and t.country is null
);

-- PRD §4.5 starter examples, published directly as 'approved'.
insert into public.eca_entries (title, description, track, submitted_by, status)
select v.title, v.description, v.track, null, 'approved'
from (values
  ('Korean language certificate (TOPIK)', 'A TOPIK score signals genuine commitment and helps with the language-year waiver in some programs.', 'both'),
  ('Volunteering', 'Any sustained volunteer work -- community service, tutoring, NGO work -- shows follow-through beyond academics.', 'both'),
  ('Research publication or project', 'A paper, poster, or research project, even a small one -- most relevant for GKS-G applicants.', 'gks_g'),
  ('Leadership roles', 'Club president, team captain, project lead -- anything showing you''ve taken initiative and responsibility.', 'both'),
  ('Korea-related clubs or activities', 'K-culture clubs, Korean language exchange, Korea-focused academic societies -- shows sustained interest, not a last-minute pivot.', 'both')
) as v(title, description, track)
where not exists (
  select 1 from public.eca_entries e where e.title = v.title
);

-- =========================================================================
-- Study in Korea notice monitoring -- PHASE 1 ONLY
--
-- Scope guard: this phase proves ONE discover -> verify -> store -> display
-- -> dedupe loop against exactly ONE source. Deliberately NOT built yet
-- (later phases): scholarships table, deadline-based expiry, additional
-- sources/universities, headless-browser or Crawl4AI retrieval, RAG, admin UI.
--
-- Core principle enforced throughout: KMate only indexes content from
-- sources explicitly registered as official and verified here, and never
-- fabricates a missing field -- anything absent from the source stays NULL
-- and renders as "Not specified in the official source".
-- =========================================================================

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Phase 1 is single-type by design. Deliberately NOT pre-seeding the
  -- later values ('university', 'university_admissions',
  -- 'university_scholarship') -- forward-compatible (widen the check when
  -- that phase lands) without shipping unused paths now.
  source_type text not null check (source_type in ('study_in_korea')),
  base_url text not null,
  notice_url text not null,
  -- The domain allow-listed as officially verified for this source. The
  -- discovery job refuses to store any notice whose URL falls outside it.
  official_domain text not null,
  -- Phase 1 retrieval is plain HTTP + HTML parsing only (no headless
  -- browser). Recorded per-source so a later phase can add methods without
  -- guessing what an existing row used.
  scraping_method text not null check (scraping_method in ('http_html')),
  active boolean not null default true,
  -- Minutes between checks.
  check_interval integer not null default 180 check (check_interval > 0),
  last_checked_at timestamptz,
  last_successful_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notice_url)
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  title text not null,
  -- Dedupe key for the whole discovery loop: one row per official notice
  -- URL, enforced by the DB rather than only by application logic.
  source_url text not null,
  -- NULL whenever the source doesn't state one -- never inferred.
  published_date date,
  discovered_at timestamptz not null default now(),
  summary text,
  original_text text,
  clean_text text,
  language text,
  -- Phase 1 lifecycle: 'new' on first insert, 'current' while within the
  -- 30-day publication window, 'archived' once older. No deadline-based
  -- expiry yet -- that arrives with scholarships in Phase 2.
  status text not null default 'new' check (status in ('new', 'current', 'archived')),
  is_active boolean not null default true,
  -- SHA-256 of clean_text. Same URL + same hash = unchanged (no write);
  -- same URL + different hash = the official notice was edited in place.
  content_hash text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_url)
);

create index if not exists notices_status_published_idx
  on public.notices (status, published_date desc nulls last);
create index if not exists notices_source_id_idx on public.notices (source_id);

alter table public.sources enable row level security;
alter table public.notices enable row level security;

-- Official public-record content -- readable by anyone. Writes are
-- service-role only (the discovery job); no insert/update policy exists,
-- so RLS-respecting clients can read but never write.
drop policy if exists "notices_select_all" on public.notices;
create policy "notices_select_all" on public.notices for select using (true);

-- sources gets NO policy on purpose: it holds retrieval configuration
-- (method, interval, allow-listed domain), which is operator config rather
-- than user-facing content. Service-role only, same posture as
-- university_insights_staging above.

-- =========================================================================
-- University scholarship monitoring -- PHASE 2
--
-- Adds a second content type on top of Phase 1's notice monitoring, with a
-- real deadline lifecycle. Phase 1's sources/notices tables and cron are
-- untouched by this block apart from widening source_type below.
--
-- Still NOT built (later phases): Crawl4AI, headless browsers, RAG, admin UI.
-- =========================================================================

-- Phase 1 shipped source_type constrained to just 'study_in_korea'; Phase 2
-- widens it rather than pre-seeding unused values back then.
alter table public.sources drop constraint if exists sources_source_type_check;
alter table public.sources add constraint sources_source_type_check
  check (source_type in ('study_in_korea', 'university_admissions', 'university_scholarship'));

create table if not exists public.scholarships (
  id uuid primary key default gen_random_uuid(),
  university_name text not null,
  source_id uuid not null references public.sources(id) on delete cascade,
  scholarship_name text not null,
  -- Every column below is NULL unless the source page states it outright --
  -- no value is ever inferred from context or from what a peer university
  -- typically offers.
  scholarship_type text,
  degree_level text check (degree_level in ('undergraduate', 'graduate')),
  benefit_type text,
  tuition_coverage text,
  gpa_requirement text,
  topik_requirement text,
  application_required boolean,
  automatic_consideration boolean,
  -- 'fixed' = the page gives a real date. 'admission_schedule' = award
  -- follows the admission cycle. 'automatic' = granted without application.
  -- deadline is only ever populated for 'fixed', enforced in the DB below so
  -- an admission-cycle mention can never be silently turned into a date.
  deadline date,
  deadline_type text check (deadline_type in ('fixed', 'admission_schedule', 'automatic')),
  status text not null default 'active' check (status in ('active', 'expiring_soon', 'expired')),
  is_active boolean not null default true,
  source_url text not null,
  content_hash text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, scholarship_name, source_url),
  constraint scholarships_deadline_only_when_fixed
    check (deadline is null or deadline_type = 'fixed')
);

create index if not exists scholarships_status_idx on public.scholarships (status, deadline nulls last);
create index if not exists scholarships_source_id_idx on public.scholarships (source_id);

alter table public.scholarships enable row level security;
drop policy if exists "scholarships_select_all" on public.scholarships;
create policy "scholarships_select_all" on public.scholarships for select using (true);
