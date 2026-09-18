import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-border bg-surface p-5 transition-[transform,background-color,border-color] duration-150 ease-out sm:p-6",
        interactive &&
          "interactive-card cursor-pointer hover:border-primary/25 active:scale-[0.99]",
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
        "text-[11px] font-semibold text-muted",
        className
      )}
      {...props}
    />
  );
}
