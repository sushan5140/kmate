import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[16px] border border-border bg-surface p-5 shadow-card transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out sm:p-6",
        interactive &&
          "interactive-card cursor-pointer hover:-translate-y-[1px] hover:border-primary/20 hover:shadow-card-hover active:translate-y-0 active:scale-[0.99]",
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
        "text-[9.5px] font-extrabold uppercase tracking-[0.15em] text-muted/70",
        className
      )}
      {...props}
    />
  );
}
