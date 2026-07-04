import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lifts on hover -- use for cards that are themselves a click target (links, buttons). */
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-hairline transition-[box-shadow,transform] duration-200",
        interactive && "hover:-translate-y-0.5 hover:shadow-card-hover",
        className
      )}
      {...props}
    />
  );
}

export function MicroLabel({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-wide text-muted",
        className
      )}
      {...props}
    />
  );
}
