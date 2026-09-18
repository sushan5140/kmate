"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import { GKS_U_2027_SOURCE } from "@/lib/gks/guidelines-2027";

type RouteMode = "embassy" | "university";

interface FormGuide {
  no: number;
  name: string;
  firstRoundEmbassy: string;
  firstRoundUniversity: string;
  afterFirstRound: string;
  checks: string[];
  note?: string;
}

const FORMS: FormGuide[] = [
  {
    no: 1,
    name: "Application Form",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Submit the printed form with original handwritten signatures where required.",
    checks: [
      "Use English for the Application Form.",
      "Make your English name match your passport exactly.",
      "Use the official university and department name from the University Information file.",
      "Check every required field and signature before submission.",
    ],
  },
  {
    no: 2,
    name: "Personal Statement",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Submit the printed/original form as instructed after passing Round 1.",
    checks: [
      "May be written in English or Korean.",
      "Answer the official form prompts rather than adding invented sections.",
      "Check that names, study field, and major details are consistent with the rest of the application.",
      "Check all required fields before submission.",
    ],
  },
  {
    no: 3,
    name: "Study Plan",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Submit the printed/original form as instructed after passing Round 1.",
    checks: [
      "May be written in English or Korean.",
      "Follow the official form prompts and space limits.",
      "Keep the intended major/department consistent with the Application Form.",
      "Check all required fields before submission.",
    ],
  },
  {
    no: 4,
    name: "Recommendation Letter",
    firstRoundEmbassy: "Upload a scanned copy prepared by the recommender.",
    firstRoundUniversity: "The recommender completes it according to the university's submission method.",
    afterFirstRound: "Submit the original recommendation letter for the NIIED second round.",
    checks: [
      "One recommendation letter is required.",
      "Use a credible recommender who can evaluate your academic ability.",
      "The letter must have been issued within one year of the application deadline.",
      "Do not replace the original post-Round-1 requirement with a community workaround.",
    ],
    note: "The recommendation is handled differently from Forms 1–3 and 5–7: it is prepared by the recommender.",
  },
  {
    no: 5,
    name: "GKS Applicant Agreement",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Print and provide original handwritten signature(s) where required.",
    checks: [
      "Read every declaration before agreeing.",
      "Check that the applicant name matches the rest of the application.",
      "Do not apostille or consular-confirm this form.",
      "Make sure required signatures are present.",
    ],
  },
  {
    no: 6,
    name: "Personal Medical Assessment",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Print and provide original handwritten signature(s) where required.",
    checks: [
      "Complete the official assessment fields accurately.",
      "Do not substitute a different medical form unless the institution explicitly instructs you to.",
      "Do not apostille or consular-confirm this form.",
      "Check required signatures before submission.",
    ],
  },
  {
    no: 7,
    name: "Consent to Collect and Use Personal Information",
    firstRoundEmbassy: "Complete directly in the Study in Korea system.",
    firstRoundUniversity: "Complete according to the university's application method.",
    afterFirstRound: "Print and provide original handwritten signature(s) where required.",
    checks: [
      "Read the consent terms before signing.",
      "Use the same applicant identity details as the rest of the application.",
      "Do not apostille or consular-confirm this form.",
      "Check required signatures before submission.",
    ],
  },
];

const STORAGE_KEY = "kmate:gks-u-2027-form-progress";

export function GksU2027FormAssistant({
  defaultRoute,
}: {
  defaultRoute: "general" | "r_gks" | null;
}) {
  const [route, setRoute] = useState<RouteMode>(defaultRoute ? "embassy" : "embassy");
  const [activeForm, setActiveForm] = useState(1);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const storageLoaded = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setDone(JSON.parse(saved) as Record<number, boolean>);
      } catch {
        // Local progress is optional; the assistant works without storage.
      } finally {
        storageLoaded.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageLoaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
    } catch {
      // Ignore storage failures; no application data is uploaded here.
    }
  }, [done]);

  const form = FORMS.find((item) => item.no === activeForm) ?? FORMS[0];
  const completed = useMemo(() => Object.values(done).filter(Boolean).length, [done]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            Form-by-form assistant
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">
            Work through Forms 1–7 without guessing
          </h2>
          <p className="mt-1 max-w-3xl text-[12.75px] leading-relaxed text-muted">
            This guide explains what the 2027 guideline requires at each stage. It does not upload, rewrite, or certify your forms.
          </p>
        </div>

        <div className="flex rounded-full bg-canvas p-1">
          <button
            type="button"
            onClick={() => setRoute("embassy")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium",
              route === "embassy" ? "bg-white text-ink shadow-xs" : "text-muted"
            )}
          >
            Embassy Track
          </button>
          <button
            type="button"
            onClick={() => setRoute("university")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium",
              route === "university" ? "bg-white text-ink shadow-xs" : "text-muted"
            )}
          >
            University Track
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card className="h-fit p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Forms
            </p>
            <span className="text-[11.5px] font-medium text-primary">{completed}/7 checked</span>
          </div>

          <div className="space-y-1">
            {FORMS.map((item) => (
              <button
                key={item.no}
                type="button"
                onClick={() => setActiveForm(item.no)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left",
                  activeForm === item.no ? "bg-primary-soft text-ink" : "hover:bg-canvas"
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    done[item.no] ? "bg-success/15 text-success" : "bg-canvas text-muted"
                  )}
                >
                  {done[item.no] ? <Check className="h-3.5 w-3.5" /> : item.no}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{item.name}</span>
                  <span className="block text-[10.5px] text-muted">Form {item.no}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Form {form.no}
                </p>
                <h3 className="mt-0.5 text-[17px] font-semibold text-ink">{form.name}</h3>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDone((current) => ({ ...current, [form.no]: !current[form.no] }))}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium ring-1",
                done[form.no]
                  ? "bg-success/10 text-success ring-success/20"
                  : "bg-white text-ink ring-hairline-strong"
              )}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {done[form.no] ? "Checked" : "Mark checked"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-canvas p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                First-round action
              </p>
              <p className="mt-1.5 text-[12.75px] leading-relaxed text-ink">
                {route === "embassy" ? form.firstRoundEmbassy : form.firstRoundUniversity}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                If you pass Round 1
              </p>
              <p className="mt-1.5 text-[12.75px] leading-relaxed text-ink">
                {form.afterFirstRound}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="text-[12px] font-semibold text-ink">Official checks before you move on</p>
            <div className="mt-2 divide-y divide-hairline rounded-xl border border-hairline">
              {form.checks.map((check) => (
                <div key={check} className="flex items-start gap-2 px-3 py-2.5">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="text-[12.5px] leading-relaxed text-ink">{check}</p>
                </div>
              ))}
            </div>
          </div>

          {form.note && (
            <p className="mt-4 rounded-xl bg-gold/10 px-3 py-2.5 text-[12px] leading-relaxed text-ink">
              {form.note}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            <GuidelineRuleActions
              id={"form-guide-" + form.no}
              title={"Form " + form.no + " — " + form.name}
              text={
                (route === "embassy" ? form.firstRoundEmbassy : form.firstRoundUniversity) +
                " After Round 1: " +
                form.afterFirstRound +
                " Checks: " +
                form.checks.join(" ")
              }
              page={form.no <= 7 ? "pp.12–14" : null}
              sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
              askQuestion={
                "What does the 2027 GKS-U guideline require for Form " +
                form.no +
                " (" +
                form.name +
                ") for " +
                (route === "embassy" ? "Embassy Track" : "University Track") +
                "? Use only the official guideline."
              }
            />
            <Link
              href="/official-guidelines"
              className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[12px] font-medium text-ink ring-1 ring-hairline-strong"
            >
              Open official guideline
            </Link>
          </div>
        </Card>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Progress is stored only in this browser using local storage. No form file or checklist state is uploaded.
      </p>
    </section>
  );
}
