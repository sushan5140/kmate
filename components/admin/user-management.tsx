"use client";

import { useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { TRACK_LABELS, type Track } from "@/lib/constants";

interface AdminUserRow {
  id: string;
  username: string | null;
  track: Track | null;
  dual_track_access: boolean;
  is_admin: boolean;
  major: string | null;
  application_year: number | null;
  onboarding_completed_at: string | null;
}

export function UserManagement() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setUsers([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setUsers(res.ok ? (data.users as AdminUserRow[]) : []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  async function updateUser(id: string, body: { track?: Track; dualTrackAccess?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers((rows) => rows.map((r) => (r.id === id ? { ...r, ...data.user } : r)));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-5">
      <Card>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search by username…"
            className="w-full rounded-lg border border-hairline-strong bg-surface py-2 pl-8 pr-3 text-[13.5px] text-ink"
          />
        </div>

        <p className="mt-2 text-[12px] text-muted">
          Changing a user&apos;s track updates which track-scoped content (university eligibility, Scholar Stats,
          Apostille Guide) their account applies to going forward. Granting &quot;both tracks&quot; lets them view
          both GKS-G and GKS-U content on Scholar Stats and the Apostille Guide, without changing their actual track.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          {searching && <p className="text-[13px] text-muted">Searching…</p>}
          {!searching && searched && users.length === 0 && (
            <p className="text-[13px] text-muted">No users found for &quot;{query}&quot;.</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-lg border border-hairline px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium text-ink">@{u.username}</span>
                {u.is_admin && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                    <ShieldCheck className="h-3 w-3" /> Admin
                  </span>
                )}
                {!u.onboarding_completed_at && (
                  <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-muted">
                    Onboarding incomplete
                  </span>
                )}
              </div>
              {(u.major || u.application_year) && (
                <p className="mt-0.5 text-[12px] text-muted">
                  {u.major}
                  {u.major && u.application_year ? " · " : ""}
                  {u.application_year ? `${u.application_year} applicant` : ""}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-muted">Track</span>
                  {(["gks_g", "gks_u"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={busyId === u.id || !u.track}
                      onClick={() => updateUser(u.id, { track: t })}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        u.track === t
                          ? t === "gks_g"
                            ? "border-gks-g bg-gks-g/10 text-gks-g"
                            : "border-gks-u bg-gks-u/10 text-gks-u"
                          : "border-hairline-strong text-muted hover:text-ink"
                      )}
                    >
                      {TRACK_LABELS[t]}
                    </button>
                  ))}
                  {!u.track && <span className="text-[12px] text-muted">(not set yet)</span>}
                </div>

                <label className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={u.dual_track_access}
                    disabled={busyId === u.id}
                    onChange={(e) => updateUser(u.id, { dualTrackAccess: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-hairline-strong"
                  />
                  Both-track access
                </label>

                {busyId === u.id && <span className="text-[12px] text-muted">Saving…</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
