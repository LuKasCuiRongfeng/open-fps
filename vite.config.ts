import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
type AppTarget = "editor" | "game";

function resolveAppTarget(mode: string): AppTarget {
    const env = loadEnv(mode, process.cwd(), "");
    return env.VITE_APP_TARGET === "game" ? "game" : "editor";
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
    const appTarget = resolveAppTarget(mode);

    return ({
    plugins: [
        react(),
        babel({
            presets: [reactCompilerPreset()],
        }),
        tailwindcss(),
    ],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@game": path.resolve(__dirname, "src/game"),
            "@project": path.resolve(__dirname, "src/workspace"),
            "@workspace": path.resolve(__dirname, "src/workspace"),
            "@ui": path.resolve(__dirname, "src/ui"),
            "@config": path.resolve(__dirname, "src/config"),
            "@app-entry": path.resolve(__dirname, `src/app/entries/${appTarget}.tsx`),
        },
    },

    build: {
        outDir: appTarget === "game" ? "dist-game" : "dist-editor",
    },

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
    });
});
