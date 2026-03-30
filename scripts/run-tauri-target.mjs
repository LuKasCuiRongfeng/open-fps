import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , tauriCommand, target, ...extraArgs] = process.argv;

if (!tauriCommand || !target || !["dev", "build"].includes(tauriCommand) || !["editor", "game"].includes(target)) {
  console.error("Usage: node scripts/run-tauri-target.mjs <dev|build> <editor|game> [...tauriArgs]");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const tauriConfig = path.join("src-tauri", `tauri.${target}.conf.json`);
const cargoTargetDir = path.join(workspaceRoot, "src-tauri", `target-${target}`);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function quoteArg(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

const tauriArgs = [
  "tauri",
  tauriCommand,
  "--config",
  tauriConfig,
  ...extraArgs,
];

const sharedOptions = {
  cwd: workspaceRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    CARGO_TARGET_DIR: cargoTargetDir,
  },
};

const child = process.platform === "win32"
  ? spawn(`${pnpmCommand} ${tauriArgs.map(quoteArg).join(" ")}`, {
      ...sharedOptions,
      shell: true,
    })
  : spawn(pnpmCommand, tauriArgs, sharedOptions);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});