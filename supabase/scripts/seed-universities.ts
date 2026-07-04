/**
 * Idempotent re-runnable seed for the universities + university_eligibility
 * tables, from data/gks-universities.json (NIIED updates this list roughly
 * yearly -- re-run this script after swapping in a new JSON file rather than
 * hand-editing the database).
 *
 * Usage: npm run seed:universities
 */
import universitiesJson from "../../data/gks-universities.json";
import { getSupabaseAdmin } from "../../lib/supabase/server";

type EligibilityRow = {
  track: "gks_u" | "gks_g";
  category: "embassy_type_a" | "embassy_type_b_rgks" | "uic_bachelors" | "associate_degree" | "type_a" | "type_b";
  embassy_type: "type_a" | "type_b" | null;
  specialization: "rnd_program" | "global_network_program" | null;
};

/**
 * Turns the nested PRD JSON shape into a flat map of
 * university name -> eligibility rows to upsert. Isolated in its own
 * function (rather than inlined below) so adapting to a differently-shaped
 * future NIIED export is a small, contained edit.
 */
function parseUniversityJson(json: typeof universitiesJson): Map<string, EligibilityRow[]> {
  const byUniversity = new Map<string, EligibilityRow[]>();

  function addRow(name: string, row: EligibilityRow) {
    const existing = byUniversity.get(name) ?? [];
    existing.push(row);
    byUniversity.set(name, existing);
  }

  const gksU = json.tracks["GKS-U"];
  for (const name of gksU.embassy_track.type_a) {
    addRow(name, { track: "gks_u", category: "embassy_type_a", embassy_type: "type_a", specialization: null });
  }
  for (const name of gksU.embassy_track.type_b_rgks) {
    addRow(name, { track: "gks_u", category: "embassy_type_b_rgks", embassy_type: "type_b", specialization: null });
  }
  for (const name of gksU.university_track_uic_bachelors) {
    addRow(name, { track: "gks_u", category: "uic_bachelors", embassy_type: null, specialization: null });
  }
  for (const name of gksU.university_track_associate_degree) {
    addRow(name, { track: "gks_u", category: "associate_degree", embassy_type: null, specialization: null });
  }

  const gksG = json.tracks["GKS-G"];
  for (const name of gksG.type_a) {
    addRow(name, { track: "gks_g", category: "type_a", embassy_type: "type_a", specialization: null });
  }
  for (const name of gksG.type_b) {
    addRow(name, { track: "gks_g", category: "type_b", embassy_type: "type_b", specialization: null });
  }

  // Specializations tag an existing gks_g type_a/type_b row rather than
  // creating a new row (the schema's specialization column is single-valued
  // per row). A university appearing in BOTH specialization lists (e.g.
  // Ajou University) can only carry one tag here -- rnd_program wins in that
  // edge case since it's processed last. This is a known MVP limitation for
  // a feature the PRD itself describes as an optional "extra filter chip".
  function tagSpecialization(name: string, specialization: "rnd_program" | "global_network_program") {
    const rows = byUniversity.get(name) ?? [];
    const gksGRow = rows.find((r) => r.track === "gks_g" && (r.category === "type_a" || r.category === "type_b"));
    if (gksGRow) gksGRow.specialization = specialization;
  }
  for (const name of gksG.specializations.global_network_program) {
    tagSpecialization(name, "global_network_program");
  }
  for (const name of gksG.specializations.rnd_program) {
    tagSpecialization(name, "rnd_program");
  }

  return byUniversity;
}

async function main() {
  const admin = getSupabaseAdmin();
  const byUniversity = parseUniversityJson(universitiesJson);

  let universityCount = 0;
  let eligibilityCount = 0;

  for (const [name, rows] of byUniversity) {
    const { data: university, error: uniError } = await admin
      .from("universities")
      .upsert({ name }, { onConflict: "name" })
      .select("id")
      .single();

    if (uniError || !university) {
      console.error(`Failed to upsert university "${name}":`, uniError);
      continue;
    }
    universityCount++;

    for (const row of rows) {
      const { error: eligError } = await admin.from("university_eligibility").upsert(
        {
          university_id: university.id,
          track: row.track,
          category: row.category,
          embassy_type: row.embassy_type,
          specialization: row.specialization,
        },
        { onConflict: "university_id,track,category" }
      );
      if (eligError) {
        console.error(`Failed to upsert eligibility for "${name}" (${row.track}/${row.category}):`, eligError);
        continue;
      }
      eligibilityCount++;
    }
  }

  console.log(`Seeded ${universityCount} universities, ${eligibilityCount} eligibility rows.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
