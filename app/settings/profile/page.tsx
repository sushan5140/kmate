import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { EditProfileForm, type EditProfileInitialData } from "@/components/settings/edit-profile-form";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import type { GksUEmbassyPath, Track } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Edit profile — KMate",
};

interface UniversityChoiceRow {
  priority: number;
  university_id: string;
  eligibility_id: string | null;
  university: { name: string } | null;
  eligibility: { category: string; embassy_type: "type_a" | "type_b" | null } | null;
}

export default async function SettingsProfilePage() {
  const user = await requireOnboarded("/settings/profile");
  const admin = getSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select(
      `username, bio, track, gks_u_embassy_path, major, application_year,
       university_choices ( priority, university_id, eligibility_id,
         university:universities ( name ),
         eligibility:university_eligibility ( category, embassy_type ) )`
    )
    .eq("id", user.id)
    .maybeSingle();

  const universityChoices = ((profile?.university_choices ?? []) as unknown as UniversityChoiceRow[]).sort(
    (a, b) => a.priority - b.priority
  );

  const initial: EditProfileInitialData = {
    track: (profile?.track as Track) ?? "gks_u",
    gksUEmbassyPath: (profile?.gks_u_embassy_path as GksUEmbassyPath | null) ?? null,
    major: profile?.major ?? "",
    applicationYear: profile?.application_year ?? new Date().getFullYear(),
    username: profile?.username ?? "",
    bio: profile?.bio ?? "",
    universities: universityChoices.map((u) => ({
      universityId: u.university_id,
      name: u.university?.name ?? "",
      eligibilityId: u.eligibility_id,
      embassyType: u.eligibility?.embassy_type ?? null,
      category: u.eligibility?.category ?? null,
    })),
  };

  return (
    <div>
      <EditProfileForm initial={initial} />
      <div className="mt-10 border-t border-border pt-6">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Danger zone</p>
        <div className="mt-2">
          <DeleteAccountButton />
        </div>
      </div>
    </div>
  );
}
