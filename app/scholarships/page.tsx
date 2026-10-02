import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isExpiredNow } from "@/lib/scholarships/lifecycle";
import ScholarshipStudio, {
  type ScholarshipStudioRow,
} from "@/components/scholarships/scholarship-studio";

export const metadata: Metadata = {
  title: "Scholarship Studio — KMate",
  description:
    "Discover, inspect, track, and compare source-linked Korean university scholarships inside KMate.",
};

export const dynamic = "force-dynamic";

const NOT_SPECIFIED = "Not specified in the official source";

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
  if (row.deadline_type && DEADLINE_TYPE_LABELS[row.deadline_type]) {
    return DEADLINE_TYPE_LABELS[row.deadline_type];
  }
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

  // Read-time safety net: clearly expired fixed-date rows stay hidden even if
  // the freshness cron has not updated their stored lifecycle status yet.
  const activeRows = ((data ?? []) as ScholarshipRow[]).filter((row) => !isExpiredNow(row));

  const rows: ScholarshipStudioRow[] = activeRows.map((row) => ({
    ...row,
    deadline_label: deadlineLabel(row),
  }));

  return <ScholarshipStudio rows={rows} />;
}
