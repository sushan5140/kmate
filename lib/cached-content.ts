import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  EmbassyType,
  QuestionCategory,
  EcaTrack,
  EcaActivityType,
  EcaImpactArea,
  Confidence,
  MistakeDocumentType,
  MistakeReasonCategory,
} from "@/lib/constants";

/**
 * Interview DB / ECA / Mistakes are the same crowdsourced content for every
 * viewer -- only a user's own vote state, drafts, and (for their own
 * pending/rejected submissions) moderation status are personalized. These
 * functions cache just the shared `status = 'approved'` slice via the admin
 * client (bypassing RLS, filtered explicitly rather than relying on RLS to
 * scope it) -- no personalized field is ever part of the cached payload, so
 * there's no invalidation logic that has to be gotten right to avoid one
 * user's data leaking into another's cached response.
 *
 * 5-minute time-based revalidation bounds vote-count staleness (imperceptible
 * for a "ranked by upvotes" list); newly-approved content instead gets
 * near-immediate freshness via revalidateTag() called from the admin
 * moderate routes on approve, rather than waiting out the window.
 */
const REVALIDATE_SECONDS = 300;

export interface CachedQuestion {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotesCount: number;
  downvotesCount: number;
}

interface QuestionRow {
  id: string;
  text: string;
  category: QuestionCategory;
  upvotes_count: number;
  downvotes_count: number;
}

export const getCachedApprovedQuestions = unstable_cache(
  async (kind: "interview" | "interviewer"): Promise<CachedQuestion[]> => {
    const { data } = await getSupabaseAdmin()
      .from("interview_questions")
      .select("id, text, category, upvotes_count, downvotes_count")
      .eq("kind", kind)
      .eq("status", "approved")
      .order("upvotes_count", { ascending: false });
    return ((data ?? []) as unknown as QuestionRow[]).map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category,
      upvotesCount: q.upvotes_count,
      downvotesCount: q.downvotes_count,
    }));
  },
  ["approved-questions"],
  { revalidate: REVALIDATE_SECONDS, tags: ["questions"] }
);

export interface CachedEcaEntry {
  id: string;
  title: string;
  description: string | null;
  track: EcaTrack;
  upvotesCount: number;
  downvotesCount: number;
  activityType: EcaActivityType | null;
  impactArea: EcaImpactArea | null;
  confidence: Confidence | null;
  sourceUrl: string | null;
}

interface EcaRow {
  id: string;
  title: string;
  description: string | null;
  track: EcaTrack;
  upvotes_count: number;
  downvotes_count: number;
  activity_type: EcaActivityType | null;
  impact_area: EcaImpactArea | null;
  confidence: Confidence | null;
  source_url: string | null;
}

export const getCachedApprovedEcaEntries = unstable_cache(
  async (): Promise<CachedEcaEntry[]> => {
    const { data } = await getSupabaseAdmin()
      .from("eca_entries")
      .select("id, title, description, track, upvotes_count, downvotes_count, activity_type, impact_area, confidence, source_url")
      .eq("status", "approved")
      .order("upvotes_count", { ascending: false });
    return ((data ?? []) as unknown as EcaRow[]).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      track: e.track,
      upvotesCount: e.upvotes_count,
      downvotesCount: e.downvotes_count,
      activityType: e.activity_type,
      impactArea: e.impact_area,
      confidence: e.confidence,
      sourceUrl: e.source_url,
    }));
  },
  ["approved-eca-entries"],
  { revalidate: REVALIDATE_SECONDS, tags: ["eca"] }
);

export interface CachedMistakeEntry {
  id: string;
  title: string;
  description: string | null;
  documentType: MistakeDocumentType;
  reasonCategory: MistakeReasonCategory;
  upvotesCount: number;
  downvotesCount: number;
  confidence: Confidence | null;
  sourceUrl: string | null;
}

interface MistakeRow {
  id: string;
  title: string;
  description: string | null;
  document_type: MistakeDocumentType;
  reason_category: MistakeReasonCategory;
  upvotes_count: number;
  downvotes_count: number;
  confidence: Confidence | null;
  source_url: string | null;
}

export interface CachedUniversity {
  id: string;
  name: string;
  city: string | null;
  eligibility: {
    id: string;
    track: string;
    category: string;
    embassy_type: "type_a" | "type_b" | null;
    specialization: string | null;
  }[];
}

/**
 * University list changes only once a cycle (admin re-import), so this gets
 * a much longer revalidation window than the vote-driven content above --
 * and there's no admin re-import route in this app to hook an on-demand
 * revalidateTag() into (the "PRD"-noted re-import happens directly against
 * the DB) -- purely time-based until one exists.
 */
export const getCachedUniversitySearch = unstable_cache(
  async (track: string | null, q: string): Promise<CachedUniversity[]> => {
    let query = getSupabaseAdmin()
      .from("universities")
      .select(
        `
        id, name, city,
        eligibility:university_eligibility!inner ( id, track, category, embassy_type, specialization )
      `
      )
      .order("name")
      .limit(50);

    if (track === "gks_u" || track === "gks_g") {
      query = query.eq("eligibility.track", track);
    }
    if (q) {
      query = query.ilike("name", `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`);
    }

    const { data, error } = await query;
    // Throw (rather than caching an empty result) on a transient query
    // failure -- matches this route's original behavior of surfacing
    // search_failed instead of silently returning no results.
    if (error) throw new Error(`university search query failed: ${error.message}`);
    return (data ?? []) as unknown as CachedUniversity[];
  },
  ["university-search"],
  { revalidate: 60 * 60 * 24, tags: ["universities"] }
);

export type GksTrack = "gks_g" | "gks_u";

export interface CachedGksUniversityStat {
  university: string;
  total_selected_count: number;
  embassy_track_count: number;
  university_track_count: number;
  distinct_country_count: number;
  degree_level_breakdown: string;
}

export interface CachedGksCountryStat {
  country: string;
  total_selected_count: number;
  embassy_track_count: number;
  university_track_count: number;
  distinct_university_count: number;
  degree_level_breakdown: string;
}

/**
 * A one-off load from NIIED's official 2026 Final Round PDFs (see
 * supabase/scripts/load-gks-scholar-stats.ts) -- there's no re-import path
 * to hook a revalidateTag() into until next year's lists exist, same
 * reasoning as getCachedUniversitySearch above.
 */
export const getCachedGksScholarStats = unstable_cache(
  async (track: GksTrack): Promise<{ universities: CachedGksUniversityStat[]; countries: CachedGksCountryStat[] }> => {
    const admin = getSupabaseAdmin();
    const [{ data: universities, error: uniError }, { data: countries, error: countryError }] = await Promise.all([
      admin
        .from("gks_university_stats")
        .select("university,total_selected_count,embassy_track_count,university_track_count,distinct_country_count,degree_level_breakdown")
        .eq("track", track)
        .order("total_selected_count", { ascending: false }),
      admin
        .from("gks_country_stats")
        .select("country,total_selected_count,embassy_track_count,university_track_count,distinct_university_count,degree_level_breakdown")
        .eq("track", track)
        .order("total_selected_count", { ascending: false }),
    ]);
    if (uniError) throw new Error(`gks_university_stats query failed: ${uniError.message}`);
    if (countryError) throw new Error(`gks_country_stats query failed: ${countryError.message}`);
    return { universities: universities ?? [], countries: countries ?? [] };
  },
  ["gks-scholar-stats"],
  { revalidate: 60 * 60 * 24, tags: ["gks-scholar-stats"] }
);

/**
 * Type A / Type B for every university that carries one in a given track,
 * straight from `university_eligibility` -- the same source of truth the
 * onboarding university picker uses. Not derived, not duplicated: the
 * Scholar Stats comparison badges read this and nothing else.
 *
 * Same 24h window as getCachedUniversitySearch for the same reason -- the
 * university list only changes on an admin re-import, and there is no
 * in-app route to hook a revalidateTag() into.
 */
export const getCachedUniversityEmbassyTypes = unstable_cache(
  async (track: GksTrack): Promise<{ name: string; embassyType: EmbassyType }[]> => {
    const { data, error } = await getSupabaseAdmin()
      .from("university_eligibility")
      .select("embassy_type, university:universities!inner ( name )")
      .eq("track", track)
      .not("embassy_type", "is", null);
    if (error) throw new Error(`university_eligibility query failed: ${error.message}`);
    const rows = (data ?? []) as unknown as { embassy_type: EmbassyType; university: { name: string } | null }[];
    return rows
      .filter((row) => row.university?.name)
      .map((row) => ({ name: row.university!.name, embassyType: row.embassy_type }));
  },
  ["university-embassy-types"],
  { revalidate: 60 * 60 * 24, tags: ["universities"] }
);

export interface CachedGksCrossTabRow {
  university: string;
  country: string;
  seat_count: number;
  pct_of_university_seats: number;
  pct_of_country_seats: number;
}

/**
 * The university<->country breakdown for one specific university OR one
 * specific country (never both) -- fetched on demand when a row is expanded
 * rather than shipping all ~1,186 cross-tab rows on initial page load.
 */
export const getCachedGksBreakdown = unstable_cache(
  async (track: GksTrack, university: string | null, country: string | null): Promise<CachedGksCrossTabRow[]> => {
    const admin = getSupabaseAdmin();
    let query = admin
      .from("gks_university_country_stats")
      .select("university,country,seat_count,pct_of_university_seats,pct_of_country_seats")
      .eq("track", track);
    query = university ? query.eq("university", university) : query.eq("country", country!);
    const { data, error } = await query.order("seat_count", { ascending: false });
    if (error) throw new Error(`gks_university_country_stats query failed: ${error.message}`);
    return data ?? [];
  },
  ["gks-scholar-breakdown"],
  { revalidate: 60 * 60 * 24, tags: ["gks-scholar-stats"] }
);

export const getCachedApprovedMistakeEntries = unstable_cache(
  async (): Promise<CachedMistakeEntry[]> => {
    const { data } = await getSupabaseAdmin()
      .from("mistake_entries")
      .select("id, title, description, document_type, reason_category, upvotes_count, downvotes_count, confidence, source_url")
      .eq("status", "approved")
      .order("upvotes_count", { ascending: false });
    return ((data ?? []) as unknown as MistakeRow[]).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      documentType: e.document_type,
      reasonCategory: e.reason_category,
      upvotesCount: e.upvotes_count,
      downvotesCount: e.downvotes_count,
      confidence: e.confidence,
      sourceUrl: e.source_url,
    }));
  },
  ["approved-mistake-entries"],
  { revalidate: REVALIDATE_SECONDS, tags: ["mistakes"] }
);
