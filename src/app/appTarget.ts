export const APP_TARGETS = ["editor", "game"] as const;

export type AppTarget = (typeof APP_TARGETS)[number];

function parseTarget(value: string | null | undefined): AppTarget | null {
  if (!value) return null;
  return APP_TARGETS.includes(value as AppTarget) ? (value as AppTarget) : null;
}

export function resolveAppTarget(): AppTarget {
  const queryTarget = typeof window !== "undefined"
    ? parseTarget(new URLSearchParams(window.location.search).get("target"))
    : null;

  return queryTarget ?? parseTarget(import.meta.env.VITE_APP_TARGET) ?? "editor";
}