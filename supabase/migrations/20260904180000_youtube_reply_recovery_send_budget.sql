-- One row per recovery send permitted per calendar day.
--
-- Why a table rather than a COUNT(*) before the claim: a count is a read, and
-- two concurrent requests can both read "0 used" and both proceed. The primary
-- key here makes the cap atomic -- the second INSERT for the same (day, slot)
-- fails with 23505 no matter how the requests interleave, because Postgres
-- resolves it under the index rather than under application logic.
--
-- `slot` generalises the cap beyond one per day: a limit of N tries slots
-- 0..N-1 and stops at the first that inserts. For the initial rollout the
-- limit is 1, so only slot 0 is ever used.
--
-- A row here means the day's budget was CONSUMED, not that a reply exists.
-- That asymmetry is deliberate: if a send is claimed and its outcome is then
-- unknown, the budget stays spent. Erring toward "we already sent today" is
-- the safe direction for a feature whose failure mode is duplicate replies.

create table if not exists public.youtube_reply_recovery_send_budget (
  -- The calendar day in the configured YouTube timezone, computed by the
  -- application (Asia/Kolkata by default) rather than from now() in UTC.
  send_day date not null,
  slot smallint not null check (slot >= 0),
  attempt_id uuid not null
    references public.youtube_reply_recovery_attempts(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (send_day, slot)
);

create index if not exists youtube_reply_recovery_send_budget_attempt_idx
  on public.youtube_reply_recovery_send_budget (attempt_id);

alter table public.youtube_reply_recovery_send_budget enable row level security;

-- Service-role only, like every other YouTube table. DELETE is granted here --
-- unlike the event trail -- because a claim that loses its race must hand the
-- budget back; nothing was sent in that case. It is not an audit record.
revoke all on public.youtube_reply_recovery_send_budget from public, anon, authenticated;
revoke update, truncate on public.youtube_reply_recovery_send_budget from service_role;
grant select, insert, delete on public.youtube_reply_recovery_send_budget to service_role;
