/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_TARGET?: "editor" | "game";
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
