import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover focus-visible:outline-primary",
  secondary: "border border-border bg-white text-ink hover:border-primary/25 hover:bg-primary-soft",
  ghost: "text-muted hover:bg-primary-soft hover:text-primary",
  danger: "border border-danger/15 bg-white text-danger hover:bg-danger-soft",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-11 px-3.5 text-[12px]",
  md: "h-11 px-4 text-[13px]",
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
        "inline-flex items-center justify-center gap-2 rounded-[9px] font-bold transition-[transform,background-color,border-color,color,opacity] duration-150 ease-out active:scale-[0.975] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
