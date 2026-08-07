import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProfileIdentity {
  id: string;
  username: string | null;
  email: string | null;
}

/**
 * Bare username + email for an arbitrary set of user ids -- the shared
 * building block behind SubmitterInfo below, and reused directly by the
 * reports queue (a reporter/reported-user pair, not a "submitted to this
 * queue" relationship, so it has no approve/reject history to attach).
 *
 * profiles has no email column (checked via information_schema, not
 * assumed) -- email only exists in auth.users, reachable through the
 * Supabase Admin Auth API (getUserById), not a plain PostgREST join.
 */
export async function getProfileIdentityMap(
  admin: SupabaseClient,
  userIds: (string | null)[]
): Promise<Map<string, ProfileIdentity>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => id !== null)));
  if (ids.length === 0) return new Map();

  const [{ data: profiles }, emailResults] = await Promise.all([
    admin.from("profiles").select("id, username").in("id", ids),
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id))),
  ]);

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username as string | null]));
  const emailById = new Map(ids.map((id, i) => [id, emailResults[i].data.user?.email ?? null]));

  return new Map(
    ids.map((id) => [id, { id, username: usernameById.get(id) ?? null, email: emailById.get(id) ?? null }])
  );
}

export interface SubmitterInfo extends ProfileIdentity {
  /** Counts within the one queue this lookup was scoped to (see table param below), not a cross-queue total. */
  approvedCount: number;
  rejectedCount: number;
}

/**
 * Builds submitter identity + per-submitter approve/reject history, scoped
 * to one moderation queue's own table -- "how many times has this person
 * submitted to THIS queue," not a global total (see getUserFlagCounts for
 * the cross-queue total shown on /admin/users).
 */
export async function getSubmitterInfoMap(
  admin: SupabaseClient,
  table: "eca_entries" | "mistake_entries" | "interview_questions",
  submitterIds: (string | null)[]
): Promise<Map<string, SubmitterInfo>> {
  const ids = Array.from(new Set(submitterIds.filter((id): id is string => id !== null)));
  if (ids.length === 0) return new Map();

  const [identityMap, { data: historyRows }] = await Promise.all([
    getProfileIdentityMap(admin, ids),
    admin.from(table).select("submitted_by, status").in("submitted_by", ids),
  ]);

  const map = new Map<string, SubmitterInfo>();
  for (const id of ids) {
    const identity = identityMap.get(id);
    if (!identity) continue;
    map.set(id, { ...identity, approvedCount: 0, rejectedCount: 0 });
  }
  for (const row of historyRows ?? []) {
    const entry = row.submitted_by ? map.get(row.submitted_by) : undefined;
    if (!entry) continue;
    if (row.status === "approved") entry.approvedCount++;
    else if (row.status === "rejected") entry.rejectedCount++;
  }

  return map;
}

export interface UserFlagCounts {
  rejectedCount: number;
  warningCount: number;
}

/**
 * Cross-queue total for the /admin/users flag display: rejected submissions
 * summed across all three moderation tables, plus how many times this user
 * has been warned (notifications where type = 'admin_warning'). Distinct
 * from SubmitterInfo above, which is scoped to one queue at a time.
 */
export async function getUserFlagCountsMap(admin: SupabaseClient, userIds: string[]): Promise<Map<string, UserFlagCounts>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Map();

  const [{ data: eca }, { data: mistakes }, { data: questions }, { data: warnings }] = await Promise.all([
    admin.from("eca_entries").select("submitted_by, status").in("submitted_by", ids).eq("status", "rejected"),
    admin.from("mistake_entries").select("submitted_by, status").in("submitted_by", ids).eq("status", "rejected"),
    admin.from("interview_questions").select("submitted_by, status").in("submitted_by", ids).eq("status", "rejected"),
    admin.from("notifications").select("user_id").in("user_id", ids).eq("type", "admin_warning"),
  ]);

  const map = new Map<string, UserFlagCounts>(ids.map((id) => [id, { rejectedCount: 0, warningCount: 0 }]));
  for (const rows of [eca, mistakes, questions]) {
    for (const row of rows ?? []) {
      const entry = row.submitted_by ? map.get(row.submitted_by) : undefined;
      if (entry) entry.rejectedCount++;
    }
  }
  for (const row of warnings ?? []) {
    const entry = map.get(row.user_id);
    if (entry) entry.warningCount++;
  }

  return map;
}
