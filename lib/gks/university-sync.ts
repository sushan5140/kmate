import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { buildUniversityEligibilityCatalog } from "@/lib/gks/university-catalog";

export interface UniversityCatalogSyncResult {
  universitiesUpserted: number;
  eligibilityRowsUpserted: number;
  staleGksURowsRemoved: number;
}

export async function syncUniversityCatalog(): Promise<UniversityCatalogSyncResult> {
  const admin = getSupabaseAdmin();
  const byUniversity = buildUniversityEligibilityCatalog();

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

  let staleGksURowsRemoved = 0;
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
    staleGksURowsRemoved++;
  }

  let universitiesUpserted = 0;
  let eligibilityRowsUpserted = 0;

  for (const [name, rows] of byUniversity) {
    const { data: university, error: uniError } = await admin
      .from("universities")
      .upsert({ name }, { onConflict: "name" })
      .select("id")
      .single();

    if (uniError || !university) {
      throw new Error(`Failed to upsert university "${name}": ${uniError?.message ?? "missing row"}`);
    }
    universitiesUpserted++;

    for (const row of rows) {
      const { error: eligibilityError } = await admin.from("university_eligibility").upsert(
        {
          university_id: university.id,
          track: row.track,
          category: row.category,
          embassy_type: row.embassy_type,
          specialization: row.specialization,
        },
        { onConflict: "university_id,track,category" }
      );

      if (eligibilityError) {
        throw new Error(
          `Failed to upsert eligibility for "${name}" (${row.track}/${row.category}): ${eligibilityError.message}`
        );
      }
      eligibilityRowsUpserted++;
    }
  }

  return { universitiesUpserted, eligibilityRowsUpserted, staleGksURowsRemoved };
}
