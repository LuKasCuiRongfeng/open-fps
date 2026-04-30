import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type SliderTone = "primary" | "secondary" | "success" | "warning";

export type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  tone?: SliderTone;
};

function getToneClass(tone: SliderTone): string {
  switch (tone) {
    case "secondary":
      return "bg-accent-secondary border-accent-secondary";
    case "success":
      return "bg-status-success border-status-success";
    case "warning":
      return "bg-status-warning border-status-warning";
    default:
      return "bg-accent-primary border-accent-primary";
  }
}

export function Slider({ className, tone = "primary", ...props }: SliderProps) {
  const toneClass = getToneClass(tone);

  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-5 w-full touch-none select-none items-center disabled:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface-panel-strong">
        <SliderPrimitive.Range className={cn("absolute h-full rounded-full", toneClass)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className={cn("block h-3.5 w-3.5 rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none", toneClass)} />
    </SliderPrimitive.Root>
  );
}