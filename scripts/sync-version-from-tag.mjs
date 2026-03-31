import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawTag = process.argv.slice(2).find((value) => value !== "--");

if (!rawTag) {
  console.error("Usage: node scripts/sync-version-from-tag.mjs <tag>");
  process.exit(1);
}

const match = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(rawTag.trim());

if (!match) {
  console.error(`Invalid release tag \"${rawTag}\". Expected format: v<semver>.`);
  process.exit(1);
}

const version = match[1];
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(workspaceRoot, "package.json");

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
packageJson.version = version;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

console.log(`Synchronized package.json version to ${version} from tag ${rawTag}.`);