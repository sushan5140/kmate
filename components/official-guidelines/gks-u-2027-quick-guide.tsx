import Link from "next/link";
import {
  ArrowRightLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  FileCheck2,
  GraduationCap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { GuidelineRuleActions } from "@/components/official-guidelines/guideline-rule-actions";
import { GKS_U_2027_SOURCE } from "@/lib/gks/guidelines-2027";

const QUICK_FACTS = [
  {
    icon: CalendarDays,
    label: "Embassy application",
    value: "Sep 15, 11:00 → Sep 30, 18:00",
    note: "Korea Standard Time · online through Study in Korea",
    page: "pp. 9–10",
  },
  {
    icon: GraduationCap,
    label: "Basic academic rule",
    value: "80%+ / top 20% / accepted CGPA scale",
    note: "Entire previous curriculum is evaluated",
    page: "p. 8",
  },
  {
    icon: Building2,
    label: "Embassy choices",
    value: "Up to 3 universities",
    note: "General track must include at least one Type B university",
    page: "p. 6",
  },
  {
    icon: BadgeCheck,
    label: "Final result",
    value: "Expected Jan 7, 2027",
    note: "Study in Korea announcement",
    page: "pp. 10–11",
  },
];

const SECTIONS = [
  {
    title: "Eligibility",
    page: "pp. 7–9",
    items: [
      "Applicant must hold citizenship of an NIIED-designated country; UIC is open worldwide.",
      "Applicant and parents/legal guardians must not hold Korean citizenship.",
      "Applicant must be under 25 years old — born after March 1, 2002.",
      "For a bachelor’s program, the applicant must have graduated or be expected to graduate from high school or an associate-degree program.",
      "Expected graduates must complete graduation by December 31, 2026.",
    ],
  },
  {
    title: "University choice rules",
    page: "pp. 5–6",
    items: [
      "Embassy General / Overseas Koreans & Adoptees: up to three universities across Type A and Type B, with at least one Type B.",
      "Embassy R-GKS: up to two Type B universities.",
      "University Track: one university and one department only.",
      "After final selection, transfer to a different field of study is not permitted.",
    ],
  },
  {
    title: "First-round documents",
    page: "pp. 12–14",
    items: [
      "Embassy Track applicants complete the application online and upload scanned copies of required certificates.",
      "The recommendation letter is uploaded as a scanned copy prepared by the recommender.",
      "Awards and other activity/achievement certificates are optional, with up to five documents from high school onward.",
      "First-round successful candidates must later submit original/certified documents for NIIED’s second round by the embassy deadline.",
    ],
  },
  {
    title: "Apostille / consular confirmation",
    page: "pp. 14–15",
    items: [
      "The forms you complete do not need apostille or consular confirmation.",
      "Required certificates for the second round must generally be apostilled or consular confirmed.",
      "Documents not written in English or Korean require a certified translation, with authentication on the original or certified translation.",
      "Simple photocopies or ordinary notarized copies of an authenticated document are not accepted as substitutes for the authenticated document itself.",
    ],
  },
  {
    title: "Evaluation",
    page: "pp. 18–20",
    items: [
      "Eligibility is checked first; only eligible applicants proceed to competency review.",
      "Competency review considers academic performance, language proficiency, academic activities, contributions to society/international exchange, future potential, and document completeness/authenticity.",
      "TOPIK level 3 or above receives quantitative additional points; science and engineering departments also receive additional points.",
      "Language proficiency is scored separately for Korean and English, and only the highest score report is recognized if multiple reports are submitted.",
    ],
  },
  {
    title: "Embassy → University Track fallback",
    page: "pp. 9–11",
    items: [
      "If an applicant fails the Embassy Track first round, they may apply again through University Track.",
      "Applicants who pass the Embassy Track first round — including backup candidates — cannot apply again through University Track.",
      "University Track deadlines vary by university, so applicants planning a fallback should check those deadlines before Embassy first-round results are announced.",
    ],
  },
];

export function GksU2027QuickGuide() {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            2027 quick guide
          </p>
          <h2 className="mt-1 text-[18px] font-semibold text-ink">What applicants need most</h2>
        </div>
        <p className="text-[11.5px] text-muted">Page references match the official English guideline.</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {QUICK_FACTS.map((fact) => {
          const Icon = fact.icon;
          return (
            <Card key={fact.label} className="h-full">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{fact.label}</p>
                    <span className="text-[11px] text-muted/70">{fact.page}</span>
                  </div>
                  <p className="mt-1 text-[14px] font-semibold text-ink">{fact.value}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{fact.note}</p>
                  <div className="mt-3">
                    <GuidelineRuleActions
                      id={"quick-fact-" + fact.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                      title={fact.label}
                      text={fact.value + ". " + fact.note}
                      page={fact.page}
                      sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
                      compact
                    />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3">
        {SECTIONS.filter(
          (section) =>
            section.title !== "Apostille / consular confirmation" &&
            section.title !== "Embassy → University Track fallback"
        ).map((section, index) => {
          const icons = [
            GraduationCap,
            Building2,
            FileCheck2,
            FileCheck2,
            BadgeCheck,
            ArrowRightLeft,
          ] as const;
          const Icon = icons[index];

          return (
            <Card key={section.title}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted ring-1 ring-hairline">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-ink">{section.title}</h3>
                    <span className="text-[11px] font-medium text-muted">{section.page}</span>
                  </div>
                  <ul className="mt-2.5 space-y-2">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-2 text-[12.75px] leading-relaxed text-muted">
                        <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <GuidelineRuleActions
                      id={"quick-section-" + section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                      title={section.title}
                      text={section.items.join(" ")}
                      page={section.page}
                      sourceUrl={GKS_U_2027_SOURCE.sourceUrl}
                      askQuestion={"Explain the 2027 GKS-U " + section.title + " rules using only the official guideline."}
                      compact
                    />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 border-primary/20 bg-primary-soft/45">
        <p className="text-[12.5px] leading-relaxed text-ink/80">
          The English guideline is a translation. If the Korean and English versions conflict, the Korean guideline prevails.
          University- and embassy-specific instructions can add local submission requirements, so applicants should still check
          the relevant first-round institution before submitting.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/gks?program=UG" className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink ring-1 ring-hairline-strong">
            Ask guideline AI
          </Link>
          <Link href="/application-readiness" className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink ring-1 ring-hairline-strong">
            Application Readiness
          </Link>
          <Link href="/requirement-checker" className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink ring-1 ring-hairline-strong">
            Requirement Checker
          </Link>
          <Link href="/apostille" className="rounded-full bg-white px-3 py-1.5 text-[11.5px] font-medium text-ink ring-1 ring-hairline-strong">
            Apostille Guide
          </Link>
        </div>
      </Card>
    </section>
  );
}
