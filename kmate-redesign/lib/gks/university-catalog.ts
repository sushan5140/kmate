import universitiesJson from "@/data/gks-universities.json";

export type UniversityEligibilitySeedRow = {
  track: "gks_u" | "gks_g";
  category:
    | "embassy_type_a"
    | "embassy_type_b_rgks"
    | "uic_bachelors"
    | "associate_degree"
    | "type_a"
    | "type_b";
  embassy_type: "type_a" | "type_b" | null;
  specialization: "rnd_program" | "global_network_program" | null;
};

export function buildUniversityEligibilityCatalog(): Map<string, UniversityEligibilitySeedRow[]> {
  const byUniversity = new Map<string, UniversityEligibilitySeedRow[]>();

  function addRow(name: string, row: UniversityEligibilitySeedRow) {
    const existing = byUniversity.get(name) ?? [];
    if (!existing.some((item) => item.track === row.track && item.category === row.category)) {
      existing.push(row);
    }
    byUniversity.set(name, existing);
  }

  const gksU = universitiesJson.tracks["GKS-U"];
  for (const name of gksU.embassy_track.type_a) {
    addRow(name, { track: "gks_u", category: "embassy_type_a", embassy_type: "type_a", specialization: null });
  }
  for (const name of gksU.embassy_track.type_b_rgks) {
    addRow(name, { track: "gks_u", category: "embassy_type_b_rgks", embassy_type: "type_b", specialization: null });
  }
  for (const name of gksU.university_track_uic_bachelors) {
    addRow(name, { track: "gks_u", category: "uic_bachelors", embassy_type: null, specialization: null });
  }
  for (const name of gksU.university_track_uic_associate) {
    addRow(name, { track: "gks_u", category: "associate_degree", embassy_type: null, specialization: null });
  }
  for (const name of gksU.university_track_associate_degree) {
    addRow(name, { track: "gks_u", category: "associate_degree", embassy_type: null, specialization: null });
  }

  const gksG = universitiesJson.tracks["GKS-G"];
  for (const name of gksG.type_a) {
    addRow(name, { track: "gks_g", category: "type_a", embassy_type: "type_a", specialization: null });
  }
  for (const name of gksG.type_b) {
    addRow(name, { track: "gks_g", category: "type_b", embassy_type: "type_b", specialization: null });
  }

  function tagSpecialization(
    name: string,
    specialization: "rnd_program" | "global_network_program"
  ) {
    const rows = byUniversity.get(name) ?? [];
    const gksGRow = rows.find(
      (row) => row.track === "gks_g" && (row.category === "type_a" || row.category === "type_b")
    );
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

export const CURRENT_GKS_U_UNIVERSITY_NAMES = new Set(
  [...buildUniversityEligibilityCatalog()]
    .filter(([, rows]) => rows.some((row) => row.track === "gks_u"))
    .map(([name]) => name)
);
