// EN: Compact settings primitives keep editor-style setting pages visually consistent.
// 中文: 紧凑设置基础组件用于保持编辑器风格设置页的视觉一致性。

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type BadgeProps } from "@ui/components/ui/badge";
import { Button, type ButtonProps } from "@ui/components/ui/button";

type Tone = "neutral" | "primary" | "secondary" | "success" | "warning" | "danger" | "info";

type SettingsSectionProps = {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

type SettingRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  align?: "start" | "center";
};

type SettingsButtonProps = ButtonProps & {
  Icon?: LucideIcon;
  tone?: Tone;
  fullWidth?: boolean;
};

type SettingBadgeProps = {
  tone?: Tone;
  children: ReactNode;
};

type ReadonlyFieldProps = {
  children: ReactNode;
  align?: "left" | "right";
};

function getButtonVariant(tone: Tone): ButtonProps["variant"] {
  switch (tone) {
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    case "info":
      return "info";
    default:
      return "default";
  }
}

function getBadgeVariant(tone: Tone): BadgeProps["variant"] {
  switch (tone) {
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    case "info":
      return "info";
    default:
      return "default";
  }
}

export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="space-y-3 text-xs">{children}</div>;
}

export function SettingsSection({ id, title, description, actions, children }: SettingsSectionProps) {
  return (
    <section id={id} className="scroll-mt-3 border-b border-stroke-subtle pb-3 last:border-b-0 last:pb-0">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-wide text-content-secondary">{title}</h2>
          {description && <p className="mt-0.5 text-[11px] leading-4 text-content-muted">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="divide-y divide-stroke-subtle">{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, children, align = "center" }: SettingRowProps) {
  return (
    <div className={`grid gap-2 py-2 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] ${align === "start" ? "sm:items-start" : "sm:items-center"}`}>
      <div className="min-w-0">
        <div className="text-xs font-medium text-content-secondary">{label}</div>
        {description && <div className="mt-0.5 text-[11px] leading-4 text-content-muted">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SettingsButton({ Icon, tone = "neutral", fullWidth = false, className = "", children, ...buttonProps }: SettingsButtonProps) {
  return (
    <Button
      {...buttonProps}
      variant={getButtonVariant(tone)}
      className={cn(fullWidth && "w-full", className)}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </Button>
  );
}

export function SettingBadge({ tone = "neutral", children }: SettingBadgeProps) {
  return <Badge variant={getBadgeVariant(tone)}>{children}</Badge>;
}

export function ReadonlyField({ children, align = "left" }: ReadonlyFieldProps) {
  return (
    <div className={`field-surface flex min-h-7 items-center rounded-md border px-2 font-mono text-xs text-content-secondary ${align === "right" ? "justify-end text-right" : "justify-start"}`}>
      {children}
    </div>
  );
}