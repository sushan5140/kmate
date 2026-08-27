"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrackBadge } from "@/components/ui/track-badge";
import { MajorStep } from "@/components/onboarding/major-step";
import { UniversityPicker, type SelectedUniversity } from "@/components/onboarding/university-picker";
import { UsernameField } from "@/components/onboarding/username-field";
import { BioStep } from "@/components/onboarding/bio-step";
import { validApplicationYears } from "@/lib/deadline";
import { TRACK_LABELS, type GksUEmbassyPath, type Track } from "@/lib/constants";

export interface ProfileEditInitialData {
  track: Track;
  gksUEmbassyPath: GksUEmbassyPath | null;
  major: string;
  applicationYear: number;
  username: string;
  bio: string;
  universities: SelectedUniversity[];
}

const OTHER_TRACK: Record<Track, Track> = { gks_u: "gks_g", gks_g: "gks_u" };

// Track is intentionally not part of this form's editable state -- it's
// fixed at onboarding (see app/api/profile/update/route.ts, which ignores
// any track value a client might send and always re-reads the stored one).
// dualTrackAccess (admin-granted, see /admin/users) only ever adds a
// *read-only preview* of the other track's embassy-path/university picker
// here -- never a second editable/savable set. Real universities picked
// under a track are submitted application data that every other part of the
// app (validateUniversityChoices, Discover matching, application-year rules)
// assumes matches profiles.track; letting dual-track-access silently save
// cross-track picks would corrupt that invariant for the sake of a
// convenience feature. So the preview state below is deliberately separate
// from (and never merged into) the real, submittable state -- switching the
// toggle away from "My track" swaps in an empty scratch picker with no Save
// path at all, and switching back restores the real form untouched.
export function ProfileEditForm({
  initial,
  dualTrackAccess = false,
}: {
  initial: ProfileEditInitialData;
  dualTrackAccess?: boolean;
}) {
  const router = useRouter();
  const [gksUEmbassyPath, setGksUEmbassyPath] = useState<GksUEmbassyPath | null>(initial.gksUEmbassyPath);
  const [major, setMajor] = useState(initial.major);
  const [universities, setUniversities] = useState<SelectedUniversity[]>(initial.universities);
  const [applicationYear, setApplicationYear] = useState(initial.applicationYear);
  const [username, setUsername] = useState(initial.username);
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [bio, setBio] = useState(initial.bio);

  const [viewTrack, setViewTrack] = useState<Track>(initial.track);
  const [previewEmbassyPath, setPreviewEmbassyPath] = useState<GksUEmbassyPath | null>(null);
  const [previewUniversities, setPreviewUniversities] = useState<SelectedUniversity[]>([]);
  const previewing = viewTrack !== initial.track;

  function setViewTrackAndResetPreview(track: Track) {
    setViewTrack(track);
    setPreviewEmbassyPath(null);
    setPreviewUniversities([]);
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gksUEmbassyPath,
          major,
          applicationYear,
          username,
          bio,
          universityChoices: universities.map((u) => ({
            universityId: u.universityId,
            eligibilityId: u.eligibilityId,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const usernameChanged = username !== initial.username;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Track</p>
        <div className="mt-2 flex items-center gap-2">
          <TrackBadge track={initial.track} />
          <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-[12px] text-muted">
            <Lock className="h-3 w-3" /> Set at sign-up, can&apos;t be changed
          </span>
        </div>

        {dualTrackAccess && (
          <div className="mt-3 flex items-center gap-1.5">
            {([initial.track, OTHER_TRACK[initial.track]] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setViewTrackAndResetPreview(t)}
                className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                  viewTrack === t
                    ? t === "gks_g"
                      ? "border-gks-g bg-gks-g/10 text-gks-g"
                      : "border-gks-u bg-gks-u/10 text-gks-u"
                    : "border-hairline-strong text-muted hover:text-ink"
                }`}
              >
                {t === initial.track ? `My track (${TRACK_LABELS[t]})` : `Preview ${TRACK_LABELS[t]}`}
              </button>
            ))}
          </div>
        )}

        {previewing && (
          <p className="mt-2 text-[12px] text-muted">
            Browsing {TRACK_LABELS[viewTrack]}&apos;s embassy path and eligible universities for reference --
            nothing here is saved. Switch back to &quot;My track&quot; to edit your real picks.
          </p>
        )}

        {viewTrack === "gks_u" && (
          <div className="mt-2 flex flex-col gap-1.5">
            {(
              [
                { value: "general_overseas", label: "Embassy Track -- General / Overseas Korean" },
                { value: "r_gks", label: "Embassy Track -- Regional (R-GKS)" },
                { value: null, label: "Directly through a university (UIC / associate degree)" },
              ] as const
            ).map((option) => (
              <label key={option.label} className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="radio"
                  name="embassy-path-edit"
                  checked={(previewing ? previewEmbassyPath : gksUEmbassyPath) === option.value}
                  onChange={() => (previewing ? setPreviewEmbassyPath(option.value) : setGksUEmbassyPath(option.value))}
                />
                {option.label}
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Major</p>
        <div className="mt-2">
          <MajorStep value={major} onChange={setMajor} />
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
          Universities {previewing && `(previewing ${TRACK_LABELS[viewTrack]} -- not saved)`}
        </p>
        <div className="mt-2">
          {previewing ? (
            <UniversityPicker
              track={viewTrack}
              gksUEmbassyPath={previewEmbassyPath}
              selected={previewUniversities}
              onChange={setPreviewUniversities}
            />
          ) : (
            <UniversityPicker
              track={initial.track}
              gksUEmbassyPath={gksUEmbassyPath}
              selected={universities}
              onChange={setUniversities}
            />
          )}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Application year</p>
        <div className="mt-2 flex gap-2">
          {validApplicationYears(initial.track).map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setApplicationYear(year)}
              className={`rounded-lg border px-4 py-2 text-[14px] ${
                applicationYear === year ? "border-primary bg-primary/5 text-primary" : "border-border bg-white text-ink"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Username</p>
        <div className="mt-2">
          <UsernameField value={username} onChange={setUsername} onAvailabilityChange={setUsernameAvailable} />
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Bio</p>
        <div className="mt-2">
          <BioStep value={bio} onChange={setBio} />
        </div>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      {saved && <p className="text-[13px] text-success">Saved.</p>}
      {previewing && (
        <p className="text-[12.5px] text-muted">Switch back to &quot;My track&quot; above to save changes.</p>
      )}

      <div>
        <Button onClick={save} disabled={saving || previewing || (usernameChanged && !usernameAvailable)}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
