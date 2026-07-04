"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TrackBadge } from "@/components/ui/track-badge";
import { MajorStep } from "@/components/onboarding/major-step";
import { UniversityPicker, type SelectedUniversity } from "@/components/onboarding/university-picker";
import { UsernameField } from "@/components/onboarding/username-field";
import { BioStep } from "@/components/onboarding/bio-step";
import { applicationYearOptions, type GksUEmbassyPath, type Track } from "@/lib/constants";

export interface EditProfileInitialData {
  track: Track;
  gksUEmbassyPath: GksUEmbassyPath | null;
  major: string;
  applicationYear: number;
  username: string;
  bio: string;
  universities: SelectedUniversity[];
}

export function EditProfileForm({ initial }: { initial: EditProfileInitialData }) {
  const router = useRouter();
  const [track, setTrack] = useState<Track>(initial.track);
  const [gksUEmbassyPath, setGksUEmbassyPath] = useState<GksUEmbassyPath | null>(initial.gksUEmbassyPath);
  const [major, setMajor] = useState(initial.major);
  const [universities, setUniversities] = useState<SelectedUniversity[]>(initial.universities);
  const [applicationYear, setApplicationYear] = useState(initial.applicationYear);
  const [username, setUsername] = useState(initial.username);
  const [usernameAvailable, setUsernameAvailable] = useState(true);
  const [bio, setBio] = useState(initial.bio);

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
          track,
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
        <div className="mt-2 flex items-center gap-3">
          <TrackBadge track={track} />
          <select
            value={track}
            onChange={(e) => setTrack(e.target.value as Track)}
            className="h-9 rounded-lg border border-border bg-white px-2 text-[13px] text-ink"
          >
            <option value="gks_u">GKS-U</option>
            <option value="gks_g">GKS-G</option>
          </select>
        </div>
        {track === "gks_u" && (
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
                  checked={gksUEmbassyPath === option.value}
                  onChange={() => setGksUEmbassyPath(option.value)}
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
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Universities</p>
        <div className="mt-2">
          <UniversityPicker
            track={track}
            gksUEmbassyPath={gksUEmbassyPath}
            selected={universities}
            onChange={setUniversities}
          />
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">Application year</p>
        <div className="mt-2 flex gap-2">
          {applicationYearOptions().map((year) => (
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
          <UsernameField
            value={username}
            onChange={setUsername}
            onAvailabilityChange={setUsernameAvailable}
          />
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

      <div>
        <Button
          onClick={save}
          disabled={saving || (usernameChanged && !usernameAvailable)}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
