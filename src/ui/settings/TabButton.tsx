// TabButton: settings panel tab button component.
// TabButton：设置面板标签按钮组件

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

export function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "w-full rounded-md border border-white/15 bg-white/10 px-3 py-2 text-left text-xs text-white"
          : "w-full rounded-md border border-transparent bg-transparent px-3 py-2 text-left text-xs text-white/70 hover:bg-white/5 hover:text-white"
      }
    >
      {label}
    </button>
  );
}

export const TABS = [
  { id: "help", label: "Help" },
  { id: "file", label: "File" },
  { id: "terrainEditor", label: "Terrain Editor" },
  { id: "textureEditor", label: "Texture Editor" },
  { id: "render", label: "Render" },
  { id: "camera", label: "Camera" },
  { id: "fog", label: "Fog" },
  { id: "movement", label: "Movement" },
  { id: "physics", label: "Physics" },
  { id: "thirdPerson", label: "3rd Person" },
] as const;

export type SettingsTabId = (typeof TABS)[number]["id"];
