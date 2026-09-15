import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isValidUsernameFormat, isValidBio, escapeForIlike } from "@/lib/validation/username";
import { validateUniversityChoices } from "@/lib/validation/university-eligibility";
import { TRACKS, GKS_U_APPLICATION_ROUTES, GKS_U_EMBASSY_PATHS, CONTACT_TYPES } from "@/lib/constants";
import { validApplicationYears } from "@/lib/deadline";

interface CompleteOnboardingBody {
  track: string;
  gksUApplicationRoute?: string | null;
  gksUEmbassyPath?: string | null;
  major: string;
  applicationYear: number;
  username: string;
  bio?: string | null;
  universityChoices: { universityId: string; eligibilityId?: string | null }[];
  contacts?: { type: string; value: string }[];
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CompleteOnboardingBody;
  const {
    track,
    gksUApplicationRoute,
    gksUEmbassyPath,
    major,
    applicationYear,
    username,
    bio,
    universityChoices,
    contacts,
  } = body;

  if (!TRACKS.includes(track as (typeof TRACKS)[number])) {
    return NextResponse.json({ error: "invalid_track" }, { status: 400 });
  }
  if (
    gksUApplicationRoute &&
    !GKS_U_APPLICATION_ROUTES.includes(
      gksUApplicationRoute as (typeof GKS_U_APPLICATION_ROUTES)[number]
    )
  ) {
    return NextResponse.json({ error: "invalid_gks_u_route" }, { status: 400 });
  }
  if (track === "gks_u") {
    if (!gksUApplicationRoute) {
      return NextResponse.json({ error: "gks_u_route_required" }, { status: 400 });
    }
    if (gksUApplicationRoute === "embassy" && !gksUEmbassyPath) {
      return NextResponse.json({ error: "embassy_path_required" }, { status: 400 });
    }
    if (gksUApplicationRoute === "university" && gksUEmbassyPath) {
      return NextResponse.json({ error: "university_track_cannot_have_embassy_path" }, { status: 400 });
    }
  } else if (gksUApplicationRoute || gksUEmbassyPath) {
    return NextResponse.json({ error: "gks_u_route_not_applicable" }, { status: 400 });
  }

  if (
    gksUEmbassyPath &&
    !GKS_U_EMBASSY_PATHS.includes(gksUEmbassyPath as (typeof GKS_U_EMBASSY_PATHS)[number])
  ) {
    return NextResponse.json({ error: "invalid_embassy_path" }, { status: 400 });
  }
  if (!major || typeof major !== "string" || major.length > 100) {
    return NextResponse.json({ error: "invalid_major" }, { status: 400 });
  }
  if (!Number.isInteger(applicationYear) || !validApplicationYears(track as (typeof TRACKS)[number]).includes(applicationYear)) {
    return NextResponse.json({ error: "invalid_year" }, { status: 400 });
  }
  if (!isValidUsernameFormat(username)) {
    return NextResponse.json({ error: "invalid_username" }, { status: 400 });
  }
  if (bio && !isValidBio(bio)) {
    return NextResponse.json({ error: "bio_too_long" }, { status: 400 });
  }
  if (!Array.isArray(universityChoices)) {
    return NextResponse.json({ error: "invalid_universities" }, { status: 400 });
  }
  for (const c of contacts ?? []) {
    if (!CONTACT_TYPES.includes(c.type as (typeof CONTACT_TYPES)[number])) {
      return NextResponse.json({ error: "invalid_contact_type" }, { status: 400 });
    }
  }

  const admin = getSupabaseAdmin();

  // Re-check username availability server-side -- never trust the client's
  // debounced check alone.
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .neq("id", user.id)
    .ilike("username", escapeForIlike(username))
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  // Re-validate the embassy-track selection rules server-side against the
  // real eligibility rows (never trust client-computed embassy types).
  const eligibilityIds = universityChoices.map((c) => c.eligibilityId).filter((id): id is string => Boolean(id));
  const { data: eligibilityRows } = eligibilityIds.length
    ? await admin
        .from("university_eligibility")
        .select("id, university_id, track, category, embassy_type")
        .in("id", eligibilityIds)
    : {
        data: [] as {
          id: string;
          university_id: string;
          track: string;
          category: string;
          embassy_type: string | null;
        }[],
      };

  const validationChoices = universityChoices.map((choice) => {
    const row = eligibilityRows?.find((eligibility) => eligibility.id === choice.eligibilityId);
    if (
      !row ||
      row.university_id !== choice.universityId ||
      row.track !== track
    ) {
      return null;
    }
    return {
      category: row.category,
      embassyType: (row.embassy_type as "type_a" | "type_b" | null) ?? null,
    };
  });

  if (validationChoices.some((choice) => choice === null)) {
    return NextResponse.json({ error: "invalid_university_eligibility" }, { status: 400 });
  }

  const result = validateUniversityChoices(
    track as "gks_u" | "gks_g",
    (gksUEmbassyPath as "general_overseas" | "r_gks" | null) ?? null,
    validationChoices as { category: string; embassyType: "type_a" | "type_b" | null }[],
    track === "gks_u"
      ? (gksUApplicationRoute as "embassy" | "university")
      : null
  );
  if (!result.valid) {
    return NextResponse.json({ error: result.message ?? "invalid_university_selection" }, { status: 400 });
  }

  const { error } = await admin.rpc("complete_onboarding", {
    p_user_id: user.id,
    p_track: track,
    p_gks_u_embassy_path: gksUEmbassyPath ?? null,
    p_major: major,
    p_application_year: applicationYear,
    p_username: username,
    p_bio: bio ?? null,
    p_university_choices: universityChoices.map((c, i) => ({
      university_id: c.universityId,
      eligibility_id: c.eligibilityId ?? "",
      priority: i + 1,
    })),
    p_contacts: (contacts ?? []).filter((c) => c.value?.trim()),
  });

  if (error) {
    console.error("complete_onboarding failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
