import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Official Notices — KMate",
};

// Always read live -- the discovery cron writes on its own schedule, and a
// cached page would show a stale official-notice list.
export const dynamic = "force-dynamic";

/**
 * Phase 1 notice feed. Deliberately minimal: no filters, no categories, no
 * search. Shows 'new' + 'current' only ('archived' is excluded from the
 * default view).
 *
 * Every value here comes verbatim from the official source row. Where the
 * source didn't state something, the column is NULL and renders as
 * "Not specified in the official source" -- nothing is inferred or filled in
 * with a plausible-looking guess.
 */
const NOT_SPECIFIED = "Not specified in the official source";

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

export default async function NoticesPage() {
  await requireOnboarded("/notices");

  const { data } = await getSupabaseAdmin()
    .from("notices")
    .select("id, title, source_url, published_date, summary, status, source:sources ( name, official_domain )")
    .in("status", ["new", "current"])
    .eq("is_active", true)
    .order("published_date", { ascending: false, nullsFirst: false })
    .limit(50);

  const notices = (data ?? []) as unknown as NoticeRow[];
  const sourceName = notices[0]?.source?.name ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">Official Notices</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Announcements republished verbatim from{" "}
        {sourceName ?? "the official Study in Korea announcement board"}. KMate only indexes
        registered official sources and never fills in details the source doesn&apos;t state — always
        confirm against the original notice before acting on it.
      </p>

      {notices.length === 0 ? (
        <Card className="mt-6">
          <p className="text-[13.5px] text-muted">
            No current notices indexed yet. The next scheduled check will populate this feed.
          </p>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {notices.map((n) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <MicroLabel>{formatDate(n.published_date)}</MicroLabel>
                {n.status === "new" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    New
                  </span>
                )}
              </div>

              <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{n.title}</h2>

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
