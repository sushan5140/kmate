import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NAV_GROUP_LABELS, NAV_GROUP_ORDER, navItemsByGroup, type NavGroup } from "@/lib/nav-items";

const DESCRIPTIONS: Record<string, string> = {
  "/application-readiness": "Plan the route, documents, fallback path, forms, and final checks in one workspace.",
  "/requirement-checker": "Check university-specific requirements against KMate's source-tagged official dataset.",
  "/gks": "Ask GKS questions against official guideline evidence instead of community guesswork.",
  "/official-guidelines": "Open the current guideline, source notices, archives, and the 2027 quick guide.",
  "/apostille": "See authentication timing, document rules, and verified country-specific exceptions.",
  "/notices": "Track current Study in Korea and reviewed GKS notices with program and track filters.",
  "/scholarships": "Browse university scholarships with benefits, deadlines, requirements, and source links.",
  "/interview-db": "Draft answers, filter question themes, and launch KMate's AI mock-interview workflow.",
  "/mistakes": "Search recurring application mistakes and rejection-risk patterns reported by applicants.",
  "/eca": "Browse extracurricular examples by track, activity type, impact area, and confidence.",
  "/faq-trends": "See the questions applicants ask most often and open them in GKS Assistant.",
  "/messages": "Use KMate's private 1:1 messaging workspace for accepted connections.",
  "/requests": "Discover applicants, handle requests, and manage your connections.",
  "/scholar-stats": "Explore final-round scholar placements and compare universities side by side.",
};

const BADGES: Record<string, string> = {
  "/application-readiness": "Planner", "/requirement-checker": "Official data", "/gks": "AI + sources",
  "/official-guidelines": "Official", "/apostille": "Official", "/notices": "Live feed",
  "/scholarships": "University data", "/interview-db": "Practice", "/mistakes": "Community",
  "/eca": "Community", "/faq-trends": "Trends", "/messages": "Private", "/requests": "Community",
  "/scholar-stats": "NIIED data",
};

const GROUP_SUBTITLES: Partial<Record<NavGroup, string>> = {
  application: "Build and verify the application itself.",
  resources: "Rules, sources, notices, and funding.",
  preparation: "Prepare the parts that need judgment and practice.",
  community: "People, conversations, and placement context.",
};

export function ToolDirectory() {
  const groups = NAV_GROUP_ORDER.filter((group) => group !== "overview");
  return (
    <section className="mt-5 rounded-[26px] border border-hairline bg-surface/74 p-4 shadow-card sm:p-5 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">Full product</p>
          <h2 className="mt-1 text-[20px] font-extrabold tracking-[-0.025em] text-ink sm:text-[22px]">Every KMate tool, one workspace.</h2>
          <p className="mt-1.5 max-w-2xl text-[11.5px] font-medium leading-5 text-muted">Nothing is tucked behind a landing page. Jump directly into the same feature set as the production app.</p>
        </div>
        <span className="w-fit rounded-full bg-ink px-3 py-1.5 text-[10px] font-extrabold text-white">14 core tools</span>
      </div>
      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {groups.map((group) => {
          const items = navItemsByGroup(group);
          return (
            <section key={group} className="rounded-[20px] border border-hairline bg-canvas/45 p-3 sm:p-4">
              <div className="px-1 pb-3">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.13em] text-muted/65">{NAV_GROUP_LABELS[group]}</p>
                {GROUP_SUBTITLES[group] && <p className="mt-1 text-[10.5px] font-medium text-muted">{GROUP_SUBTITLES[group]}</p>}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="pressable group flex min-h-[118px] flex-col rounded-[16px] border border-hairline bg-surface px-4 py-3.5 shadow-xs hover:-translate-y-[1px] hover:border-hairline-strong hover:bg-white hover:shadow-card">
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-primary-soft text-primary"><Icon className="h-4 w-4" /></span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted/45 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                      </div>
                      <div className="mt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[12px] font-extrabold tracking-[-0.01em] text-ink">{item.label}</p>
                          <span className="rounded-full bg-canvas px-2 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-muted/65">{BADGES[item.href] ?? "Tool"}</span>
                        </div>
                        <p className="mt-1.5 text-[9.75px] font-medium leading-4 text-muted">{DESCRIPTIONS[item.href]}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
