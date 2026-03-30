// Settings components index.
// 设置组件索引

export { RangeField } from "./RangeField";
export { TabButton } from "./TabButton";
export { SettingsPanelFrame } from "./SettingsPanelFrame";
export { EditorSettingsPanel } from "./EditorSettingsPanel";
export { GameSettingsPanel } from "./GameSettingsPanel";
export {
	getSettingsTabs,
	SETTINGS_TABS,
	SETTINGS_TAB_REGISTRY,
	renderSettingsTab,
	type SettingsTabId,
	type SettingsTabRenderProps,
} from "./tabRegistry";
export * from "./tabs";
