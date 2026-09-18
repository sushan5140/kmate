const STAGES = [
  {
    month: "Feb",
    title: "Guidelines drop",
    body: "NIIED publishes the notice. Everyone re-reads it five times.",
    need: "People to decode the fine print with",
  },
  {
    month: "Mar",
    title: "Embassy & university deadlines",
    body: "SOP, recommendation letters, apostilled everything.",
    need: "SOP swap partners in your major",
  },
  {
    month: "Apr–May",
    title: "First-round interviews",
    body: "The part nobody feels ready for.",
    need: "Mock interview partners on your track",
  },
  {
    month: "Jun",
    title: "NIIED second round",
    body: "Results trickle out country by country.",
    need: "People who understand the waiting",
  },
  {
    month: "Aug",
    title: "Final placement",
    body: "University confirmations, visas, one-way tickets.",
    need: "Future classmates, before you land",
  },
];

/**
 * The GKS-G application year as a horizontal timeline. GKS-U runs the same
 * shape on a Sept–Jan cycle, noted in the section copy next to this.
 */
export function GksTimeline() {
  return (
    <div className="-mx-6 overflow-x-auto px-6 pb-2 [scrollbar-width:thin]">
      <ol className="grid min-w-[880px] grid-cols-5 gap-4">
        {STAGES.map((stage, i) => (
          <li key={stage.month} className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-8 shrink-0 items-center rounded-full bg-ink px-3 text-[12px] font-bold tabular-nums text-white">
                {stage.month}
              </span>
              {i < STAGES.length - 1 && (
                <span className="h-px flex-1 bg-hairline-strong" aria-hidden />
              )}
            </div>
            <div className="mt-4 pr-2">
              <h3 className="text-[14px] font-semibold text-ink">{stage.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{stage.body}</p>
              <p className="mt-2.5 border-l-2 border-primary/40 pl-2.5 text-[12px] font-medium italic leading-snug text-primary">
                {stage.need}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
