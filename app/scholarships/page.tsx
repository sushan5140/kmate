import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { Card, MicroLabel } from "@/components/ui/card";
import { isExpiredNow } from "@/lib/scholarships/lifecycle";

export const metadata: Metadata = {
  title: "University Scholarships — KMate",
};

export const dynamic = "force-dynamic";

const NOT_SPECIFIED = "Not specified in the official source";

/** Labels for the non-fixed deadline kinds, so a missing date is explained rather than blank. */
const DEADLINE_TYPE_LABELS: Record<string, string> = {
  admission_schedule: "Follows the admission schedule",
  automatic: "Awarded automatically — no application",
};

interface ScholarshipRow {
  id: string;
  university_name: string;
  scholarship_name: string;
  scholarship_type: string | null;
  degree_level: string | null;
  benefit_type: string | null;
  tuition_coverage: string | null;
  gpa_requirement: string | null;
  topik_requirement: string | null;
  deadline: string | null;
  deadline_type: string | null;
  status: string;
  source_url: string;
}

function formatDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function deadlineLabel(row: ScholarshipRow): string {
  if (row.deadline) return formatDate(row.deadline);
  if (row.deadline_type && DEADLINE_TYPE_LABELS[row.deadline_type]) return DEADLINE_TYPE_LABELS[row.deadline_type];
  return NOT_SPECIFIED;
}

export default async function ScholarshipsPage() {
  await requireOnboarded("/scholarships");

  const { data } = await getSupabaseAdmin()
    .from("scholarships")
    .select(
      "id, university_name, scholarship_name, scholarship_type, degree_level, benefit_type, tuition_coverage, gpa_requirement, topik_requirement, deadline, deadline_type, status, source_url"
    )
    .in("status", ["active", "expiring_soon"])
    .eq("is_active", true)
    .order("university_name", { ascending: true })
    .order("scholarship_name", { ascending: true })
    .limit(100);

  // Read-time safety net. The stored `status` column is written only by the
  // freshness cron; when that job stops running (it had not succeeded in two
  // weeks before this change) a scholarship whose deadline has passed keeps
  // status = 'active' and stays on this page indefinitely. Re-deriving the
  // rule here means a clearly expired fixed-deadline award disappears even if
  // the scheduler is broken.
  //
  // Only ever REMOVES rows. It never resurrects one the cron has expired, and
  // it never expires a null/admission_schedule/automatic record -- those have
  // no stated end and must not be aged out on a guess.
  const rows = ((data ?? []) as ScholarshipRow[]).filter((s) => !isExpiredNow(s));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">University Scholarships</h1>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Scholarships for international students, copied verbatim from each university&apos;s own official
        pages. Fields a university doesn&apos;t state are left blank rather than guessed — always confirm
        against the original page before relying on any of this.
      </p>

      {rows.length === 0 ? (
        <Card className="mt-6">
          <p className="text-[13.5px] text-muted">
            No active scholarships indexed yet. The next scheduled check will populate this list.
          </p>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((s) => (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center gap-2">
                <MicroLabel>{s.university_name}</MicroLabel>
                {s.degree_level && (
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium capitalize text-muted">
                    {s.degree_level}
                  </span>
                )}
                {s.status === "expiring_soon" && (
                  <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
                    Closing soon
                  </span>
                )}
              </div>

              <h2 className="mt-1.5 text-[15px] font-semibold leading-snug text-ink">{s.scholarship_name}</h2>
              {s.scholarship_type && <p className="mt-0.5 text-[12.5px] text-muted">{s.scholarship_type}</p>}

              <dl className="mt-3 flex flex-col gap-1.5 text-[13px]">
                <div className="flex gap-2">
                  <dt className="w-[92px] shrink-0 text-muted">Deadline</dt>
                  <dd className={s.deadline || s.deadline_type ? "text-ink" : "italic text-muted"}>
                    {deadlineLabel(s)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-[92px] shrink-0 text-muted">Benefit</dt>
                  <dd className={s.benefit_type ? "whitespace-pre-line text-ink" : "italic text-muted"}>
                    {s.benefit_type ?? NOT_SPECIFIED}
                  </dd>
                </div>
                {s.gpa_requirement && (
                  <div className="flex gap-2">
                    <dt className="w-[92px] shrink-0 text-muted">GPA</dt>
                    <dd className="text-ink">{s.gpa_requirement}</dd>
                  </div>
                )}
                {s.topik_requirement && (
                  <div className="flex gap-2">
                    <dt className="w-[92px] shrink-0 text-muted">TOPIK</dt>
                    <dd className="text-ink">{s.topik_requirement}</dd>
                  </div>
                )}
              </dl>

              <a
                href={s.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                View the official page
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
