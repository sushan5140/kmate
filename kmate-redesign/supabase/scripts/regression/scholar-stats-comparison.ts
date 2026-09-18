/**
 * Pure-logic check for the Scholar Stats university comparison. Runs against
 * the real NIIED extracts in data/ -- no database, no server, no browser -- so
 * it can be run in CI or on a laptop with no .env.local:
 *
 *   npx tsx supabase/scripts/regression/scholar-stats-comparison.ts
 *
 * The browser-level checks for the same feature live in scholar-stats-e2e.ts.
 */
import universitiesJson from "../../../data/gks-universities.json";
import universityStats from "../../../data/gks-scholar-university-stats.json";
import crossTab from "../../../data/gks-scholar-university-country-stats.json";
import { makeChecker } from "./_env";
import type { CachedGksCrossTabRow, CachedGksUniversityStat } from "../../../lib/cached-content";
import type { EmbassyType } from "../../../lib/constants";
import { resolveEmbassyTypes, type EmbassyTypeSource } from "../../../lib/scholar-stats/university-type";
import {
  deriveComparison,
  formatPct,
  parseDegreeBreakdown,
  toCountryShares,
  toUniversitySide,
  universityFromSlug,
  universitySlug,
} from "../../../lib/scholar-stats/comparison";

const { check, summarize } = makeChecker();

type StatRow = CachedGksUniversityStat & { track: "gks_g" | "gks_u" };
type CrossRow = CachedGksCrossTabRow & { track: "gks_g" | "gks_u" };

const stats = universityStats as StatRow[];
const cross = crossTab as CrossRow[];

/** Mirrors what getCachedUniversityEmbassyTypes() returns, from the seed the DB was loaded from. */
function embassySourcesFor(track: "gks_g" | "gks_u"): EmbassyTypeSource[] {
  const out: EmbassyTypeSource[] = [];
  const add = (names: string[], embassyType: EmbassyType) => {
    for (const name of names) out.push({ name, embassyType });
  };
  if (track === "gks_u") {
    add(universitiesJson.tracks["GKS-U"].embassy_track.type_a, "type_a");
    add(universitiesJson.tracks["GKS-U"].embassy_track.type_b_rgks, "type_b");
  } else {
    add(universitiesJson.tracks["GKS-G"].type_a, "type_a");
    add(universitiesJson.tracks["GKS-G"].type_b, "type_b");
  }
  return out;
}

function statFor(track: "gks_g" | "gks_u", university: string) {
  const row = stats.find((s) => s.track === track && s.university === university);
  if (!row) throw new Error(`no stat row for ${track}/${university}`);
  return row;
}

function crossFor(track: "gks_g" | "gks_u", university: string): CachedGksCrossTabRow[] {
  return cross.filter((r) => r.track === track && r.university === university);
}

// --- degree breakdown parsing -------------------------------------------------
check(
  "parses a plain breakdown",
  JSON.stringify(parseDegreeBreakdown("Master's:39;Doctoral:7;Research:1")) ===
    JSON.stringify([
      { label: "Master's", count: 39 },
      { label: "Doctoral", count: 7 },
      { label: "Research", count: 1 },
    ])
);
check(
  "keeps parentheses inside a degree label",
  JSON.stringify(parseDegreeBreakdown("Bachelor's(UIC):7;Bachelor's:1")) ===
    JSON.stringify([
      { label: "Bachelor's(UIC)", count: 7 },
      { label: "Bachelor's", count: 1 },
    ])
);
check("empty breakdown yields no rows", parseDegreeBreakdown("").length === 0);
check("malformed breakdown is skipped, not thrown on", parseDegreeBreakdown("Masters;:;x:y").length === 0);

// Every real breakdown string must parse, and its counts must sum to the total.
let breakdownMismatches = 0;
for (const row of stats) {
  const parsed = parseDegreeBreakdown(row.degree_level_breakdown);
  const sum = parsed.reduce((acc, level) => acc + level.count, 0);
  if (parsed.length === 0 || sum !== row.total_selected_count) breakdownMismatches++;
}
check(`all ${stats.length} degree breakdowns parse and sum to the total`, breakdownMismatches === 0);

// --- percentages --------------------------------------------------------------
check("formats a repeating share to one decimal", formatPct(33.333) === "33.3%");
check("drops a trailing .0", formatPct(25) === "25%");
check("renders a missing share as an em dash", formatPct(null) === "—");
check("never renders NaN%", formatPct(Number.NaN) === "—");

const kookminU = statFor("gks_u", "Kookmin University");
const hongikU = statFor("gks_u", "Hongik University");
const kookminShares = toCountryShares(crossFor("gks_u", "Kookmin University"), kookminU.total_selected_count);
const hongikShares = toCountryShares(crossFor("gks_u", "Hongik University"), hongikU.total_selected_count);

check("Kookmin GKS-U has 8 recorded scholars", kookminU.total_selected_count === 8);
check("Kookmin GKS-U spans 7 countries", kookminShares.length === 7);
check(
  "Kookmin's largest country share is Kyrgyzstan at 25%",
  kookminShares[0].country === "Kyrgyzstan" && kookminShares[0].scholars === 2 && formatPct(kookminShares[0].pct) === "25%"
);
check("Hongik GKS-U has 3 recorded scholars across 3 countries", hongikU.total_selected_count === 3 && hongikShares.length === 3);
check("Hongik's shares each render as 33.3%", hongikShares.every((s) => formatPct(s.pct) === "33.3%"));
check("country shares come back sorted by scholars descending", kookminShares.every((s, i, all) => i === 0 || all[i - 1].scholars >= s.scholars));

// A university with zero recorded scholars must produce no undefined percentages.
check("zero-total university yields null (not NaN) shares", toCountryShares([], 0).length === 0);
check(
  "a share computed against a zero total is null",
  toCountryShares([{ university: "X", country: "Y", seat_count: 0, pct_of_university_seats: 0, pct_of_country_seats: 0 }], 0)[0]
    .pct === null
);

// --- derived comparison -------------------------------------------------------
const embassyU = resolveEmbassyTypes(
  stats.filter((s) => s.track === "gks_u").map((s) => s.university),
  embassySourcesFor("gks_u")
);
const kookminSide = toUniversitySide(kookminU, embassyU["Kookmin University"] ?? null);
const hongikSide = toUniversitySide(hongikU, embassyU["Hongik University"] ?? null);
const delta = deriveComparison(kookminSide, hongikSide, kookminShares, hongikShares);

check("shared countries are India and Kazakhstan", delta.sharedCountries.join(",") === "India,Kazakhstan");
check(
  "only-in-Kookmin excludes both shared countries",
  delta.onlyFirstCountries.length === 5 && !delta.onlyFirstCountries.includes("India")
);
check("only-in-Hongik is Russia", delta.onlySecondCountries.join(",") === "Russia");
check("Kookmin leads on recorded scholars", delta.scholarsLeader === "first");
check("Kookmin leads on countries represented", delta.countriesLeader === "first");
check(
  "every country is accounted for exactly once across the three sets",
  delta.sharedCountries.length + delta.onlyFirstCountries.length + delta.onlySecondCountries.length ===
    new Set([...kookminShares, ...hongikShares].map((s) => s.country)).size
);
check(
  "degree labels union both sides without duplicates",
  delta.degreeLabels.length === new Set(delta.degreeLabels).size && delta.degreeLabels.includes("Bachelor's(UIC)")
);

const tieDelta = deriveComparison(hongikSide, hongikSide, hongikShares, hongikShares);
check("identical inputs report a tie, not a winner", tieDelta.scholarsLeader === "tie" && tieDelta.countriesLeader === "tie");

const emptySide = toUniversitySide(
  { university: "Empty University", total_selected_count: 0, embassy_track_count: 0, university_track_count: 0, distinct_country_count: 0, degree_level_breakdown: "" },
  null
);
const emptyDelta = deriveComparison(emptySide, hongikSide, [], hongikShares);
check("a university with no records compares without throwing", emptyDelta.onlyFirstCountries.length === 0);
check("its opponent's countries all land in only-second", emptyDelta.onlySecondCountries.length === 3);

// --- slugs --------------------------------------------------------------------
check("slugs match the documented URL shape", universitySlug("Kookmin University") === "kookmin-university");
check(
  "slugs survive punctuation and parentheses",
  universitySlug("Gwangju Institute of Science and Technology(GIST)") === "gwangju-institute-of-science-and-technology-gist"
);
const allNames = stats.filter((s) => s.track === "gks_g").map((s) => s.university);
check("every GKS-G university has a unique slug", new Set(allNames.map(universitySlug)).size === allNames.length);
check("a slug round-trips back to its name", universityFromSlug(universitySlug(allNames[0]), allNames) === allNames[0]);
check("an unknown slug resolves to null, not a wrong university", universityFromSlug("not-a-real-university", allNames) === null);

// --- Type A / Type B matching -------------------------------------------------
const embassyG = resolveEmbassyTypes(
  stats.filter((s) => s.track === "gks_g").map((s) => s.university),
  embassySourcesFor("gks_g")
);
const gCount = stats.filter((s) => s.track === "gks_g").length;
const uCount = stats.filter((s) => s.track === "gks_u").length;

check(`GKS-G resolves a type for most universities (${Object.keys(embassyG).length}/${gCount})`, Object.keys(embassyG).length >= 65);
check(`GKS-U resolves a type for most universities (${Object.keys(embassyU).length}/${uCount})`, Object.keys(embassyU).length >= 44);
check("exact-name match works", embassyG["Kookmin University"] === "type_a");
check("spacing variant matches (KyungHee -> Kyung Hee)", embassyU["KyungHee University"] === "type_a");
check("parenthetical-suffix variant matches (Sungkyunkwan -> ... (SKKU))", embassyG["Sungkyunkwan University"] === "type_a");
check(
  "inverted-acronym variant matches (KAIST)",
  embassyG["Korea Advanced Institute of Science and Technology(KAIST)"] === "type_a"
);
check("a typo in the source list stays unresolved rather than guessed", embassyG["Yonsei Univesity"] === undefined);
check(
  "every resolved value is a real embassy type",
  Object.values({ ...embassyG, ...embassyU }).every((t) => t === "type_a" || t === "type_b")
);

process.exit(summarize() ? 0 : 1);
