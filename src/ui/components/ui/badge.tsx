import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 items-center rounded border px-1.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "border-stroke-subtle bg-surface-control text-content-muted",
        primary: "border-accent-primary/45 bg-accent-primary/15 text-accent-primary",
        secondary: "border-accent-secondary/45 bg-accent-secondary/15 text-accent-secondary",
        success: "border-status-success/45 bg-status-success/15 text-status-success",
        warning: "border-status-warning/45 bg-status-warning/15 text-status-warning",
        danger: "border-status-danger/45 bg-status-danger/15 text-status-danger",
        info: "border-status-info/45 bg-status-info/15 text-status-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };