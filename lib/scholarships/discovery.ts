import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  parseKaistScholarshipPage,
  parseKaistProseScholarshipPage,
  parseKoreaUniversityScholarshipPage,
  mapSections,
} from "@/lib/scholarships/extract";

/** Days before a fixed deadline at which a scholarship becomes 'expiring_soon'. */
export const EXPIRING_SOON_DAYS = 7;

const USER_AGENT = "KMate-NoticeMonitor/1.0 (+https://kmate.vercel.app; GKS applicant scholarship index)";

/**
 * Registered scholarship pages. Each entry was verified by hand against the
 * institution's official domain before being added -- see the Phase 2 report.
 * `universityName` and `degreeLevel` are operator configuration recorded here
 * (not scraped prose): degreeLevel mirrors the section of the site the page
 * itself sits in, e.g. KAIST's "International Undergraduate" tree.
 */
export interface ScholarshipSourceConfig {
  noticeUrl: string;
  universityName: string;
  officialDomain: string;
  degreeLevel: "undergraduate" | "graduate";
  adapter: "kaist" | "korea_university";
  /** Used only when a page names no scholarship of its own. */
  fallbackName: string;
}

export const SCHOLARSHIP_SOURCES: ScholarshipSourceConfig[] = [
  {
    noticeUrl: "https://admission.kaist.ac.kr/intl-undergraduate/support/scholarships/kaist",
    universityName: "KAIST",
    officialDomain: "admission.kaist.ac.kr",
    degreeLevel: "undergraduate",
    adapter: "kaist",
    fallbackName: "KAIST Scholarship",
  },
  {
    noticeUrl: "https://admission.kaist.ac.kr/intl-graduate/FinancialSupport/Scholarship/KAISTScholarship",
    universityName: "KAIST",
    officialDomain: "admission.kaist.ac.kr",
    degreeLevel: "graduate",
    adapter: "kaist",
    fallbackName: "KAIST Scholarship",
  },
  {
    noticeUrl: "https://oia.korea.ac.kr/oia2026/KU-Scholarships.do",
    universityName: "Korea University",
    officialDomain: "oia.korea.ac.kr",
    degreeLevel: "undergraduate",
    adapter: "korea_university",
    fallbackName: "KU Scholarship",
  },
];

export interface ScholarshipDiscoveryResult {
  sourceId: string;
  universityName: string;
  sourceUrl: string;
  found: number;
  inserted: number;
  unchanged: number;
  updated: number;
  errors: string[];
}

function sha256(s: string) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function isWithinOfficialDomain(url: string, officialDomain: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && hostname.toLowerCase() === officialDomain.toLowerCase();
  } catch {
    return false;
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: HTTP ${res.status}`);
  return res.text();
}

function parseFor(config: ScholarshipSourceConfig, html: string) {
  // KAIST authors its undergraduate and graduate scholarship pages with two
  // different templates, so try the structured heading/list form first and
  // fall back to the prose "bold Label: value" form. Both are exact-shape
  // readers -- if neither matches, we return nothing rather than guessing.
  const raws =
    config.adapter === "kaist"
      ? (() => {
          const structured = parseKaistScholarshipPage(html, config.fallbackName);
          return structured.length ? structured : parseKaistProseScholarshipPage(html, config.fallbackName);
        })()
      : parseKoreaUniversityScholarshipPage(html);
  return raws.map(mapSections);
}

/**
 * Job A -- scholarship discovery. Fetches each registered scholarship page,
 * extracts the scholarships it lists, and upserts them keyed on
 * (source_id, scholarship_name, source_url). Same content-hash dedupe as
 * Phase 1's notices: identical hash means no write at all.
 *
 * Deliberately does NOT set status here beyond the insert default -- status
 * is owned by the freshness job (runScholarshipFreshness) so there is one
 * authority for lifecycle transitions.
 */
export async function runScholarshipDiscovery(): Promise<ScholarshipDiscoveryResult[]> {
  const admin = getSupabaseAdmin();
  const results: ScholarshipDiscoveryResult[] = [];

  const { data: sources, error } = await admin
    .from("sources")
    .select("id, name, notice_url, official_domain, active, source_type")
    .eq("active", true)
    .in("source_type", ["university_scholarship", "university_admissions"]);
  if (error) throw new Error(`loading scholarship sources failed: ${error.message}`);

  for (const source of sources ?? []) {
    const config = SCHOLARSHIP_SOURCES.find((c) => c.noticeUrl === source.notice_url);
    const result: ScholarshipDiscoveryResult = {
      sourceId: source.id,
      universityName: config?.universityName ?? source.name,
      sourceUrl: source.notice_url,
      found: 0,
      inserted: 0,
      unchanged: 0,
      updated: 0,
      errors: [],
    };
    const checkedAt = new Date().toISOString();

    try {
      if (!config) throw new Error(`no adapter registered for ${source.notice_url}`);
      if (!isWithinOfficialDomain(source.notice_url, source.official_domain)) {
        throw new Error(`notice_url is outside registered official_domain`);
      }

      const html = await fetchText(source.notice_url);
      const mapped = parseFor(config, html);
      result.found = mapped.length;
      if (mapped.length === 0) throw new Error("page parsed to 0 scholarships -- markup may have changed");

      const { data: existingRows } = await admin
        .from("scholarships")
        .select("id, scholarship_name, content_hash")
        .eq("source_id", source.id);
      const existingByName = new Map((existingRows ?? []).map((r) => [r.scholarship_name, r]));

      for (const s of mapped) {
        const hash = sha256(JSON.stringify({ name: s.name, sections: s.sections }));
        const existing = existingByName.get(s.name);
        const now = new Date().toISOString();

        const payload: Record<string, unknown> = {
          university_name: config.universityName,
          source_id: source.id,
          scholarship_name: s.name,
          scholarship_type: s.groupLabel,
          degree_level: config.degreeLevel,
          benefit_type: s.benefitType,
          tuition_coverage: s.tuitionCoverage,
          gpa_requirement: s.gpaRequirement,
          topik_requirement: s.topikRequirement,
          application_required: s.applicationRequired,
          automatic_consideration: s.automaticConsideration,
          deadline: s.deadline,
          deadline_type: s.deadlineType,
          source_url: source.notice_url,
          content_hash: hash,
          last_verified_at: now,
        };

        if (!existing) {
          const { error: insertError } = await admin.from("scholarships").insert(payload);
          if (insertError) result.errors.push(`insert "${s.name}": ${insertError.message}`);
          else result.inserted++;
        } else if (existing.content_hash === hash) {
          result.unchanged++;
        } else {
          const { error: updateError } = await admin
            .from("scholarships")
            .update({ ...payload, updated_at: now })
            .eq("id", existing.id);
          if (updateError) result.errors.push(`update "${s.name}": ${updateError.message}`);
          else {
            result.updated++;
            console.log(`[scholarships] content changed: ${config.universityName} / ${s.name}`);
          }
        }
      }

      await admin
        .from("sources")
        .update({ last_checked_at: checkedAt, last_successful_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", source.id);
    } catch (e) {
      result.errors.push((e as Error).message);
      await admin
        .from("sources")
        .update({ last_checked_at: checkedAt, updated_at: new Date().toISOString() })
        .eq("id", source.id);
    }

    results.push(result);
  }

  return results;
}

export interface FreshnessResult {
  evaluated: number;
  toActive: number;
  toExpiringSoon: number;
  toExpired: number;
  skippedNoFixedDeadline: number;
}

/**
 * Job B -- deadline lifecycle. Phase 2's core, and deliberately the ONLY
 * writer of `status`/`is_active`:
 *
 *   fixed  & deadline  > today + 7d  -> 'active'
 *   fixed  & deadline <= today + 7d  -> 'expiring_soon'
 *   fixed  & deadline  < today       -> 'expired', is_active = false
 *   admission_schedule / automatic / null deadline_type -> 'active', never expires
 *
 * Rows are never deleted -- an expired scholarship keeps its record with
 * is_active = false, same retention principle as Phase 1's notices.
 *
 * `today` is injectable purely so the lifecycle can be exercised against
 * known dates during verification; production calls pass nothing.
 */
export async function runScholarshipFreshness(today: Date = new Date()): Promise<FreshnessResult> {
  const admin = getSupabaseAdmin();
  const { data: rows, error } = await admin
    .from("scholarships")
    .select("id, deadline, deadline_type, status, is_active");
  if (error) throw new Error(`loading scholarships failed: ${error.message}`);

  const todayStr = today.toISOString().slice(0, 10);
  const soonCutoff = new Date(today);
  soonCutoff.setUTCDate(soonCutoff.getUTCDate() + EXPIRING_SOON_DAYS);
  const soonStr = soonCutoff.toISOString().slice(0, 10);

  const out: FreshnessResult = {
    evaluated: rows?.length ?? 0,
    toActive: 0,
    toExpiringSoon: 0,
    toExpired: 0,
    skippedNoFixedDeadline: 0,
  };

  for (const r of rows ?? []) {
    // No fixed date means there is nothing to compare against -- these stay
    // active indefinitely rather than being aged out on a guess.
    if (r.deadline_type !== "fixed" || !r.deadline) {
      out.skippedNoFixedDeadline++;
      if (r.status !== "active" || r.is_active !== true) {
        await admin.from("scholarships").update({ status: "active", is_active: true, updated_at: new Date().toISOString() }).eq("id", r.id);
        out.toActive++;
      }
      continue;
    }

    let status: "active" | "expiring_soon" | "expired";
    let isActive = true;
    if (r.deadline < todayStr) {
      status = "expired";
      isActive = false;
    } else if (r.deadline <= soonStr) {
      status = "expiring_soon";
    } else {
      status = "active";
    }

    if (r.status !== status || r.is_active !== isActive) {
      const { error: updateError } = await admin
        .from("scholarships")
        .update({ status, is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (!updateError) {
        if (status === "active") out.toActive++;
        else if (status === "expiring_soon") out.toExpiringSoon++;
        else out.toExpired++;
      }
    }
  }

  return out;
}
