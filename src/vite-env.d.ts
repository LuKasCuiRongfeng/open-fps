/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_APP_TARGET?: "editor" | "game";
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module "@app-entry" {
	import type { ComponentType } from "react";

	const AppEntry: ComponentType;
	export default AppEntry;
}
