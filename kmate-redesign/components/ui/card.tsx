import { cn } from "@/lib/cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-hairline bg-surface/90 p-5 shadow-card transition-[transform,box-shadow,border-color] duration-200 ease-out sm:p-6",
        interactive &&
          "cursor-pointer hover:-translate-y-[2px] hover:border-hairline-strong hover:shadow-card-hover active:translate-y-0 active:scale-[0.99]",
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
        "text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-muted/80",
        className
      )}
      {...props}
    />
  );
}
