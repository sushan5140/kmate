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
    if (!existing.some((item) => item.track === row.track && item.category === row.category)) {
      existing.push(row);
    }
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
  // The current DB schema has one associate-degree eligibility category. That
  // is sufficient for profile/university selection because both UIC associate
  // and the separate Associate Degree route are University Track choices.
  // The exact UIC-vs-separate-program distinction is preserved in the source
  // JSON and in the Requirement Checker, where it affects department options.
  for (const name of gksU.university_track_uic_associate) {
    addRow(name, { track: "gks_u", category: "associate_degree", embassy_type: null, specialization: null });
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

  // Reconcile GKS-U rather than only upserting. An upsert-only yearly refresh
  // leaves universities from the previous cycle selectable forever. Existing
  // profile choices keep their university_id; if their old eligibility row is
  // no longer current, its nullable eligibility_id is cleared before deletion.
  const desiredGksU = new Set<string>();
  for (const [name, rows] of byUniversity) {
    for (const row of rows) {
      if (row.track === "gks_u") desiredGksU.add(`${name}|${row.category}`);
    }
  }

  const { data: existingGksU, error: existingError } = await admin
    .from("university_eligibility")
    .select("id, category, university:universities!inner(name)")
    .eq("track", "gks_u");

  if (existingError) {
    throw new Error(`Could not read existing GKS-U eligibility rows: ${existingError.message}`);
  }

  let staleEligibilityCount = 0;
  for (const existing of (existingGksU ?? []) as unknown as {
    id: string;
    category: string;
    university: { name: string } | null;
  }[]) {
    const name = existing.university?.name;
    if (!name || desiredGksU.has(`${name}|${existing.category}`)) continue;

    const { error: detachError } = await admin
      .from("university_choices")
      .update({ eligibility_id: null })
      .eq("eligibility_id", existing.id);
    if (detachError) {
      throw new Error(`Could not detach stale eligibility for ${name}: ${detachError.message}`);
    }

    const { error: deleteError } = await admin
      .from("university_eligibility")
      .delete()
      .eq("id", existing.id);
    if (deleteError) {
      throw new Error(`Could not delete stale eligibility for ${name}: ${deleteError.message}`);
    }
    staleEligibilityCount++;
  }

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

  console.log(
    `Seeded ${universityCount} universities, ${eligibilityCount} eligibility rows; removed ${staleEligibilityCount} stale GKS-U eligibility rows.`
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
