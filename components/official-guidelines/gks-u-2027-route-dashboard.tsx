"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Compass,
  School,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import {
  GKS_U_2027_SOURCE,
  GKS_U_2027_TYPE_A,
  GKS_U_2027_TYPE_B,
} from "@/lib/gks/guidelines-2027";

type RouteType = "general" | "r_gks" | null;

const TYPE_A = new Set<string>(GKS_U_2027_TYPE_A);
const TYPE_B = new Set<string>(GKS_U_2027_TYPE_B);
const ALL = [...GKS_U_2027_TYPE_A, ...GKS_U_2027_TYPE_B];

function normalizeUniversity(name: string): string | null {
  if (TYPE_A.has(name) || TYPE_B.has(name)) return name;
  const lower = name.toLowerCase();
  const match = ALL.find((candidate) => {
    const c = candidate.toLowerCase();
    return c === lower || c.includes(lower) || lower.includes(c);
  });
  return match ?? null;
}

function getEmbassyStage() {
  const now = Date.now();
  const open = Date.UTC(2026, 8, 15, 2, 0, 0); // Sep 15, 11:00 KST
  const close = Date.UTC(2026, 8, 30, 9, 0, 0); // Sep 30, 18:00 KST
  const firstRound = Date.UTC(2026, 9, 16, 14, 59, 59);
  const thirdRound = Date.UTC(2026, 11, 23, 9, 0, 0);
  const final = Date.UTC(2027, 0, 7, 14, 59, 59);

  if (now < open) {
    return {
      label: "Preparing application",
      next: "Finish forms, verify university choices, and be ready for the Embassy portal opening.",
    };
  }
  if (now <= close) {
    return {
      label: "Embassy application open",
      next: "Complete the Study in Korea submission before Sep 30, 18:00 KST.",
    };
  }
  if (now <= firstRound) {
    return {
      label: "Waiting for Embassy Round 1",
      next: "Prepare post-Round-1 originals/authentication and monitor the Embassy result.",
    };
  }
  if (now <= thirdRound) {
    return {
      label: "Post-Embassy Round 1",
      next: "Follow your result route: successful candidates continue to NIIED; unsuccessful candidates may still use an open University Track deadline.",
    };
  }
  if (now <= final) {
    return {
      label: "Final selection period",
      next: "Monitor Study in Korea and your selected university for the remaining result announcements.",
    };
  }
  return {
    label: "2027 cycle completed",
    next: "Use the archived 2027 material only for reference and check the current cycle before applying.",
  };
}

export function GksU2027RouteDashboard({
  defaultPath,
  savedUniversities,
  unresolvedUniversities,
  defaultMajor,
}: {
  defaultPath: RouteType;
  savedUniversities: string[];
  unresolvedUniversities: string[];
  defaultMajor: string;
}) {
  const stage =
    defaultPath === null
      ? {
          label: "Choose your application route",
          next: "Compare Embassy Track and University Track below, then save your intended route in KMate before relying on route-specific checks.",
        }
      : getEmbassyStage();

  const normalized = useMemo(
    () =>
      savedUniversities.map((name) => ({
        original: name,
        matched: normalizeUniversity(name),
      })),
    [savedUniversities]
  );

  const warnings = useMemo(() => {
    const items: Array<{ id: string; title: string; text: string; page: string }> = [];
    const matched = normalized.map((item) => item.matched).filter((x): x is string => Boolean(x));

    if (defaultPath === "general") {
      if (matched.length > 3) {
        items.push({
          id: "too-many-general",
          title: "Too many Embassy General choices",
          text: "Embassy Track General permits up to three university choices.",
          page: "p.6",
        });
      }
      if (matched.length > 0 && !matched.some((name) => TYPE_B.has(name))) {
        items.push({
          id: "general-no-type-b",
          title: "No Type B university in your saved General choices",
          text: "Embassy Track General requires at least one Type B university among the selected choices.",
          page: "p.6",
        });
      }
    }

    if (defaultPath === "r_gks") {
      if (matched.length > 2) {
        items.push({
          id: "too-many-rgks",
          title: "Too many R-GKS choices",
          text: "R-GKS permits up to two university choices.",
          page: "p.6",
        });
      }
      const typeA = matched.filter((name) => TYPE_A.has(name));
      if (typeA.length > 0) {
        items.push({
          id: "rgks-type-a",
          title: "Type A university found in R-GKS choices",
          text: `R-GKS choices must be Type B. Review: ${typeA.join(", ")}.`,
          page: "p.6",
        });
      }
    }

    const notMatched = normalized.filter((item) => !item.matched).map((item) => item.original);
    const unknown = [...new Set([...notMatched, ...unresolvedUniversities])];
    if (unknown.length > 0) {
      items.push({
        id: "unmatched-university",
        title: "Saved university name needs verification",
        text: `KMate could not match ${unknown.join(", ")} to the current 2027 Embassy Track Type A/B list. Verify the exact official university name before submission.`,
        page: "p.18",
      });
    }

    if (new Set(matched).size !== matched.length) {
      items.push({
        id: "duplicate-choice",
        title: "Duplicate university choice detected",
        text: "The same university appears more than once in the saved choices. Each choice should be a distinct university.",
        page: "p.6",
      });
    }

    return items;
  }, [defaultPath, normalized, unresolvedUniversities]);

  const routeLabel =
    defaultPath === "r_gks"
      ? "Embassy Track — R-GKS"
      : defaultPath === "general"
        ? "Embassy Track — General"
        : "Route not saved yet";

  const choiceRule =
    defaultPath === "r_gks"
      ? "Up to 2 universities · all Type B"
      : defaultPath === "general"
        ? "Up to 3 universities · at least 1 Type B"
        : "Choose your route in the Smart 2027 workspace";

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            My GKS route
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">
            Your 2027 application at a glance
          </h2>
        </div>
        <Link
          href="/gks/saved"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-medium text-ink ring-1 ring-hairline-strong hover:bg-canvas"
        >
          <Bookmark className="h-3.5 w-3.5" />
          Saved GKS Rules
        </Link>
      </div>

      <Card className="mt-4 border-primary/20 bg-primary-soft/20">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white/80 p-3">
            <div className="flex items-center gap-1.5 text-muted">
              <Compass className="h-3.5 w-3.5" />
              <p className="text-[10.5px] font-semibold uppercase tracking-wide">Track</p>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">{routeLabel}</p>
          </div>

          <div className="rounded-xl bg-white/80 p-3">
            <div className="flex items-center gap-1.5 text-muted">
              <School className="h-3.5 w-3.5" />
              <p className="text-[10.5px] font-semibold uppercase tracking-wide">Choice rule</p>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">{choiceRule}</p>
          </div>

          <div className="rounded-xl bg-white/80 p-3">
            <div className="flex items-center gap-1.5 text-muted">
              <CalendarClock className="h-3.5 w-3.5" />
              <p className="text-[10.5px] font-semibold uppercase tracking-wide">Current stage</p>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">{stage.label}</p>
          </div>

          <div className="rounded-xl bg-white/80 p-3">
            <div className="flex items-center gap-1.5 text-muted">
              <ShieldCheck className="h-3.5 w-3.5" />
              <p className="text-[10.5px] font-semibold uppercase tracking-wide">Embassy deadline</p>
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">
              {defaultPath ? "Sep 30 · 18:00 KST" : "Depends on selected route"}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-white/75 px-3.5 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Next action</p>
          <p className="mt-1 text-[12.75px] leading-relaxed text-ink">{stage.next}</p>
        </div>

        {(savedUniversities.length > 0 || defaultMajor) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {defaultMajor && (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-hairline">
                Major: {defaultMajor}
              </span>
            )}
            {savedUniversities.map((name, index) => (
              <span
                key={name + index}
                className="rounded-full bg-white px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-hairline"
              >
                {index + 1}. {name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4">
          <GuidelineRuleActions
            id="route-summary-2027"
            title={routeLabel}
            text={choiceRule + ". Embassy Track applications are submitted through Study in Korea from Sep 15, 11:00 to Sep 30, 18:00 KST."}
            page="pp.6, 9"
            sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
            askQuestion={`Explain my 2027 GKS-U route: ${routeLabel}. My current saved university choices are ${savedUniversities.join(", ") || "none yet"}. Use only the official guideline and tell me the rules I must follow.`}
          />
        </div>
      </Card>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Contradiction warnings
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              Checks only the profile data KMate actually has; it does not invent missing application details.
            </p>
          </div>
          {warnings.length === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11.5px] font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              No saved-choice conflict found
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 grid gap-2.5">
            {warnings.map((warning) => (
              <Card key={warning.id} className="border-gold/20 bg-gold/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink">{warning.title}</p>
                      <span className="text-[10.5px] font-medium text-muted">{warning.page}</span>
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{warning.text}</p>
                    <div className="mt-3">
                      <GuidelineRuleActions
                        id={"warning-" + warning.id}
                        title={warning.title}
                        text={warning.text}
                        page={warning.page}
                        sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
                        compact
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <Link
          href="/application-readiness"
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          Continue to Application Readiness <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
