import { useEffect, useState } from "react";
import type { BrushType, TerrainEditor } from "@game/editor";

export interface TerrainBrushSettingsState {
  brushType: BrushType;
  brushRadius: number;
  brushStrength: number;
  brushFalloff: number;
  setBrushType: (type: BrushType) => void;
  setBrushRadius: (value: number) => void;
  setBrushStrength: (value: number) => void;
  setBrushFalloff: (value: number) => void;
}

export function useTerrainBrushSettings(
  editor: TerrainEditor | null,
): TerrainBrushSettingsState {
  const [brushType, setBrushTypeState] = useState<BrushType>("raise");
  const [brushRadius, setBrushRadiusState] = useState(10);
  const [brushStrength, setBrushStrengthState] = useState(0.5);
  const [brushFalloff, setBrushFalloffState] = useState(0.7);

  useEffect(() => {
    if (!editor) return;

    const brush = editor.brushSettings;
    setBrushTypeState(brush.type);
    setBrushRadiusState(brush.radiusMeters);
    setBrushStrengthState(brush.strength);
    setBrushFalloffState(brush.falloff);
  }, [editor]);

  const setBrushType = (type: BrushType) => {
    setBrushTypeState(type);
    editor?.setBrushType(type);
  };

  const setBrushRadius = (value: number) => {
    setBrushRadiusState(value);
    editor?.setBrushRadius(value);
  };

  const setBrushStrength = (value: number) => {
    setBrushStrengthState(value);
    editor?.setBrushStrength(value);
  };

  const setBrushFalloff = (value: number) => {
    setBrushFalloffState(value);
    editor?.setBrushFalloff(value);
  };

  return {
    brushType,
    brushRadius,
    brushStrength,
    brushFalloff,
    setBrushType,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  };
}