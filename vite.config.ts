import { cp, readFile, rm, stat } from "node:fs/promises";
import { defineConfig, loadEnv, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
type AppTarget = "editor" | "game";
const GAME_DATA_PUBLIC_BASE = "/game-data/test_pro/";
const GAME_DATA_SOURCE_DIR = path.resolve(__dirname, "test_pro");
const GAME_DATA_OUTPUT_DIR = path.join("game-data", "test_pro");

const MIME_TYPES: Record<string, string> = {
    ".f32": "application/octet-stream",
    ".jpg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
};

function resolveAppTarget(mode: string): AppTarget {
    const env = loadEnv(mode, process.cwd(), "");
    return env.VITE_APP_TARGET === "game" ? "game" : "editor";
}

function isInsideDirectory(filePath: string, directory: string): boolean {
    const relativePath = path.relative(directory, filePath);
    return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function getMimeType(filePath: string): string {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function configureGameDataMiddleware(server: ViteDevServer | PreviewServer): void {
    server.middlewares.use(GAME_DATA_PUBLIC_BASE, async (request, response, next) => {
        try {
            const requestUrl = new URL(request.url ?? "/", "http://localhost");
            const publicPrefix = GAME_DATA_PUBLIC_BASE.replace(/^\/+|\/+$/g, "");
            const requestPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
            const relativePath = requestPath.startsWith(`${publicPrefix}/`)
                ? requestPath.slice(publicPrefix.length + 1)
                : requestPath;
            const filePath = path.resolve(GAME_DATA_SOURCE_DIR, relativePath);

            if (!isInsideDirectory(filePath, GAME_DATA_SOURCE_DIR)) {
                response.statusCode = 403;
                response.end("Forbidden");
                return;
            }

            const fileStat = await stat(filePath);
            if (!fileStat.isFile()) {
                next();
                return;
            }

            response.setHeader("Content-Type", getMimeType(filePath));
            response.setHeader("Content-Length", fileStat.size);
            response.end(await readFile(filePath));
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                next();
                return;
            }

            next(error);
        }
    });
}

function gameDataPlugin(appTarget: AppTarget): Plugin | null {
    if (appTarget !== "game") {
        return null;
    }

    return {
        name: "open-fps-game-data",
        configureServer: configureGameDataMiddleware,
        configurePreviewServer: configureGameDataMiddleware,
        async writeBundle() {
            // EN: Game builds carry read-only project data beside the app so runtime never opens an editor workspace.
            // 中文: 游戏构建把只读项目数据随应用一起输出，运行时不再打开编辑器工作区。
            const outputDir = path.resolve(__dirname, "dist-game", GAME_DATA_OUTPUT_DIR);
            await rm(outputDir, { recursive: true, force: true });
            await cp(GAME_DATA_SOURCE_DIR, outputDir, { recursive: true });
        },
    };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const appTarget = resolveAppTarget(mode);
    const appHtml = appTarget === "game" ? "game.html" : "editor.html";
    const plugins = [
        react(),
        babel({
            presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
        gameDataPlugin(appTarget),
    ].filter((plugin): plugin is Plugin => plugin !== null);

    return {
        plugins,

        resolve: {
            alias: {
                "@": path.resolve(__dirname, "src"),
                "@game": path.resolve(__dirname, "src/game"),
                "@editor": path.resolve(__dirname, "src/editor"),
                "@project": path.resolve(__dirname, "src/workspace"),
                "@workspace": path.resolve(__dirname, "src/workspace"),
                "@ui": path.resolve(__dirname, "src/ui"),
                "@config": path.resolve(__dirname, "src/config"),
            },
        },

        build: {
            outDir: appTarget === "game" ? "dist-game" : "dist-editor",
            rollupOptions: {
                input: path.resolve(__dirname, appHtml),
            },
        },

        appType: "mpa",

        // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
        //
        // 1. prevent Vite from obscuring rust errors
        clearScreen: false,
        // 2. tauri expects a fixed port, fail if that port is not available
        server: {
            port: 1420,
            strictPort: true,
            host: host || "127.0.0.1",
            hmr: host
                ? {
                      protocol: "ws",
                      host,
                      port: 1421,
                  }
                : undefined,
            watch: {
                // 3. tell Vite to ignore watching `src-tauri`
                ignored: ["**/src-tauri/**"],
            },
        },
    };
});
