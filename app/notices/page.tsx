import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { GksNoticeCard } from "@/components/notices/gks-notice-card";
import {
  getApprovedGksNotices,
  filterPublishedNotices,
  sortNewestFirst,
  type PublishedGksNotice,
} from "@/lib/notices/published";
import type { QueueNoticeType } from "@/lib/notices/review-schema";

export const metadata: Metadata = {
  title: "Official Notices — KMate",
};

// Always read live -- the discovery cron and the review queue both change on
// their own schedule, and a cached page would show a stale notice list.
export const dynamic = "force-dynamic";

/**
 * The notice centre: two views over the same pipeline.
 *
 *   GKS Notices          -- approved, programme-classified notices only
 *   All Official Notices -- the full Study in Korea board, unchanged
 *
 * The existing board is preserved exactly as it was, including its wording
 * and ordering; it simply lives under a tab now. `/notices` with no query
 * string still renders that board, so every existing link and bookmark
 * behaves as before. The GKS view is opt-in via `?view=gks`, which is what
 * Home links to with the saved application's programme and track pre-applied.
 *
 * Defaulting to the broad board rather than the GKS view is a deliberate
 * judgement: until notices are approved the GKS feed is legitimately empty,
 * and landing every visitor on an empty page to advertise a new tab would be
 * worse than showing them the notices that actually exist.
 */

const NOT_SPECIFIED = "Not specified in the official source";

const PROGRAMS = ["all", "GKS-U", "GKS-G"] as const;
const TRACKS = ["all", "embassy", "university"] as const;
const TYPES = ["all", "guideline", "result", "deadline", "schedule_change", "other"] as const;

const TYPE_LABELS: Record<(typeof TYPES)[number], string> = {
  all: "All types",
  guideline: "Guideline",
  result: "Result",
  deadline: "Deadline",
  schedule_change: "Schedule change",
  other: "Other",
};
const PROGRAM_LABELS: Record<(typeof PROGRAMS)[number], string> = {
  all: "All programs",
  "GKS-U": "GKS-U",
  "GKS-G": "GKS-G",
};
const TRACK_LABELS: Record<(typeof TRACKS)[number], string> = {
  all: "All tracks",
  embassy: "Embassy",
  university: "University",
};

interface SearchParams {
  view?: string;
  program?: string;
  track?: string;
  type?: string;
}

interface NoticeRow {
  id: string;
  title: string;
  source_url: string;
  published_date: string | null;
  summary: string | null;
  status: string;
  source: { name: string; official_domain: string } | null;
}

function formatDate(value: string | null): string {
  if (!value) return NOT_SPECIFIED;
  // published_date is a plain DATE (no timezone). Parse the parts directly
  // rather than via Date(), which would shift it by the runtime's offset.
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return NOT_SPECIFIED;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Builds a /notices URL preserving the other filters. "all" is dropped so URLs stay short. */
function noticesHref(current: { view: string; program: string; track: string; type: string }, patch: Partial<typeof current>) {
  const next = { ...current, ...patch };
  const p = new URLSearchParams();
  if (next.view === "gks") p.set("view", "gks");
  if (next.view === "gks") {
    if (next.program !== "all") p.set("program", next.program);
    if (next.track !== "all") p.set("track", next.track);
    if (next.type !== "all") p.set("type", next.type);
  }
  const qs = p.toString();
  return qs ? `/notices?${qs}` : "/notices";
}

function FilterRow({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: readonly string[];
  active: string;
  hrefFor: (value: string) => string;
  }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MicroLabel className="w-full sm:w-auto sm:min-w-[52px]">{label}</MicroLabel>
      {options.map((o) => (
        <Link
          key={o}
          href={hrefFor(o)}
          className={`rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
            o === active ? "border-primary bg-primary/10 text-primary" : "border-hairline-strong bg-white text-muted hover:bg-canvas"
          }`}
        >
          {label === "Program"
            ? PROGRAM_LABELS[o as (typeof PROGRAMS)[number]]
            : label === "Track"
              ? TRACK_LABELS[o as (typeof TRACKS)[number]]
              : TYPE_LABELS[o as (typeof TYPES)[number]]}
        </Link>
      ))}
    </div>
  );
}

export default async function NoticesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireOnboarded("/notices");
  const params = await searchParams;

  // Every selection is validated against the known option set, so a
  // hand-edited URL cannot ask for a programme or track that does not exist.
  const view = params.view === "gks" ? "gks" : "all";
  const program = (PROGRAMS as readonly string[]).includes(params.program ?? "") ? params.program! : "all";
  const track = (TRACKS as readonly string[]).includes(params.track ?? "") ? params.track! : "all";
  const type = (TYPES as readonly string[]).includes(params.type ?? "") ? params.type! : "all";
  const current = { view, program, track, type };

  const [approved, boardResult] = await Promise.all([
    getApprovedGksNotices(),
    getSupabaseAdmin()
      .from("notices")
      .select("id, title, source_url, published_date, summary, status, source:sources ( name, official_domain )")
      .in("status", ["new", "current"])
      .eq("is_active", true)
      .order("published_date", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  const board = (boardResult.data ?? []) as unknown as NoticeRow[];
  const sourceName = board[0]?.source?.name ?? null;

  const filtered: PublishedGksNotice[] = sortNewestFirst(
    filterPublishedNotices(approved, {
      program: program === "all" ? "all" : (program as "GKS-U" | "GKS-G"),
      track: track === "all" ? "all" : (track as "embassy" | "university"),
      noticeType: type === "all" ? "all" : (type as QueueNoticeType),
    })
  );

  const hasFilters = program !== "all" || track !== "all" || type !== "all";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Official Notices</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Announcements republished verbatim from{" "}
        {sourceName ?? "the official Study in Korea announcement board"}. KMate only indexes
        registered official sources and never fills in details the source doesn&apos;t state — always
        confirm against the original notice before acting on it.
      </p>

      {/* ---------------- view tabs ---------------- */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        <Link
          href={noticesHref(current, { view: "gks" })}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
            view === "gks" ? "border-primary bg-primary/10 text-primary" : "border-hairline-strong bg-white text-muted"
          }`}
        >
          GKS Notices{approved.length > 0 ? ` (${approved.length})` : ""}
        </Link>
        <Link
          href={noticesHref(current, { view: "all" })}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
            view === "all" ? "border-primary bg-primary/10 text-primary" : "border-hairline-strong bg-white text-muted"
          }`}
        >
          All Official Notices
        </Link>
      </div>

      {view === "gks" ? (
        <>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            GKS notices a KMate reviewer has confirmed. Reviewed means the program and type below were
            checked against the official notice — it does not turn any date inside a notice into a
            verified KMate deadline.
          </p>

          <div className="mt-4 flex flex-col gap-2.5">
            <FilterRow label="Program" options={PROGRAMS} active={program} hrefFor={(v) => noticesHref(current, { program: v })} />
            <FilterRow label="Track" options={TRACKS} active={track} hrefFor={(v) => noticesHref(current, { track: v })} />
            <FilterRow label="Type" options={TYPES} active={type} hrefFor={(v) => noticesHref(current, { type: v })} />
          </div>

          {filtered.length === 0 ? (
            <Card className="mt-5">
              <p className="text-[13.5px] text-muted">
                {approved.length === 0
                  ? "No reviewed GKS notices are available yet."
                  : "No reviewed notices match these filters."}
              </p>
              {approved.length === 0 && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Notices appear here once a reviewer confirms which GKS program they belong to. Until
                  then, see All Official Notices for everything KMate has indexed.
                </p>
              )}
              {approved.length > 0 && hasFilters && (
                <Link href={noticesHref(current, { program: "all", track: "all", type: "all" })} className="mt-2 inline-block text-[12.5px] font-medium text-primary hover:underline">
                  Clear filters
                </Link>
              )}
            </Card>
          ) : (
            <>
              <p className="mt-5 text-[12px] text-muted">
                {filtered.length} notice{filtered.length === 1 ? "" : "s"}
                {hasFilters ? " matching these filters" : ""}
              </p>
              <div className="mt-2.5 flex flex-col gap-3">
                {filtered.map((n) => (
                  <GksNoticeCard key={n.id} notice={n} />
                ))}
              </div>
            </>
          )}
        </>
      ) : board.length === 0 ? (
        <Card className="mt-6">
          <p className="text-[13.5px] text-muted">
            No current notices indexed yet. The next scheduled check will populate this feed.
          </p>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {board.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <MicroLabel>{formatDate(n.published_date)}</MicroLabel>
                {n.status === "new" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    New
                  </span>
                )}
              </div>

              <h2 className="mt-1.5 break-words text-[15px] font-semibold leading-snug text-ink">{n.title}</h2>

              {n.summary ? (
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{n.summary}</p>
              ) : (
                <p className="mt-1.5 text-[13.5px] italic leading-relaxed text-muted">{NOT_SPECIFIED}</p>
              )}

              <a
                href={n.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                Read the official notice
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
