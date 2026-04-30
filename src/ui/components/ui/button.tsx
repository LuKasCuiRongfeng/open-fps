import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-xs font-medium transition-colors disabled:pointer-events-none disabled:border-stroke-subtle disabled:bg-surface-panel-strong disabled:text-content-disabled",
  {
    variants: {
      variant: {
        default: "border-stroke-default bg-surface-control text-content-secondary hover:bg-surface-control-hover hover:text-content-primary",
        primary: "border-accent-primary bg-accent-primary text-accent-primary-content hover:bg-accent-primary-hover",
        secondary: "border-accent-secondary bg-accent-secondary text-accent-secondary-content hover:bg-accent-secondary-hover",
        success: "border-status-success bg-status-success text-status-success-content hover:bg-status-success-hover",
        warning: "border-status-warning/45 bg-status-warning/15 text-status-warning hover:bg-status-warning/25",
        danger: "border-status-danger/45 bg-status-danger/15 text-status-danger hover:bg-status-danger/25",
        info: "border-status-info/45 bg-status-info/15 text-status-info hover:bg-status-info/25",
        ghost: "border-transparent bg-transparent text-content-muted hover:bg-surface-control-hover hover:text-content-primary",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };