import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "field-surface h-7 w-full rounded-md border px-2 text-xs outline-none transition-colors placeholder:text-content-disabled focus:border-focus-ring disabled:cursor-not-allowed disabled:text-content-disabled",
        className,
      )}
      {...props}
    />
  );
}