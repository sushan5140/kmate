import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { scholarshipAvailability, scholarshipDeadlineLabel } from "@/lib/scholarships/availability";
import ScholarshipStudio, {
  type ScholarshipStudioProfileSeed,
  type ScholarshipStudioRow,
} from "@/components/scholarships/scholarship-studio";

export const metadata: Metadata = {
  title: "Scholarship Studio — KMate",
  description:
    "Discover, inspect, track, compare, and run source-linked Korean university scholarship applications inside KMate.",
};

export const dynamic = "force-dynamic";

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
  application_required: boolean | null;
  automatic_consideration: boolean | null;
  deadline: string | null;
  deadline_type: string | null;
  status: string;
  is_active: boolean;
  source_url: string;
  content_hash: string | null;
  last_verified_at: string | null;
}

function studioRow(row: ScholarshipRow, now: Date): ScholarshipStudioRow {
  const availability = scholarshipAvailability(row, now);
  return {
    id: row.id,
    university_name: row.university_name,
    scholarship_name: row.scholarship_name,
    scholarship_type: row.scholarship_type,
    degree_level: row.degree_level,
    benefit_type: row.benefit_type,
    tuition_coverage: row.tuition_coverage,
    gpa_requirement: row.gpa_requirement,
    topik_requirement: row.topik_requirement,
    application_required: row.application_required,
    automatic_consideration: row.automatic_consideration,
    deadline: row.deadline,
    deadline_type: row.deadline_type,
    status: row.status,
    source_url: row.source_url,
    content_hash: row.content_hash,
    last_verified_at: row.last_verified_at,
    deadline_label: scholarshipDeadlineLabel(row),
    availability,
    is_active: row.is_active,
  };
}

export default async function ScholarshipsPage() {
  const user = await requireOnboarded("/scholarships");
  const admin = getSupabaseAdmin();

  const [{ data: scholarshipData }, { data: profile }] = await Promise.all([
    admin
      .from("scholarships")
      .select(
        "id, university_name, scholarship_name, scholarship_type, degree_level, benefit_type, tuition_coverage, gpa_requirement, topik_requirement, application_required, automatic_consideration, deadline, deadline_type, status, is_active, source_url, content_hash, last_verified_at"
      )
      .in("status", ["active", "expiring_soon", "expired"])
      .order("university_name", { ascending: true })
      .order("scholarship_name", { ascending: true })
      .limit(250),
    admin
      .from("profiles")
      .select("major, application_year, track")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const allRows = (scholarshipData ?? []) as ScholarshipRow[];
  const now = new Date();
  const mapped = allRows.map(row => studioRow(row, now));
  const rows = mapped.filter(row => row.availability.listed);
  const archive = mapped.filter(row => !row.availability.listed);

  const profileSeed: ScholarshipStudioProfileSeed = {
    major: profile?.major ?? "",
    applicationYear: profile?.application_year ?? null,
    track: profile?.track ?? null,
  };

  return (
    <ScholarshipStudio
      rows={rows}
      archivedRows={archive}
      profileSeed={profileSeed}
    />
  );
}
