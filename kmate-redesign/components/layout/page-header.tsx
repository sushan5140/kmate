import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between lg:gap-8", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <div className="inline-flex items-center gap-2">
            <span className="h-3 w-[3px] rounded-full bg-gks-u" />
            <p className="text-[12px] font-semibold text-primary">{eyebrow}</p>
          </div>
        )}

        <h1 className="mt-2 text-[32px] font-extrabold leading-[1.04] tracking-[-0.045em] text-ink sm:text-[40px]">
          {title}
        </h1>

        {description && (
          <p className="mt-2.5 max-w-2xl text-[13px] font-medium leading-6 text-muted sm:text-[14px]">
            {description}
          </p>
        )}

        {meta && <div className="mt-3">{meta}</div>}
      </div>

      {actions && <div className="shrink-0 sm:pb-1">{actions}</div>}
    </header>
  );
}
