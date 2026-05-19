import { useEffect, useState } from "react";
import {
  Camera,
  CircleHelp,
  Clock3,
  CloudSun,
  Footprints,
  Gauge,
  Radar,
  Monitor,
  Palette,
  UserRound,
} from "lucide-react";
import type { GameApp } from "@game/app";
import type { GameSettings, GameSettingsPatch } from "@game/settings";
import {
  HelpTab,
  AppearanceTab,
  RenderTab,
  CameraTab,
  SkyTab,
  TimeTab,
  MovementTab,
  PhysicsTab,
  DebugTab,
  ThirdPersonTab,
} from "./tabs";
import { SettingsPanelFrame } from "./SettingsPanelFrame";

const GAME_SETTINGS_TABS = [
  { id: "help", label: "Help", Icon: CircleHelp },
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "render", label: "Render", Icon: Monitor },
  { id: "camera", label: "Camera", Icon: Camera },
  { id: "time", label: "Time", Icon: Clock3 },
  { id: "sky", label: "Sky", Icon: CloudSun },
  { id: "movement", label: "Movement", Icon: Footprints },
  { id: "physics", label: "Physics", Icon: Gauge },
  { id: "thirdPerson", label: "3rd Person", Icon: UserRound },
  { id: "debug", label: "Debug", Icon: Radar },
] as const;

type GameSettingsTabId = (typeof GAME_SETTINGS_TABS)[number]["id"];

type GameSettingsPanelProps = {
  open: boolean;
  settings: GameSettings;
  gameApp: GameApp | null;
  onPatch: (patch: GameSettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
};

export function GameSettingsPanel({
  open,
  settings,
  gameApp,
  onPatch,
  onReset,
  onClose,
}: GameSettingsPanelProps) {
  const [tab, setTab] = useState<GameSettingsTabId>("help");

  useEffect(() => {
    if (!GAME_SETTINGS_TABS.some((entry) => entry.id === tab)) {
      setTab("help");
    }
  }, [tab]);

  const renderTab = () => {
    switch (tab) {
      case "help":
        return <HelpTab />;
      case "appearance":
        return <AppearanceTab settings={settings} onPatch={onPatch} />;
      case "render":
        return <RenderTab settings={settings} onPatch={onPatch} />;
      case "camera":
        return <CameraTab settings={settings} onPatch={onPatch} />;
      case "time":
        return <TimeTab settings={settings} onPatch={onPatch} />;
      case "sky":
        return <SkyTab settings={settings} onPatch={onPatch} />;
      case "movement":
        return <MovementTab settings={settings} onPatch={onPatch} />;
      case "physics":
        return <PhysicsTab settings={settings} onPatch={onPatch} />;
      case "thirdPerson":
        return <ThirdPersonTab settings={settings} onPatch={onPatch} />;
      case "debug":
        return <DebugTab settings={settings} onPatch={onPatch} />;
      default:
        return <HelpTab />;
    }
  };

  return (
    <SettingsPanelFrame
      open={open}
      title="Game Settings"
      subtitle={gameApp ? "Applies immediately" : "Runtime unavailable"}
      tabs={GAME_SETTINGS_TABS}
      activeTab={tab}
      variant="sidebar"
      onTabChange={setTab}
      onReset={onReset}
      onClose={onClose}
    >
      {renderTab()}
    </SettingsPanelFrame>
  );
}