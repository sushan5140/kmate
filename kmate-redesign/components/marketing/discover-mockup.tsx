import { Check, SlidersHorizontal } from "lucide-react";

const FAKE_PROFILES = [
  {
    username: "linh.tran",
    track: "GKS-U" as const,
    major: "Biomedical Engineering",
    year: 2027,
    bio: "Third time applying. This time the SOP writes itself (I wish).",
    match: "1st choice: SNU",
  },
  {
    username: "tunde.ao",
    track: "GKS-G" as const,
    major: "Public Health",
    year: 2027,
    bio: "Epidemiology, TOPIK 3, aiming for Yonsei GSPH. Happy to swap SOP drafts.",
    match: "2nd choice: Yonsei",
  },
  {
    username: "mariana.rc",
    track: "GKS-G" as const,
    major: "International Studies",
    year: 2027,
    bio: "From São Paulo. Trading SOP feedback for mock interview practice.",
    match: "1st choice: SNU",
  },
];

const TRACK_STYLE: Record<"GKS-U" | "GKS-G", string> = {
  "GKS-U": "bg-gks-u/10 text-gks-u",
  "GKS-G": "bg-gks-g/10 text-gks-g",
};

/** Static, realistic mock of the Discover screen for the landing page. */
export function DiscoverMockup() {
  return (
    <div className="relative select-none overflow-hidden rounded-[24px] bg-surface p-5 shadow-card ring-1 ring-hairline" aria-hidden>
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-3.5 w-3.5 text-muted" />
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium">
          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-white">
            <Check className="h-3 w-3" /> GKS-G
          </span>
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-muted ring-1 ring-hairline">
            Computer Science
          </span>
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-muted ring-1 ring-hairline">
            Seoul Nat&apos;l Univ.
          </span>
          <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-muted ring-1 ring-hairline">
            2027
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {FAKE_PROFILES.map((p) => (
          <div key={p.username} className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-hairline">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink/[0.06] text-[12px] font-bold uppercase text-ink/60">
                  {p.username[0]}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-ink">@{p.username}</p>
                  <p className="text-[11.5px] text-muted">
                    {p.major} · {p.year}
                  </p>
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TRACK_STYLE[p.track]}`}>
                {p.track}
              </span>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{p.bio}</p>
            <div className="mt-2.5 flex items-center justify-between">
              <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-success">
                {p.match}
              </span>
              <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white">
                Request
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
