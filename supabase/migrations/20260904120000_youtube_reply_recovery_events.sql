-- Append-only audit trail for recovery send attempts.
--
-- Why a separate table rather than reusing public.youtube_reply_events:
-- that table's queue_id is NOT NULL and references youtube_reply_queue(id).
-- Every recovery attempt in this set has queue_id null -- the recovery rows
-- came from a reconstructed workbook, not from the outreach queue -- so a
-- recovery event cannot satisfy that constraint. The alternatives were to make
-- queue_id nullable (which would let outreach events lose their parent) or to
-- invent placeholder queue rows (which would corrupt what the queue table
-- means). A sibling table keyed to the recovery attempt is the smaller and
-- safer change, and it keeps the two workflows' histories from being confused
-- for one another.
--
-- Append-only by construction: no update or delete policy exists, the table is
-- service-role only, and nothing in the application ever updates or deletes a
-- row here.

create table if not exists public.youtube_reply_recovery_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null
    references public.youtube_reply_recovery_attempts(id) on delete cascade,
  event_type text not null check (event_type in (
    'RECOVERY_SEND_REQUESTED',
    'RECOVERY_FRESH_VERIFICATION_PASSED',
    'RECOVERY_FRESH_VERIFICATION_BLOCKED',
    'RECOVERY_POST_CLAIMED',
    'RECOVERY_API_ACCEPTED',
    'RECOVERY_API_REJECTED',
    'RECOVERY_OUTCOME_UNKNOWN',
    'RECOVERY_STUCK_RESOLVED',
    'RECOVERY_STUCK_UNRESOLVED',
    'RECOVERY_RETRY_AUTHORIZED',
    'RECOVERY_VERIFY_FOUND',
    'RECOVERY_VERIFY_NOT_FOUND',
    'RECOVERY_VERIFY_INCONCLUSIVE'
  )),
  from_status text,
  to_status text,
  actor_user_id uuid references auth.users(id) on delete set null,
  -- The reply id YouTube returned, or the one a resolution identified.
  youtube_reply_id text,
  -- Which attempt this event belongs to (1 for the first send, 2 after a
  -- human-authorized retry). Null for events that are not attempt-scoped.
  attempt_number integer check (attempt_number is null or attempt_number > 0),
  -- Safe operational metadata only: parent comment id, result/reason codes,
  -- candidate counts. Never credentials, tokens or OAuth material.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists youtube_reply_recovery_events_attempt_idx
  on public.youtube_reply_recovery_events (attempt_id, created_at desc);

-- Same posture as every other YouTube table: RLS on with no policy, which
-- means service-role only. No browser session can read or write this.
alter table public.youtube_reply_recovery_events enable row level security;

-- No user-facing policy. Only the server-side service role may access it.
-- Supabase's default privileges hand service_role full DML on new public
-- tables, so a bare `grant select, insert` is ADDITIVE and leaves
-- UPDATE/DELETE/TRUNCATE in place. An audit trail the application role can
-- rewrite is not an audit trail, so revoke them explicitly. Verified against
-- information_schema.role_table_grants after applying.
revoke update, delete, truncate on public.youtube_reply_recovery_events from service_role;
revoke all on public.youtube_reply_recovery_events from public, anon, authenticated;
-- select + insert only. No update, no delete: the trail is append-only, and
-- the grant is where that is actually enforced rather than merely intended.
grant select, insert on public.youtube_reply_recovery_events to service_role;
