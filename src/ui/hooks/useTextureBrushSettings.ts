import { useEffect, useState } from "react";
import type { TextureEditor } from "@game/editor/texture/TextureEditor";

export interface TextureBrushSettingsState {
  selectedLayer: string;
  brushRadius: number;
  brushStrength: number;
  brushFalloff: number;
  setSelectedLayer: (layer: string) => void;
  setBrushRadius: (value: number) => void;
  setBrushStrength: (value: number) => void;
  setBrushFalloff: (value: number) => void;
}

export function useTextureBrushSettings(
  editor: TextureEditor | null,
): TextureBrushSettingsState {
  const [selectedLayer, setSelectedLayerState] = useState("");
  const [brushRadius, setBrushRadiusState] = useState(20);
  const [brushStrength, setBrushStrengthState] = useState(0.5);
  const [brushFalloff, setBrushFalloffState] = useState(0.5);

  useEffect(() => {
    if (!editor) return;

    const brush = editor.brushSettings;
    setSelectedLayerState(brush.selectedLayer);
    setBrushRadiusState(brush.radius);
    setBrushStrengthState(brush.strength);
    setBrushFalloffState(brush.falloff);
  }, [editor]);

  const setSelectedLayer = (layer: string) => {
    setSelectedLayerState(layer);
    editor?.setSelectedLayer(layer);
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
    selectedLayer,
    brushRadius,
    brushStrength,
    brushFalloff,
    setSelectedLayer,
    setBrushRadius,
    setBrushStrength,
    setBrushFalloff,
  };
}

export {
  useTextureBrushSettings as default,
} from "../editor/hooks/useTextureBrushSettings";