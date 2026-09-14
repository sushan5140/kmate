"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Calculator,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  ListChecks,
  Route,
  School,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import {
  GKS_U_2027_TYPE_A,
  GKS_U_2027_TYPE_B,
  GKS_U_2027_UIC_BACHELOR_DEPARTMENTS,
  GKS_U_2027_SOURCE,
} from "@/lib/gks/guidelines-2027";
import { GKS_U_2027_POLICY } from "@/lib/gks/gks-u-2027-policy";

type ToolTab = "rules" | "documents" | "validator" | "score" | "fallback";
type RouteType = "general" | "r_gks" | "university";
type GraduationStatus = "graduated" | "expected";

const TABS: { key: ToolTab; label: string; icon: typeof ListChecks }[] = [
  { key: "rules", label: "My rules", icon: ShieldCheck },
  { key: "documents", label: "Documents", icon: FileCheck2 },
  { key: "validator", label: "University validator", icon: School },
  { key: "score", label: "Score advantages", icon: Calculator },
  { key: "fallback", label: "Fallback planner", icon: Route },
];

const TYPE_A = new Set<string>(GKS_U_2027_TYPE_A);
const TYPE_B = new Set<string>(GKS_U_2027_TYPE_B);
const UIC = Object.keys(GKS_U_2027_UIC_BACHELOR_DEPARTMENTS);

const ALL_EMBASSY = [...GKS_U_2027_TYPE_A, ...GKS_U_2027_TYPE_B].sort((a, b) =>
  a.localeCompare(b)
);

const ROUTE_LABELS: Record<RouteType, string> = {
  general: "Embassy Track — General",
  r_gks: "Embassy Track — R-GKS",
  university: "University Track — UIC Bachelor's",
};

const FIRST_ROUND_DOCS = [
  ["Application Form", "Complete online", "Required"],
  ["Personal Statement", "Complete online", "Required"],
  ["Study Plan", "Complete online", "Required"],
  ["Recommendation Letter", "Upload scanned copy", "Required"],
  ["Applicant Agreement / Medical / Consent forms", "Complete online", "Required"],
  ["Citizenship + family relationship proof", "Upload scanned copy", "Required"],
  ["High-school graduation certificate", "Upload scanned copy", "Required"],
  ["High-school transcript", "Upload scanned copy", "Required"],
  ["TOPIK / TOEFL / IELTS score", "Upload if applicable", "Conditional"],
  ["Awards / achievement certificates", "Up to 5 scanned documents", "Optional"],
  ["Passport copy", "Supplementary if citizenship proof is unclear", "Optional"],
] as const;

const SECOND_ROUND_DOCS = [
  ["Printed application forms", "Original handwritten signatures", "Original"],
  ["Recommendation Letter", "Original letter", "Original"],
  ["Citizenship + family relationship proof", "Apostille / consular confirmation", "Authenticated"],
  ["Graduation certificate", "Apostille / consular confirmation", "Authenticated"],
  ["Academic transcript", "Apostille / consular confirmation", "Authenticated"],
  ["TOPIK score", "Printed original score report if submitted", "Conditional"],
  ["English test score", "Copy / printout if submitted", "Conditional"],
  ["Awards / achievement certificates", "Copies; no apostille required", "Optional"],
] as const;

function badgeClass(kind: string) {
  if (kind === "Required" || kind === "Original" || kind === "Authenticated") {
    return "bg-primary/10 text-primary";
  }
  if (kind === "Conditional") return "bg-gold/10 text-gold";
  return "bg-ink/[0.05] text-muted";
}

function universityType(name: string) {
  if (TYPE_A.has(name)) return "Type A";
  if (TYPE_B.has(name)) return "Type B";
  if (UIC.includes(name)) return "UIC";
  return "Not matched";
}

function normalizeSavedChoice(name: string): string | null {
  if (TYPE_A.has(name) || TYPE_B.has(name) || UIC.includes(name)) return name;

  const lower = name.toLowerCase();
  const candidates = [...ALL_EMBASSY, ...UIC];
  const exactish = candidates.find((candidate) => {
    const c = candidate.toLowerCase();
    return c.includes(lower) || lower.includes(c);
  });
  return exactish ?? null;
}

export function GksU2027SmartTools({
  defaultPath,
  savedUniversities,
  defaultMajor,
  mode = "all",
}: {
  defaultPath: "general" | "r_gks" | null;
  savedUniversities: string[];
  defaultMajor: string;
  mode?: "all" | "readiness" | "requirements";
}) {
  const initialTab: ToolTab =
    mode === "readiness" ? "documents" : mode === "requirements" ? "validator" : "rules";
  const [tab, setTab] = useState<ToolTab>(initialTab);
  const visibleTabs =
    mode === "readiness"
      ? TABS.filter((item) => item.key === "documents" || item.key === "fallback")
      : mode === "requirements"
        ? TABS.filter((item) => item.key === "validator" || item.key === "score")
        : TABS;
  const [route, setRoute] = useState<RouteType>(defaultPath ?? "general");
  const [graduation, setGraduation] = useState<GraduationStatus>("graduated");
  const [documentStage, setDocumentStage] = useState<"first" | "second">("first");
  const initialChoices = savedUniversities
    .map(normalizeSavedChoice)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
  const [choices, setChoices] = useState<string[]>([
    initialChoices[0] ?? "",
    initialChoices[1] ?? "",
    initialChoices[2] ?? "",
  ]);
  const [department, setDepartment] = useState("");
  const [topik, setTopik] = useState("0");
  const [ielts, setIelts] = useState("");
  const [stem, setStem] = useState(
    Boolean(defaultMajor && /(computer|software|ai|engineering|science|data|tech)/i.test(defaultMajor))
  );

  const routePool =
    route === "r_gks" ? [...GKS_U_2027_TYPE_B] : route === "university" ? UIC : ALL_EMBASSY;
  const slotCount =
    route === "general"
      ? GKS_U_2027_POLICY.choiceRules.general.maxUniversities
      : route === "r_gks"
        ? GKS_U_2027_POLICY.choiceRules.r_gks.maxUniversities
        : GKS_U_2027_POLICY.choiceRules.university.maxUniversities;
  const selected = choices.slice(0, slotCount).filter(Boolean);

  const validation = useMemo(() => {
    if (selected.length === 0) {
      return { state: "neutral" as const, message: "Choose at least one university to validate the combination." };
    }

    if (new Set(selected).size !== selected.length) {
      return { state: "error" as const, message: "The same university cannot be selected twice." };
    }

    if (route === "general") {
      if (!selected.some((name) => TYPE_B.has(name))) {
        return { state: "error" as const, message: "Add at least one Type B university." };
      }
      return {
        state: "ok" as const,
        message: "Valid General Embassy Track combination: up to three choices with at least one Type B.",
      };
    }

    if (route === "r_gks") {
      if (selected.some((name) => !TYPE_B.has(name))) {
        return { state: "error" as const, message: "R-GKS choices must all be Type B." };
      }
      return { state: "ok" as const, message: "Valid R-GKS university combination." };
    }

    const university = selected[0];
    if (!UIC.includes(university)) {
      return { state: "error" as const, message: "Choose one university from the 2027 UIC bachelor's list." };
    }
    const departments = GKS_U_2027_UIC_BACHELOR_DEPARTMENTS[university] ?? [];
    if (!department || !departments.includes(department)) {
      return { state: "error" as const, message: "University Track requires one university and one valid department." };
    }
    return { state: "ok" as const, message: "Valid 2027 UIC bachelor's university + department pair." };
  }, [department, route, selected]);

  const topikLevel = Number(topik);
  const topikBand = GKS_U_2027_POLICY.evaluation.topikBand(topikLevel);
  const topikBonus = GKS_U_2027_POLICY.evaluation.topikBonus(topikLevel);

  const ieltsNumber = Number.parseFloat(ielts);
  const ieltsBand = GKS_U_2027_POLICY.evaluation.ieltsBand(
    Number.isFinite(ieltsNumber) ? ieltsNumber : null
  );

  const tabRule = {
    rules: {
      title: "My 2027 GKS route rules",
      text:
        route === "general"
          ? GKS_U_2027_POLICY.choiceRules.general.display + "."
          : route === "r_gks"
            ? GKS_U_2027_POLICY.choiceRules.r_gks.display + "."
            : GKS_U_2027_POLICY.choiceRules.university.display + " only.",
      page: "p.6",
    },
    documents: {
      title: "2027 GKS document stages",
      text:
        "Embassy first-round required certificates are uploaded as scanned copies. First-round successful candidates later submit the required original/certified documents for NIIED's second round.",
      page: "pp.12–15",
    },
    validator: {
      title: "2027 university-choice rule",
      text:
        route === "general"
          ? GKS_U_2027_POLICY.choiceRules.general.display + "."
          : route === "r_gks"
            ? GKS_U_2027_POLICY.choiceRules.r_gks.display + "."
            : GKS_U_2027_POLICY.choiceRules.university.display + " only.",
      page: "p.6",
    },
    score: {
      title: "2027 evaluation advantages",
      text:
        "TOPIK level 3 or above receives quantitative additional points, and applicants to science and engineering departments receive additional points equal to " + GKS_U_2027_POLICY.evaluation.scienceEngineeringBonusPct + "% of total allocated points.",
      page: "pp.19–20",
    },
    fallback: {
      title: "Embassy to University Track fallback",
      text:
        GKS_U_2027_POLICY.fallback.afterEmbassyRound1Fail + " " + GKS_U_2027_POLICY.fallback.afterEmbassyRound1Pass,
      page: "pp.9–11",
    },
  }[tab];

  function updateChoice(index: number, value: string) {
    setChoices((current) => {
      const next = [...current];
      next[index] = value;
      if (index === 0 && route === "university") setDepartment("");
      return next;
    });
  }

  function switchRoute(next: RouteType) {
    setRoute(next);
    setDepartment("");
    setChoices(["", "", ""]);
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {mode === "readiness"
              ? "2027 application planning"
              : mode === "requirements"
                ? "2027 rule checks"
                : "Smart 2027 workspace"}
          </p>
          <h2 className="mt-1 text-[20px] font-semibold text-ink">
            {mode === "readiness"
              ? "Documents and fallback planning"
              : mode === "requirements"
                ? "Validate choices and official evaluation advantages"
                : "Turn the guideline into application actions"}
          </h2>
          <p className="mt-1 max-w-2xl text-[12.75px] leading-relaxed text-muted">
            These tools use the 2027 GKS-U rules. They do not estimate your chance of winning.
          </p>
        </div>
        <Link
          href="/gks?program=UG"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-medium text-white"
        >
          Ask official guideline AI <Sparkles className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto border-b border-hairline pb-3">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium",
                tab === item.key ? "bg-primary text-white" : "bg-canvas text-muted hover:text-ink"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-end">
        <GuidelineRuleActions
          id={"smart-tool-" + tab + "-" + route}
          title={tabRule.title}
          text={tabRule.text}
          page={tabRule.page}
          sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
          askQuestion={"Explain the 2027 GKS-U rule for " + tabRule.title + " using only the official guideline."}
          compact
        />
      </div>

      {tab === "rules" && (
        <div className="mt-4 grid gap-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Your route</p>
                <p className="mt-1 text-[15px] font-semibold text-ink">{ROUTE_LABELS[route]}</p>
                {defaultPath && (
                  <p className="mt-1 text-[12px] text-muted">
                    Prefilled from your KMate profile. You can change it here without changing your profile.
                  </p>
                )}
              </div>
              <select
                value={route}
                onChange={(e) => switchRoute(e.target.value as RouteType)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] text-ink"
              >
                <option value="general">Embassy — General</option>
                <option value="r_gks">Embassy — R-GKS</option>
                <option value="university">University — UIC Bachelor's</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">University rule</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">
                  {route === "general"
                    ? GKS_U_2027_POLICY.choiceRules.general.display + "."
                    : route === "r_gks"
                      ? GKS_U_2027_POLICY.choiceRules.r_gks.display + "."
                      : "Apply to " + GKS_U_2027_POLICY.choiceRules.university.display + " only."}
                </p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Application window</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">
                  {route === "university"
                    ? GKS_U_2027_POLICY.universityTrackWindow.display + ", according to each university's own schedule."
                    : GKS_U_2027_POLICY.embassyApplication.display + " through Study in Korea."}
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-hairline pt-4">
              <label className="text-[12px] font-semibold text-ink">Graduation status</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["graduated", "expected"] as GraduationStatus[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGraduation(value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-medium ring-1",
                      graduation === value
                        ? "bg-primary/10 text-primary ring-primary/25"
                        : "bg-white text-muted ring-hairline"
                    )}
                  >
                    {value === "graduated" ? "Already graduated" : "Expected graduate"}
                  </button>
                ))}
              </div>
              {graduation === "expected" && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-gold/10 px-3 py-2.5">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <p className="text-[12.5px] leading-relaxed text-ink">
                    If you pass the first round, the final graduation certificate and transcript must be submitted by December 31, 2026.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {(savedUniversities.length > 0 || defaultMajor) && (
            <Card>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">From your KMate profile</p>
              {defaultMajor && (
                <p className="mt-2 text-[13px] text-ink">
                  Major: <span className="font-medium">{defaultMajor}</span>
                </p>
              )}
              {savedUniversities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {savedUniversities.map((name, index) => (
                    <span key={name + index} className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-muted">
                      {index + 1}. {name}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="mt-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Stage-based checklist</p>
                <p className="mt-1 text-[13px] text-ink">
                  See what format is needed at the stage you are actually in.
                </p>
              </div>
              <div className="flex gap-1 rounded-full bg-canvas p-1">
                <button
                  type="button"
                  onClick={() => setDocumentStage("first")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium",
                    documentStage === "first" ? "bg-white text-ink shadow-xs" : "text-muted"
                  )}
                >
                  First round
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentStage("second")}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] font-medium",
                    documentStage === "second" ? "bg-white text-ink shadow-xs" : "text-muted"
                  )}
                >
                  After passing
                </button>
              </div>
            </div>

            {route === "university" && documentStage === "first" && (
              <div className="mt-4 rounded-xl bg-gold/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
                University Track first-round submission follows each university's own method and may include additional university-specific documents.
              </div>
            )}

            <div className="mt-4 divide-y divide-hairline">
              {(documentStage === "first" ? FIRST_ROUND_DOCS : SECOND_ROUND_DOCS).map(([name, action, kind]) => (
                <div key={name} className="grid gap-1 py-3 sm:grid-cols-[1fr_1.2fr_auto] sm:items-center sm:gap-3">
                  <p className="text-[12.75px] font-medium text-ink">{name}</p>
                  <p className="text-[12.5px] text-muted">{action}</p>
                  <span className={cn("w-fit rounded-full px-2 py-0.5 text-[10.5px] font-semibold", badgeClass(kind))}>
                    {kind}
                  </span>
                </div>
              ))}
            </div>

            {documentStage === "second" && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary-soft/45 px-3 py-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-[12.5px] leading-relaxed text-ink">
                  Application forms themselves do not need apostille/consular confirmation. The required certificates are the documents that generally need authentication.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "validator" && (
        <div className="mt-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">2027 choice validator</p>
                <p className="mt-1 text-[13px] text-ink">{ROUTE_LABELS[route]}</p>
              </div>
              <select
                value={route}
                onChange={(e) => switchRoute(e.target.value as RouteType)}
                className="rounded-xl border border-border bg-white px-3 py-2 text-[12.5px] text-ink"
              >
                <option value="general">Embassy — General</option>
                <option value="r_gks">Embassy — R-GKS</option>
                <option value="university">University — UIC Bachelor's</option>
              </select>
            </div>

            <div className="mt-4 grid gap-3">
              {Array.from({ length: slotCount }).map((_, index) => (
                <div key={index}>
                  <label className="text-[11.5px] font-medium text-muted">Choice {index + 1}</label>
                  <select
                    value={choices[index] ?? ""}
                    onChange={(e) => updateChoice(index, e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[12.5px] text-ink"
                  >
                    <option value="">Select university</option>
                    {routePool.map((name) => (
                      <option key={name} value={name}>
                        {name}{route === "university" ? "" : " — " + universityType(name)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {route === "university" && choices[0] && (
                <div>
                  <label className="text-[11.5px] font-medium text-muted">Department</label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[12.5px] text-ink"
                  >
                    <option value="">Select department</option>
                    {(GKS_U_2027_UIC_BACHELOR_DEPARTMENTS[choices[0]] ?? []).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div
              className={cn(
                "mt-4 flex items-start gap-2 rounded-xl px-3.5 py-3",
                validation.state === "ok"
                  ? "bg-success/10"
                  : validation.state === "error"
                    ? "bg-danger/10"
                    : "bg-canvas"
              )}
            >
              {validation.state === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : validation.state === "error" ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              ) : (
                <School className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              )}
              <p className="text-[12.75px] leading-relaxed text-ink">{validation.message}</p>
            </div>
          </Card>
        </div>
      )}

      {tab === "score" && (
        <div className="mt-4">
          <Card>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Official evaluation advantages</p>
            <p className="mt-1 text-[12.75px] leading-relaxed text-muted">
              This is not a winning-probability calculator. It only maps the quantitative language bands and additional points stated in the 2027 guideline.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="text-[11.5px] font-medium text-muted">TOPIK level</label>
                <select
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[12.5px] text-ink"
                >
                  <option value="0">No official score</option>
                  <option value="1">TOPIK 1</option>
                  <option value="2">TOPIK 2</option>
                  <option value="3">TOPIK 3</option>
                  <option value="4">TOPIK 4</option>
                  <option value="5">TOPIK 5</option>
                  <option value="6">TOPIK 6</option>
                </select>
              </div>
              <div>
                <label className="text-[11.5px] font-medium text-muted">IELTS</label>
                <input
                  value={ielts}
                  onChange={(e) => setIelts(e.target.value.replace(/[^0-9.]/g, "").slice(0, 3))}
                  placeholder="e.g. 7.5"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[12.5px] text-ink"
                />
              </div>
              <label className="flex items-center gap-2 self-end rounded-xl bg-canvas px-3 py-2.5 text-[12.5px] text-ink">
                <input type="checkbox" checked={stem} onChange={(e) => setStem(e.target.checked)} />
                Science / engineering department
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Korean language band</p>
                <p className="mt-1 text-[20px] font-semibold text-ink">{topikBand}%</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  of the institution's allocated Korean-language score.
                </p>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">English language band</p>
                <p className="mt-1 text-[20px] font-semibold text-ink">{ieltsBand}%</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                  of the institution's allocated English-language score based on IELTS.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11.5px] font-semibold text-ink">Quantitative additional points</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {topikBonus > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
                    TOPIK bonus: +{topikBonus}% of total score
                  </span>
                ) : (
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-muted">
                    TOPIK 3+ needed for TOPIK bonus
                  </span>
                )}
                {stem ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11.5px] font-medium text-primary">
                    Science/engineering: +{GKS_U_2027_POLICY.evaluation.scienceEngineeringBonusPct}%
                  </span>
                ) : (
                  <span className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] text-muted">
                    No science/engineering bonus selected
                  </span>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {tab === "fallback" && (
        <div className="mt-4">
          <Card>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Route className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Embassy → University fallback</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">
                  Plan the backup before first-round results, because University Track deadlines are set by each university.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {[
                ["1", "Embassy application", GKS_U_2027_POLICY.embassyApplication.display + " · online through Study in Korea"],
                ["2", "Embassy first-round result", "By " + new Date(GKS_U_2027_POLICY.timeline.embassyRound1ResultBy + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })],
                ["3A", "If you fail Round 1", GKS_U_2027_POLICY.fallback.afterEmbassyRound1Fail],
                ["3B", "If you pass / are a backup candidate", GKS_U_2027_POLICY.fallback.afterEmbassyRound1Pass],
                ["4", "Later Embassy rounds", GKS_U_2027_POLICY.timeline.niiedRound2 + " → university review by Dec 23 → final result expected Jan 7, 2027."],
              ].map(([step, title, body]) => (
                <div key={step} className="flex gap-3 rounded-xl bg-canvas p-3">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-[10.5px] font-bold text-primary ring-1 ring-hairline">
                    {step}
                  </span>
                  <div>
                    <p className="text-[12.75px] font-semibold text-ink">{title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/requirement-checker"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12px] font-medium text-white"
              >
                Check university requirements <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/application-readiness"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-medium text-ink ring-1 ring-hairline-strong"
              >
                Open application readiness <BadgeCheck className="h-3.5 w-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
