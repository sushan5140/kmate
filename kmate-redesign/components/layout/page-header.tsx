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
    <header className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between lg:gap-8", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <div className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <p className="text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          </div>
        )}

        <h1 className="mt-2 text-[32px] font-extrabold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[40px]">
          {title}
        </h1>

        {description && (
          <p className="mt-2.5 max-w-2xl text-[12.5px] font-medium leading-6 text-muted sm:text-[13px]">
            {description}
          </p>
        )}

        {meta && <div className="mt-3">{meta}</div>}
      </div>

      {actions && <div className="shrink-0 sm:pb-1">{actions}</div>}
    </header>
  );
}
