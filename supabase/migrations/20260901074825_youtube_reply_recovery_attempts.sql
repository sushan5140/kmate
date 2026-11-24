-- YouTube recovery drafts are independent child attempts. The original queue
-- row remains immutable history and may be absent for legacy-only records.
create table public.youtube_reply_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.youtube_reply_queue(id) on delete set null,
  youtube_comment_id text not null
    check (btrim(youtube_comment_id) <> ''),
  legacy_reply_id text not null
    check (btrim(legacy_reply_id) <> ''),
  legacy_draft_text text,
  legacy_outcome text not null
    check (legacy_outcome in ('POSTED_RECORDED', 'CONFIRMED_REMOVED')),
  legacy_evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(legacy_evidence) = 'object'),
  recovery_set text not null
    check (btrim(recovery_set) <> ''),
  author_name text not null
    check (btrim(author_name) <> ''),
  recovery_batch smallint not null
    check (recovery_batch > 0),
  recovery_order integer not null
    check (recovery_order > 0),
  category text not null
    check (category in ('ANSWER_ONLY', 'KMATE_LINK')),
  draft_text text not null
    check (btrim(draft_text) <> '' and char_length(draft_text) <= 9500),
  status text not null default 'DRAFTED'
    check (status in (
      'DRAFTED', 'APPROVED', 'POSTING', 'API_ACCEPTED', 'VERIFIED_LIVE',
      'HOLD', 'SKIP', 'REMOVED', 'FAILED'
    )),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  posted_reply_id text,
  api_accepted_at timestamptz,
  verified_at timestamptz,
  removed_detected_at timestamptz,
  last_verified_at timestamptz,
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint youtube_reply_recovery_attempts_set_order_key
    unique (recovery_set, recovery_order),
  constraint youtube_reply_recovery_attempts_legacy_reply_id_key
    unique (legacy_reply_id),
  constraint youtube_reply_recovery_attempts_new_reply_distinct
    check (posted_reply_id is null or posted_reply_id <> legacy_reply_id),
  constraint youtube_reply_recovery_attempts_posted_state_has_id
    check (
      status not in ('API_ACCEPTED', 'VERIFIED_LIVE', 'REMOVED')
      or posted_reply_id is not null
    ),
  constraint youtube_reply_recovery_attempts_approval_requires_removal
    check (
      legacy_outcome = 'CONFIRMED_REMOVED'
      or status in ('DRAFTED', 'HOLD', 'SKIP')
    )
);

-- Only terminal SKIP/REMOVED releases a parent comment for another attempt.
create unique index youtube_reply_recovery_attempts_active_parent_key
  on public.youtube_reply_recovery_attempts (youtube_comment_id)
  where status in (
    'DRAFTED', 'APPROVED', 'POSTING', 'API_ACCEPTED', 'VERIFIED_LIVE',
    'HOLD', 'FAILED'
  );

create unique index youtube_reply_recovery_attempts_posted_reply_id_key
  on public.youtube_reply_recovery_attempts (posted_reply_id)
  where posted_reply_id is not null;

create index youtube_reply_recovery_attempts_queue_idx
  on public.youtube_reply_recovery_attempts (queue_id)
  where queue_id is not null;

create index youtube_reply_recovery_attempts_review_idx
  on public.youtube_reply_recovery_attempts
    (status, recovery_set, recovery_batch, recovery_order);

alter table public.youtube_reply_recovery_attempts enable row level security;

-- Service-role-only, matching the existing YouTube outreach tables.
revoke all on public.youtube_reply_recovery_attempts from public, anon, authenticated;
grant select, insert, update on public.youtube_reply_recovery_attempts to service_role;
