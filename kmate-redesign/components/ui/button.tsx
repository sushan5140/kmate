import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-xs hover:bg-primary-hover hover:shadow-card focus-visible:outline-primary",
  secondary:
    "border border-hairline-strong bg-surface text-ink shadow-xs hover:border-primary/30 hover:bg-primary-soft",
  ghost:
    "text-muted hover:bg-primary-soft hover:text-primary",
  danger:
    "border border-danger/15 bg-surface text-danger hover:bg-danger-soft",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[12.5px]",
  md: "h-10.5 px-4.5 text-[13.5px]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[13px] font-semibold transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 ease-out active:scale-[0.975] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
