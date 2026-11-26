/** Preparation suggestions, not scholarship requirements or verified deadlines. */
export const GKS_G_PREPARATION_PATH = "/application-readiness?program=GKS-G&own=1#graduate-preparation";
export const HISTORICAL_GUIDELINES_URL = "https://studyinkorea.go.kr/ko/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4420";
export const OFFICIAL_NOTICES_URL = "https://www.studyinkorea.go.kr/ko/notice/scholarshipsList.do?boardSort=3";

export type PreparationTrack = "" | "embassy" | "university";
export type PreparationTask = {
  id: string;
  title: string;
  description: string;
  link?: { href: string; label: string };
};
export type PreparationGroup = { title: string; tasks: PreparationTask[] };

export function graduatePreparationGroups(track: PreparationTrack): PreparationGroup[] {
  const params = new URLSearchParams({ program: "GKS-G" });
  if (track) params.set("track", track);
  const routeTask: PreparationTask = track === "embassy"
    ? { id: "route-embassy", title: "Identify your first-round embassy", description: "Find its official scholarship notice page and check how it announces local application instructions." }
    : track === "university"
      ? { id: "route-university", title: "Identify the university's GKS contact", description: "Find the graduate admissions or GKS office and its official notices. Verify the department and application procedure when current-cycle instructions are available." }
      : { id: "route-undecided", title: "Explore both application routes", description: "Compare historical Embassy and University Track instructions. Confirm the permitted route and university choices when the general 2027 notice appears." };
  return [
    { title: "Start now · collect evidence", tasks: [
      { id: "academic-records", title: "Request academic records", description: "Ask your institution about transcripts, degree certificates or expected-graduation evidence, grading-scale explanations and document processing times." },
      { id: "shortlist", title: "Shortlist departments and research interests", description: "Find relevant graduate programs and faculty on official university websites. Previous-cycle participation does not confirm 2027 availability.", link: { href: "/requirement-checker?" + params.toString(), label: "Explore historical requirements" } },
      routeTask,
      { id: "referees", title: "Speak to potential referees", description: "Ask about their availability and share an accurate summary of your academic work. Wait for the current-cycle recommendation form and submission instructions." },
    ] },
    { title: "Next · prepare materials", tasks: [
      { id: "language", title: "Plan language-test preparation", description: "Check test dates, score validity and department-specific policies; do not assume a test, waiver or minimum score applies without official confirmation.", link: { href: "/requirement-checker?" + params.toString(), label: "Check university evidence" } },
      { id: "authentication", title: "Investigate document authentication", description: "Check whether relevant documents can be authenticated and translated, how long that takes and which authority handles them. Verify the final recipient-specific requirements before paying.", link: { href: "/apostille", label: "Open Apostille Guide" } },
      { id: "faculty", title: "Assess whether faculty contact is appropriate", description: "Read department instructions and relevant lab work. If contact is appropriate, prepare a concise research-fit message; informal support is not an admission or scholarship guarantee." },
      { id: "essays", title: "Outline your statement and study plan", description: "Gather real examples of academic work, research interests, goals and why each department fits. Adapt the draft to the official forms when released." },
    ] },
    { title: "When the current-cycle notice is available · reverify", tasks: [
      { id: "verify-national", title: "Check the general 2027 GKS-G announcement", description: "Reverify eligibility, degree and route options, participating institutions, forms and submission dates using current-cycle official instructions.", link: { href: OFFICIAL_NOTICES_URL, label: "Study in Korea notices" } },
      { id: "verify-recipient", title: "Confirm first-round submission instructions", description: "Check your embassy or university's current notice for required documents, copies, authentication, method, time zone and deadlines. Do not reuse old forms automatically." },
    ] },
  ];
}

/** Persist only known checklist IDs; never store application records here. */
export function parseGraduatePreparationProgress(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const known = new Set((["", "embassy", "university"] as const)
      .flatMap(track => graduatePreparationGroups(track).flatMap(group => group.tasks.map(task => task.id))));
    return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && known.has(id))));
  } catch {
    return [];
  }
}

export function graduatePreparationCount(groups: PreparationGroup[], completed: string[]) {
  const tasks = groups.flatMap(group => group.tasks);
  return { total: tasks.length, done: tasks.filter(task => completed.includes(task.id)).length };
}
