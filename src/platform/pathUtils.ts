export function normalizeAssetPath(path: string): string {
  if (/^[a-z]+:\/\//i.test(path)) {
    return path;
  }

  const unified = path.replace(/\\/g, "/");
  const windowsDriveMatch = unified.match(/^[A-Za-z]:\//);

  let prefix = "";
  let remainder = unified;

  if (windowsDriveMatch) {
    prefix = windowsDriveMatch[0];
    remainder = unified.slice(prefix.length);
  } else if (unified.startsWith("//")) {
    prefix = "//";
    remainder = unified.slice(2);
  } else if (unified.startsWith("/")) {
    prefix = "/";
    remainder = unified.slice(1);
  }

  const segments = remainder.split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "..") {
        normalized.pop();
      }
      continue;
    }

    normalized.push(segment);
  }

  return `${prefix}${normalized.join("/")}`;
}