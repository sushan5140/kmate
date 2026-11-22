import { Check, LockKeyhole, MessageCircle } from "lucide-react";

/**
 * Fictional connection states for the public landing page.
 * Accepted connections enable in-app messaging. No external contact
 * details are displayed or implied to be revealed automatically.
 */
export function ConnectMockup() {
  return (
    <div className="relative select-none overflow-hidden rounded-[24px] bg-surface p-5 shadow-card ring-1 ring-hairline" aria-hidden>
      <p className="mb-3 text-[11px] font-semibold text-muted">
        Fictional connection · illustrative preview
      </p>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-hairline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink/[0.06] text-[12px] font-bold uppercase text-ink/60">
                A
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">@aigerim.k</p>
                <p className="text-[11.5px] text-muted">GKS-U · Chemistry · 2027</p>
              </div>
            </div>
            <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[10.5px] font-semibold text-muted ring-1 ring-hairline">
              Request pending
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-hairline">
            <LockKeyhole className="h-4 w-4 shrink-0 text-muted" />
            <span className="text-[12px] font-medium text-muted">
              In-app conversation is locked until the request is accepted.
            </span>
          </div>
        </div>

        <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-success text-white shadow-xs">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </div>

        <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-success/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-ink">@aigerim.k accepted</p>
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-bold text-success">
              Connected
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-3 ring-1 ring-hairline">
            <MessageCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-[12px] font-semibold text-ink">
              Private in-app messaging is available.
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            External contact methods may be accessible to accepted connections.
          </p>
        </div>
      </div>
    </div>
  );
}
