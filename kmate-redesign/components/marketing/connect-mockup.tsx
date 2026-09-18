import { AtSign, Check, Send } from "lucide-react";

/**
 * Static mock of the contact-reveal flow: request → accept → contacts
 * become visible. The "before" state renders blurred rows so the
 * hidden-by-default mechanic is visible at a glance.
 */
export function ConnectMockup() {
  return (
    <div className="relative select-none overflow-hidden rounded-[24px] bg-surface p-5 shadow-card ring-1 ring-hairline" aria-hidden>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-hairline">
          <div className="flex items-center justify-between">
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
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-hairline">
              <AtSign className="h-3 w-3 shrink-0 text-muted" />
              <span className="select-none text-[11.5px] font-medium text-ink blur-[5px]">
                aigerim.kz01
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-hairline">
              <Send className="h-3 w-3 shrink-0 text-muted" />
              <span className="select-none text-[11.5px] font-medium text-ink blur-[5px]">
                @aigerim_telegram
              </span>
            </div>
          </div>
          <p className="mt-2 text-[10.5px] font-medium text-muted">
            Contacts stay hidden until she accepts.
          </p>
        </div>

        <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-success text-white shadow-xs">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </div>

        <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-success/30">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-ink">@aigerim.k accepted</p>
            <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10.5px] font-bold text-success">
              Connected
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-hairline">
              <AtSign className="h-3 w-3 shrink-0 text-muted" />
              <span className="text-[11.5px] font-medium text-ink">aigerim.kz01</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-hairline">
              <Send className="h-3 w-3 shrink-0 text-muted" />
              <span className="text-[11.5px] font-medium text-ink">@aigerim_telegram</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
