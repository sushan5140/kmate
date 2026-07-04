"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TrackBadge } from "@/components/ui/track-badge";
import { TrackQuizModal } from "@/components/onboarding/track-quiz-modal";
import { MajorStep } from "@/components/onboarding/major-step";
import { UniversityPicker, type SelectedUniversity } from "@/components/onboarding/university-picker";
import { UsernameField } from "@/components/onboarding/username-field";
import { BioStep } from "@/components/onboarding/bio-step";
import { ContactsStep, type ContactValue } from "@/components/onboarding/contacts-step";
import { validateUniversityChoices } from "@/lib/validation/university-eligibility";
import { isValidUsernameFormat } from "@/lib/validation/username";
import { applicationYearOptions, type GksUEmbassyPath, type Track } from "@/lib/constants";

const STEPS = ["track", "major", "universities", "year", "username", "bio", "contacts"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingWizard() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [track, setTrack] = useState<Track | null>(null);
  const [gksUEmbassyPath, setGksUEmbassyPath] = useState<GksUEmbassyPath | null>(null);
  const [recommendation, setRecommendation] = useState<Track | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);

  const [major, setMajor] = useState("");
  const [universities, setUniversities] = useState<SelectedUniversity[]>([]);
  const [applicationYear, setApplicationYear] = useState<number>(applicationYearOptions()[0]);
  const [username, setUsername] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState(false);
  const [bio, setBio] = useState("");
  const [contacts, setContacts] = useState<ContactValue[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function canAdvance(): boolean {
    switch (step) {
      case "track":
        return track !== null;
      case "major":
        return major.trim().length > 0;
      case "universities":
        return validateUniversityChoices(
          track!,
          gksUEmbassyPath,
          universities.map((u) => ({ category: u.category ?? "", embassyType: u.embassyType }))
        ).valid;
      case "year":
        return Boolean(applicationYear);
      case "username":
        return isValidUsernameFormat(username) && usernameAvailable;
      case "bio":
      case "contacts":
        return true;
      default:
        return false;
    }
  }

  function next() {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
  }
  function back() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
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
          contacts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      router.push("/home");
      router.refresh();
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
        Step {stepIndex + 1} of {STEPS.length}
      </p>

      {step === "track" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">
            Are you applying to GKS-Undergraduate or GKS-Graduate?
          </h2>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setTrack("gks_u")}
              className={`flex-1 rounded-xl border p-4 text-left ${
                track === "gks_u" ? "border-primary bg-primary/5" : "border-border bg-white"
              }`}
            >
              <TrackBadge track="gks_u" />
              <p className="mt-2 text-[13px] text-muted">Undergraduate (Bachelor&apos;s)</p>
            </button>
            <button
              type="button"
              onClick={() => setTrack("gks_g")}
              className={`flex-1 rounded-xl border p-4 text-left ${
                track === "gks_g" ? "border-primary bg-primary/5" : "border-border bg-white"
              }`}
            >
              <TrackBadge track="gks_g" />
              <p className="mt-2 text-[13px] text-muted">Graduate (Master&apos;s/PhD)</p>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setQuizOpen(true)}
            className="mt-3 text-[13px] font-medium text-primary hover:underline"
          >
            Not sure? Help me decide
          </button>

          {recommendation && (
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[13px] text-ink">
              Based on your answers, <strong>{recommendation === "gks_u" ? "GKS-U" : "GKS-G"}</strong>{" "}
              looks like the right fit -- you can change this anytime in Settings.
            </p>
          )}

          {track === "gks_u" && (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-ink">How are you applying?</p>
              <div className="mt-2 flex flex-col gap-2">
                {(
                  [
                    { value: "general_overseas", label: "Embassy Track -- General / Overseas Korean" },
                    { value: "r_gks", label: "Embassy Track -- Regional (R-GKS)" },
                    { value: null, label: "Directly through a university (UIC / associate degree)" },
                  ] as const
                ).map((option) => (
                  <label key={option.label} className="flex items-center gap-2 text-[13.5px] text-ink">
                    <input
                      type="radio"
                      name="embassy-path"
                      checked={gksUEmbassyPath === option.value}
                      onChange={() => setGksUEmbassyPath(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {quizOpen && (
            <TrackQuizModal
              onClose={() => setQuizOpen(false)}
              onRecommend={(rec) => {
                setRecommendation(rec);
                setTrack(rec);
                setQuizOpen(false);
              }}
            />
          )}
        </div>
      )}

      {step === "major" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">What&apos;s your intended major?</h2>
          <div className="mt-4">
            <MajorStep value={major} onChange={setMajor} />
          </div>
        </div>
      )}

      {step === "universities" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">Which universities are you targeting?</h2>
          <div className="mt-4">
            <UniversityPicker
              track={track!}
              gksUEmbassyPath={gksUEmbassyPath}
              selected={universities}
              onChange={setUniversities}
            />
          </div>
        </div>
      )}

      {step === "year" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">What application year?</h2>
          <div className="mt-4 flex gap-2">
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
      )}

      {step === "username" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">Pick a username</h2>
          <div className="mt-4">
            <UsernameField value={username} onChange={setUsername} onAvailabilityChange={setUsernameAvailable} />
          </div>
        </div>
      )}

      {step === "bio" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">Add a short bio</h2>
          <div className="mt-4">
            <BioStep value={bio} onChange={setBio} />
          </div>
        </div>
      )}

      {step === "contacts" && (
        <div className="mt-3">
          <h2 className="text-[18px] font-semibold text-ink">Add contact methods (optional)</h2>
          <div className="mt-4">
            <ContactsStep contacts={contacts} onChange={setContacts} />
          </div>
        </div>
      )}

      {submitError && <p className="mt-4 text-[13px] text-red-600">{submitError}</p>}

      <div className="mt-6 flex items-center justify-between">
        <div>
          {stepIndex > 0 && (
            <Button variant="ghost" size="sm" onClick={back} disabled={submitting}>
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/guidelines"
            target="_blank"
            rel="noreferrer"
            className="text-[12.5px] text-muted hover:text-ink"
          >
            Community guidelines
          </a>
          {step === "contacts" ? (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Finishing…" : "Finish"}
            </Button>
          ) : (
            <Button onClick={next} disabled={!canAdvance()}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
