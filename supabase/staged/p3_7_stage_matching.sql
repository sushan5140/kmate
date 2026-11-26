-- P3.7 staged deployment candidate. Do not execute on production before
-- migration generation, disposable DB regression, privilege audit and rollout approval.
begin;
create table if not exists public.stage_matching_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  choice_id uuid not null references public.university_choices(id) on delete cascade,
  program text not null check (program in ('gks_u','gks_g')),
  cycle integer not null check (cycle between 2000 and 2099),
  profile_version timestamptz not null,
  stage text not null check (stage in ('preparing','submitted','interview','awaiting_result')),
  consented_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (expires_at > consented_at and expires_at <= consented_at + interval '30 days')
);
alter table public.stage_matching_preferences enable row level security;
revoke all on table public.stage_matching_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.stage_matching_preferences to service_role;
create index if not exists stage_matching_lookup_idx on public.stage_matching_preferences (program, cycle, stage, expires_at);

-- The caller is the server-only service role. Even with a service-role call,
-- the query requires an active opt-in from both parties and current ownership
-- of their chosen university rows. Deleting/replacing a choice revokes consent.
create or replace function public.find_stage_matches(p_user_id uuid)
returns table (username text, university_name text)
language sql stable security invoker set search_path = ''
as $$
  select candidate.username, u.name
  from public.stage_matching_preferences mine
  join public.profiles me on me.id = mine.user_id
  join public.university_choices my_choice on my_choice.id = mine.choice_id and my_choice.user_id = mine.user_id
  join public.stage_matching_preferences theirs
    on theirs.program = mine.program and theirs.cycle = mine.cycle and theirs.stage = mine.stage
    and theirs.user_id <> mine.user_id
  join public.profiles candidate on candidate.id = theirs.user_id
  join public.university_choices their_choice on their_choice.id = theirs.choice_id and their_choice.user_id = theirs.user_id
    and their_choice.university_id = my_choice.university_id
  join public.universities u on u.id = my_choice.university_id
  where mine.user_id = p_user_id
    and mine.expires_at > now() and theirs.expires_at > now()
    and me.deleted_at is null and candidate.deleted_at is null
    and me.username is not null and candidate.username is not null
    and me.track = mine.program and candidate.track = theirs.program
    and me.application_year = mine.cycle and candidate.application_year = theirs.cycle
    and me.onboarding_completed_at = mine.profile_version
    and candidate.onboarding_completed_at = theirs.profile_version
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = mine.user_id and b.blocked_id = theirs.user_id)
         or (b.blocker_id = theirs.user_id and b.blocked_id = mine.user_id)
    )
  order by candidate.username
  limit 30;
$$;
revoke all on function public.find_stage_matches(uuid) from public, anon, authenticated;
grant execute on function public.find_stage_matches(uuid) to service_role;
commit;
