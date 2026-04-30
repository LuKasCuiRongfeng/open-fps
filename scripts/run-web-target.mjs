import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMANDS = ["dev", "build"];
const TARGETS = ["editor", "game"];
const [, , command, target, ...extraArgs] = process.argv;

function printUsage() {
    console.error("Usage: node scripts/run-web-target.mjs <dev|build> <editor|game|all> [...viteArgs]");
}

if (!command || !target || !COMMANDS.includes(command) || ![...TARGETS, "all"].includes(target)) {
    printUsage();
    process.exit(1);
}

if (command === "dev" && target === "all") {
    console.error("Dev mode needs one target: editor or game.");
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function quoteArg(value) {
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '\\"')}"`;
}

function runPnpm(args) {
    const sharedOptions = {
        cwd: workspaceRoot,
        stdio: "inherit",
    };

    const child = process.platform === "win32"
        ? spawn(`${pnpmCommand} ${args.map(quoteArg).join(" ")}`, {
            ...sharedOptions,
            shell: true,
        })
        : spawn(pnpmCommand, args, sharedOptions);

    return new Promise((resolve) => {
        child.on("exit", (code, signal) => {
            resolve({ code: code ?? 1, signal });
        });
    });
}

async function runVite(currentTarget) {
    const viteArgs = command === "dev"
        ? ["vite", "--mode", currentTarget, ...extraArgs]
        : ["vite", "build", "--mode", currentTarget, ...extraArgs];

    return runPnpm(viteArgs);
}

if (command === "build") {
    const { code, signal } = await runPnpm(["tsc"]);

    if (signal) {
        process.kill(process.pid, signal);
    }

    if (code !== 0) {
        process.exit(code);
    }
}

const selectedTargets = target === "all" ? TARGETS : [target];

for (const currentTarget of selectedTargets) {
    const { code, signal } = await runVite(currentTarget);

    if (signal) {
        process.kill(process.pid, signal);
        break;
    }

    if (code !== 0) {
        process.exit(code);
    }
}

process.exit(0);