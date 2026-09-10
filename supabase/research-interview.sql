-- Research Interview / Professor Mode persistence.
-- Apply this together with the feature when it is promoted beyond preview.
-- Original PDFs, PPTX files, webcam frames, and Gemini API keys are deliberately NOT stored.

create table if not exists public.research_interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  paper_title text not null,
  paper_file_name text not null,
  presentation_file_name text not null,
  difficulty text not null check (difficulty in ('supervisor', 'professor', 'thesis-defense', 'reviewer')),
  focus text not null check (focus in ('balanced', 'novelty', 'methods', 'results', 'limitations')),
  planned_question_count int not null check (planned_question_count between 1 and 20),
  status text not null default 'completed' check (status in ('completed', 'abandoned')),
  research_report jsonb not null default '{}'::jsonb,
  delivery_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.research_interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_interview_sessions(id) on delete cascade,
  turn_index int not null check (turn_index >= 1),
  phase text not null check (phase in ('main', 'weakness-drill')),
  question_text text not null,
  question_type text not null default '',
  transcript text not null default '',
  slide_number int check (slide_number is null or slide_number >= 1),
  grounding_status text not null check (grounding_status in ('supported', 'partially_supported', 'weak', 'unsupported')),
  coverage_tags text[] not null default '{}',
  evaluation jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists research_interview_sessions_user_created_idx
  on public.research_interview_sessions (user_id, created_at desc);
create index if not exists research_interview_turns_session_idx
  on public.research_interview_turns (session_id, turn_index);

alter table public.research_interview_sessions enable row level security;
alter table public.research_interview_turns enable row level security;

drop policy if exists "Users can read own research interview sessions" on public.research_interview_sessions;
create policy "Users can read own research interview sessions"
  on public.research_interview_sessions for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own research interview turns" on public.research_interview_turns;
create policy "Users can read own research interview turns"
  on public.research_interview_turns for select
  using (
    exists (
      select 1
      from public.research_interview_sessions sessions
      where sessions.id = research_interview_turns.session_id
        and sessions.user_id = (select auth.uid())
    )
  );
