-- Core YouTube outreach tables and daily-workspace columns.
-- Extracted from schema.sql so a current production database can adopt the feature incrementally.

-- =========================================================================
-- YouTube Outreach -- human-controlled reply workflow
--
-- Replaces a local Python bot that posted in bulk. That bot verified each
-- reply five seconds after posting, printed "VERIFIED LIVE", and was wrong:
-- a later audit that queried the exact returned reply ids found most of them
-- gone. Two rules follow from that, and both are enforced structurally here
-- rather than by convention:
--
--   1. API_ACCEPTED is not success. YouTube returning a reply id only means
--      the call was accepted. Only a later, delayed existence check may
--      promote a row to VERIFIED_LIVE.
--   2. REMOVED is terminal. Nothing may move a removed reply back to
--      APPROVED, so no code path can repost one.
--
-- Three tables: batches (one per import), queue (one per reply, carrying
-- current state plus timestamps for cheap filtering), events (append-only
-- audit trail). All three are RLS-on-with-no-policy -- operator workflow
-- state reachable only through the service-role client behind
-- requireAdmin / isAuthorizedAdmin, the same posture as public.sources and
-- public.notice_review_queue.
-- =========================================================================

create table if not exists public.youtube_reply_batches (
  id uuid primary key default gen_random_uuid(),
  -- Human label, e.g. 'batch02_past_7_days'. Deliberately not unique: the
  -- same sheet may legitimately be re-uploaded after edits.
  label text not null,
  source_filename text,
  -- 'xlsx' for a spreadsheet upload, 'legacy' for the one-time import of the
  -- old bot's posted_replies.json.
  kind text not null default 'xlsx' check (kind in ('xlsx', 'legacy', 'fresh-raw')),

  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),

  total_rows integer not null default 0,
  eligible_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  -- Rows whose comment id was already in the queue from an earlier import.
  already_known_rows integer not null default 0,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youtube_reply_batches_imported_idx
  on public.youtube_reply_batches (imported_at desc);

alter table public.youtube_reply_batches enable row level security;

create table if not exists public.youtube_reply_queue (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.youtube_reply_batches(id) on delete cascade,
  -- 1-based row number in the uploaded sheet, so a reviewer can find the
  -- original. NULL for legacy records, which came from a JSON file.
  spreadsheet_row integer,

  -- ---- copied from the sheet, verbatim -------------------------------
  -- The parent comment this reply answers. This is the value the posting
  -- route sends to YouTube; a browser never supplies it.
  youtube_comment_id text not null,
  parent_comment_id text,
  video_id text,
  video_title text,
  channel_title text,
  source_url text,
  author_name text,
  original_text text,
  -- 'comment' (top-level, postable) or 'reply' (nested, never postable).
  source_type text,
  topic text,
  -- The sheet stores score as a number and confidence as a word ('High'),
  -- not a probability. Both kept in their source shapes rather than coerced.
  score numeric(6, 2),
  confidence text,
  reply_status text,

  general_reply text,
  kmate_reply text,
  use_kmate boolean,
  best_choice text,
  -- The draft as it arrived. Never overwritten by an admin edit.
  final_draft text,
  -- The admin's edit, when there is one. resolveDraft() prefers this.
  edited_draft text,
  -- The sheet's own recommendation: POST / HOLD / SKIP. Posting requires
  -- POST; an admin cannot approve a HOLD or SKIP row into a postable state.
  automation_action text,

  -- ---- workflow ------------------------------------------------------
  status text not null default 'SCRAPED' check (status in (
    'SCRAPED',        -- imported, not eligible for a decision yet
    'DRAFTED',        -- eligible, awaiting an admin decision
    'APPROVED',       -- an admin approved it; the only postable state
    'POSTING',        -- transient, set server-side only, never by a browser
    'API_ACCEPTED',   -- YouTube returned a reply id. NOT success.
    'VERIFIED_LIVE',  -- a delayed existence check found it
    'HOLD',
    'SKIP',
    'REMOVED',        -- terminal: checked and gone. Never reposted.
    'FAILED'          -- the call failed; needs an explicit re-approval
  )),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,

  -- ---- legacy provenance ---------------------------------------------
  -- True for rows representing replies the old Python bot already posted.
  -- The posting route refuses these outright, independently of status, so a
  -- comment attempted once can never be attempted again by accident.
  is_legacy boolean not null default false,
  legacy_source text,

  -- ---- posting + verification ----------------------------------------
  -- The id YouTube returned for the created reply.
  posted_reply_id text,
  api_accepted_at timestamptz,
  verified_at timestamptz,
  last_verified_at timestamptz,
  removed_detected_at timestamptz,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Primary dedupe key, GLOBAL rather than per batch. The old bot keyed its
  -- posted_replies.json on the parent comment id; re-importing an
  -- overlapping sheet must not create a second postable row for a comment
  -- that already has one. Enforced by the DB so this holds even if the
  -- import logic were wrong.
  unique (youtube_comment_id)
);

-- A returned reply id belongs to exactly one queue row. Partial, because
-- NULL is the normal state for everything not yet posted.
create unique index if not exists youtube_reply_queue_posted_reply_id_key
  on public.youtube_reply_queue (posted_reply_id)
  where posted_reply_id is not null;

create index if not exists youtube_reply_queue_status_idx
  on public.youtube_reply_queue (status, created_at desc);
create index if not exists youtube_reply_queue_batch_idx
  on public.youtube_reply_queue (batch_id, spreadsheet_row);
create index if not exists youtube_reply_queue_video_idx
  on public.youtube_reply_queue (video_id);
-- Drives the rolling-window daily post cap.
create index if not exists youtube_reply_queue_api_accepted_idx
  on public.youtube_reply_queue (api_accepted_at desc)
  where api_accepted_at is not null;

alter table public.youtube_reply_queue enable row level security;

-- Append-only audit trail. The timestamp columns above answer "what is the
-- state now" cheaply; this answers "what happened, in order, and who did it".
-- Nothing in the application updates or deletes rows here.
--
-- metadata carries per-event detail only -- never an OAuth token, refresh
-- token, access token, client secret, or any other credential.
create table if not exists public.youtube_reply_events (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.youtube_reply_queue(id) on delete cascade,
  event_type text not null check (event_type in (
    'IMPORTED',
    'LEGACY_IMPORTED',
    'DRAFT_EDITED',
    'APPROVED',
    'HELD',
    'SKIPPED',
    'POST_CLAIMED',
    'API_ACCEPTED',
    'POST_FAILED',
    'VERIFY_FOUND',
    'VERIFY_NOT_FOUND',
    'REMOVED'
  )),
  from_status text,
  to_status text,
  actor_user_id uuid references auth.users(id) on delete set null,
  youtube_reply_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists youtube_reply_events_queue_idx
  on public.youtube_reply_events (queue_id, created_at desc);
create index if not exists youtube_reply_events_type_idx
  on public.youtube_reply_events (event_type, created_at desc);

alter table public.youtube_reply_events enable row level security;

-- No policy on any of the three, deliberately. Same service-role-only
-- posture as public.notice_review_queue: an RLS-respecting client -- which
-- is every browser session -- can neither read nor write them.

-- =========================================================================
-- YouTube Outreach -- daily workspace, triage and analytics
--
-- Additive only. Every column here is a persistent FACT about one reply, so
-- daily figures stay derivable from timestamps: there are no per-day copies
-- of queue rows, no rollover job, and no "carried forward" flag to rewrite
-- each night. A day is a range of UTC instants, converted in the admin's
-- timezone at read time (see lib/youtube/day-window.ts).
--
-- None of these columns can make a row postable. The posting route reads
-- status, is_legacy, posted_reply_id, source_type, automation_action and
-- manual_follow_up -- priority, tags and categories are descriptive only.
-- =========================================================================

-- When the scout found the comment, and when the comment itself was written.
-- discovered_at drives the daily workspace; comment_posted_at drives the age
-- column and newest/oldest sorting. Both default to NULL rather than now(),
-- so a sheet that omits them says "unknown" instead of "just now".
alter table public.youtube_reply_queue add column if not exists discovered_at timestamptz;
alter table public.youtube_reply_queue add column if not exists comment_posted_at timestamptz;

-- Backfill: existing rows were discovered when they were imported. Only ever
-- fills NULLs, so re-running never overwrites a real value.
update public.youtube_reply_queue set discovered_at = created_at where discovered_at is null;

alter table public.youtube_reply_queue
  add column if not exists priority text not null default 'MEDIUM'
  check (priority in ('HIGH', 'MEDIUM', 'LOW'));

-- What the ORIGINAL question is about. Distinct from whether the reply
-- mentions KMate, which is promotion_category below.
alter table public.youtube_reply_queue
  add column if not exists opportunity_type text
  check (opportunity_type in ('GKS', 'GENERAL'));

-- What the reply DOES: answers, names KMate, or carries a link. Derived from
-- the draft text and recomputed whenever the draft is edited.
alter table public.youtube_reply_queue
  add column if not exists promotion_category text not null default 'ANSWER_ONLY'
  check (promotion_category in ('ANSWER_ONLY', 'KMATE_MENTION', 'KMATE_LINK'));

-- "I will answer this one myself." Excluded from every posting path.
alter table public.youtube_reply_queue
  add column if not exists manual_follow_up boolean not null default false;

-- Which KMate features the question touches. Informational; never a trigger.
alter table public.youtube_reply_queue
  add column if not exists feature_tags text[] not null default '{}'::text[];

-- The channel the comment came from. channel_title already exists and is what
-- the sheet provides; the id is kept for when a future scout emits it.
alter table public.youtube_reply_queue add column if not exists source_channel_id text;

-- Indexes for the daily views. Each daily figure is a range scan over one of
-- these timestamps, so they are the difference between a dashboard that costs
-- nothing and one that reads the table five times per page.
create index if not exists youtube_reply_queue_discovered_idx
  on public.youtube_reply_queue (discovered_at desc);
create index if not exists youtube_reply_queue_decided_idx
  on public.youtube_reply_queue (decided_at desc)
  where decided_at is not null;
create index if not exists youtube_reply_queue_verified_idx
  on public.youtube_reply_queue (verified_at desc)
  where verified_at is not null;
create index if not exists youtube_reply_queue_removed_idx
  on public.youtube_reply_queue (removed_detected_at desc)
  where removed_detected_at is not null;
create index if not exists youtube_reply_queue_priority_idx
  on public.youtube_reply_queue (priority, discovered_at desc);
create index if not exists youtube_reply_queue_channel_idx
  on public.youtube_reply_queue (channel_title);
-- Drives the batch picker: postable rows, best first.
create index if not exists youtube_reply_queue_postable_idx
  on public.youtube_reply_queue (status, manual_follow_up, priority, discovered_at);

-- One optional note per day. Purely a message from the admin to themselves --
-- nothing reads it to decide anything, and no posting rule consults it.
create table if not exists public.youtube_daily_notes (
  day date primary key,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_daily_notes enable row level security;

-- No policy, deliberately: same service-role-only posture as the other three
-- youtube_reply_* tables and public.notice_review_queue.

