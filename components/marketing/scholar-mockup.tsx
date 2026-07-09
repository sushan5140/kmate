import {
  CircleCheck,
  CircleX,
  GraduationCap,
  ListChecks,
  MessageCircleQuestion,
  Trophy,
} from "lucide-react";

const ACADEMICS: [string, string][] = [
  ["GPA", "3.87 / 4.0"],
  ["TOPIK", "Level 4"],
  ["IELTS", "7.5"],
  ["Degree", "BEng, Mechanical — HUST (Hanoi)"],
  ["Publications", "2 (1 first-author)"],
];

const EXTRACURRICULARS = [
  "Research assistant, thermofluids lab (2 yrs)",
  "Robotics club — team lead, final year",
  "Volunteer translator, blood-donation NGO",
  "Exchange semester, NTU Taiwan",
  "Part-time CAD tutor for first-years",
];

const AWARDS = [
  "National engineering-design competition, 2nd place",
  "University merit scholarship, 3 years running",
  "Best undergraduate thesis, faculty award",
];

const ACCEPTED = [
  { name: "Seoul National University", note: "1st choice · final placement" },
  { name: "Hanyang University", note: "3rd choice" },
];

const REJECTED = [{ name: "KAIST", note: "2nd choice" }];

/**
 * Static mock of a scholar profile from the applicant database — the full
 * picture of an application that worked, rejections included.
 */
export function ScholarMockup() {
  return (
    <div className="relative select-none overflow-hidden rounded-[28px] bg-surface p-5 shadow-card ring-1 ring-hairline sm:p-6" aria-hidden>
      {/* Overview bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-[15px] font-bold text-white">
            M
          </div>
          <div>
            <p className="text-[15px] font-bold text-ink">@minh.duc</p>
            <p className="text-[12px] text-muted">
              GKS-G 2025 · Embassy track · Mechanical Engineering
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-md bg-gks-g/10 px-2 py-1 text-gks-g">GKS-G</span>
          <span className="rounded-md bg-ink/[0.05] px-2 py-1 text-ink ring-1 ring-hairline">
            TOPIK 4
          </span>
          <span className="rounded-md bg-ink/[0.05] px-2 py-1 text-ink ring-1 ring-hairline">
            GPA 3.87
          </span>
          <span className="rounded-md bg-success-soft px-2 py-1 text-success">Now at SNU</span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {/* Column 1: Academics + Awards */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-primary-soft p-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <h3 className="text-[13px] font-bold text-ink">Academics</h3>
            </div>
            <dl className="mt-3 flex flex-col gap-1.5">
              {ACADEMICS.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 text-[12px]">
                  <dt className="shrink-0 text-muted">{label}</dt>
                  <dd className="text-right font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl bg-gold-soft p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" />
              <h3 className="text-[13px] font-bold text-ink">Awards</h3>
            </div>
            <ol className="mt-3 flex list-none flex-col gap-2">
              {AWARDS.map((item, i) => (
                <li key={item} className="flex gap-2 text-[12px] leading-snug text-ink/80">
                  <span className="tabular-nums shrink-0 font-bold text-gold">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Column 2: Extracurriculars */}
        <div className="flex flex-col gap-4">
          <div className="flex-1 rounded-2xl bg-gks-u/[0.07] p-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-gks-u" />
              <h3 className="text-[13px] font-bold text-ink">Extracurriculars</h3>
            </div>
            <ol className="mt-3 flex list-none flex-col gap-2">
              {EXTRACURRICULARS.map((item, i) => (
                <li key={item} className="flex gap-2 text-[12px] leading-snug text-ink/80">
                  <span className="tabular-nums shrink-0 font-bold text-gks-u">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl bg-canvas p-3.5 ring-1 ring-hairline">
            <p className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
              <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Contributed 3 questions to the Interview DB from the 2025 embassy
              round.
            </p>
          </div>
        </div>

        {/* Column 3: Results */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-success-soft p-4">
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-success" />
              <h3 className="text-[13px] font-bold text-ink">Accepted</h3>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {ACCEPTED.map((u) => (
                <li key={u.name} className="text-[12px] leading-snug">
                  <p className="font-semibold text-ink">{u.name}</p>
                  <p className="text-[11px] text-success">{u.note}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-danger-soft p-4">
            <div className="flex items-center gap-2">
              <CircleX className="h-4 w-4 text-danger" />
              <h3 className="text-[13px] font-bold text-ink">Rejected</h3>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {REJECTED.map((u) => (
                <li key={u.name} className="text-[12px] leading-snug">
                  <p className="font-semibold text-ink">{u.name}</p>
                  <p className="text-[11px] text-danger">{u.note}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-danger/10 pt-2.5 text-[11px] italic leading-snug text-muted">
              Rejections stay on the profile. A database of only wins teaches
              you nothing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
