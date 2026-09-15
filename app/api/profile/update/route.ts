import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { isValidUsernameFormat, isValidBio, escapeForIlike } from "@/lib/validation/username";
import { validateUniversityChoices } from "@/lib/validation/university-eligibility";
import { TRACKS, GKS_U_APPLICATION_ROUTES, GKS_U_EMBASSY_PATHS } from "@/lib/constants";
import { checkRateLimit } from "@/lib/rate-limit";
import { validApplicationYears } from "@/lib/deadline";

// track is deliberately NOT part of this body -- it's fixed at onboarding
// and this route always re-reads the stored value from the DB (see below),
// so there's no field here for a client to even attempt to send it through.
interface UpdateProfileBody {
  gksUApplicationRoute?: string | null;
  gksUEmbassyPath?: string | null;
  major: string;
  applicationYear: number;
  username: string;
  bio?: string | null;
  universityChoices: { universityId: string; eligibilityId?: string | null }[];
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rateLimit = checkRateLimit(`profile-update:${user.id}`, 20, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json()) as UpdateProfileBody;
  const {
    gksUApplicationRoute,
    gksUEmbassyPath,
    major,
    applicationYear,
    username,
    bio,
    universityChoices,
  } = body;

  const admin = getSupabaseAdmin();

  // Track can't be changed through this route, full stop -- always use
  // whatever is already on file, regardless of what a client sends (or
  // doesn't send). This isn't just "ignore the field if present"; there is
  // no client-suppliable value that reaches complete_onboarding at all.
  //
  // A missing/invalid track here means this account hasn't finished
  // onboarding yet (track and onboarding_completed_at are only ever set
  // together, atomically, by complete_onboarding's RPC -- there's no path
  // where an already-onboarded profile loses its track). This route isn't
  // reachable from the UI pre-onboarding (the profile page that hosts this
  // form requires a username, which doesn't exist until onboarding
  // completes) -- so a request landing here with no track is someone
  // calling the wrong endpoint directly for their account's current state,
  // not a server-side failure. 400, not 500.
  const { data: currentProfile } = await admin.from("profiles").select("track").eq("id", user.id).maybeSingle();
  const track = currentProfile?.track as (typeof TRACKS)[number] | undefined;
  if (!track || !TRACKS.includes(track)) {
    return NextResponse.json({ error: "onboarding_incomplete" }, { status: 400 });
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
  if (!Number.isInteger(applicationYear) || !validApplicationYears(track).includes(applicationYear)) {
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

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .neq("id", user.id)
    .ilike("username", escapeForIlike(username))
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

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

  // Fetch current contacts so this update doesn't wipe the contact vault --
  // complete_onboarding replaces contact_methods wholesale, and this route
  // only edits profile/major/universities, not the contact vault (that's
  // the Contact vault tab's job -- see app/profile/[username]/page.tsx).
  const { data: currentContacts } = await admin
    .from("contact_methods")
    .select("type, value")
    .eq("user_id", user.id);

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
    p_contacts: currentContacts ?? [],
  });

  if (error) {
    console.error("profile update failed:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
