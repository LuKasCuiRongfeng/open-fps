// PageGrid: shared virtual page coordinate helpers.
// PageGrid：共享虚拟 page 坐标辅助函数。

export function pageKey(px: number, pz: number): string {
  return `${px},${pz}`;
}

export function parsePageKey(key: string): { px: number; pz: number } {
  const match = key.match(/^(-?\d+),(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid page key '${key}'`);
  }

  const px = Number(match[1]);
  const pz = Number(match[2]);
  return { px, pz };
}

export function normalizePageKeys(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Map manifest ${label} keys must be an array`);
  }

  const keys = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string") {
      throw new Error(`Map manifest ${label} keys must be strings`);
    }

    parsePageKey(key);
    if (keys.has(key)) {
      throw new Error(`Map manifest has duplicate ${label} key '${key}'`);
    }

    keys.add(key);
  }

  return sortPageKeys(keys);
}

export function sortPageKeys(keys: Iterable<string>): string[] {
  return Array.from(keys).sort(comparePageKeys);
}

export function formatGridCoordinate(value: number): string {
  if (!Number.isInteger(value)) {
    throw new Error(`Grid coordinate must be an integer: ${value}`);
  }

  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

function comparePageKeys(left: string, right: string): number {
  const a = parsePageKey(left);
  const b = parsePageKey(right);
  return a.pz - b.pz || a.px - b.px;
}