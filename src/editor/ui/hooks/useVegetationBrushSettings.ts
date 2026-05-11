import { useEffect, useState } from "react";
import type { VegetationBrushMode, VegetationModelDefinition, VegetationModelStats } from "@game/world/vegetation";
import type { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";

export interface VegetationBrushSettingsState {
  brushMode: VegetationBrushMode;
  brushRadius: number;
  densityPerSecond: number;
  scaleMin: number;
  scaleMax: number;
  selectedModelId: string;
  selectedTargetHeight: number;
  selectedLod1Path: string;
  selectedLod1Distance: number;
  selectedLod2Path: string;
  selectedLod2Distance: number;
  selectedMaxVisibleDistance: number;
  selectedShadowDistance: number;
  selectedModelStats: VegetationModelStats | null;
  models: readonly VegetationModelDefinition[];
  instanceCount: number;
  setBrushMode: (mode: VegetationBrushMode) => void;
  setBrushRadius: (value: number) => void;
  setDensityPerSecond: (value: number) => void;
  setScaleMin: (value: number) => void;
  setScaleMax: (value: number) => void;
  setSelectedModel: (modelId: string) => void;
  setSelectedTargetHeight: (value: number) => void;
  setSelectedLod1Path: (path: string) => void;
  setSelectedLod1Distance: (value: number) => void;
  setSelectedLod2Path: (path: string) => void;
  setSelectedLod2Distance: (value: number) => void;
  setSelectedMaxVisibleDistance: (value: number) => void;
  setSelectedShadowDistance: (value: number) => void;
  addModel: (path: string, name: string) => void;
  refresh: () => void;
}

export function useVegetationBrushSettings(
  editor: VegetationEditor | null,
): VegetationBrushSettingsState {
  const [brushMode, setBrushModeState] = useState<VegetationBrushMode>("place");
  const [brushRadius, setBrushRadiusState] = useState(6);
  const [densityPerSecond, setDensityPerSecondState] = useState(8);
  const [scaleMin, setScaleMinState] = useState(0.85);
  const [scaleMax, setScaleMaxState] = useState(1.15);
  const [selectedModelId, setSelectedModelIdState] = useState("");
  const [selectedTargetHeight, setSelectedTargetHeightState] = useState(8);
  const [selectedLod1Path, setSelectedLod1PathState] = useState("");
  const [selectedLod1Distance, setSelectedLod1DistanceState] = useState(70);
  const [selectedLod2Path, setSelectedLod2PathState] = useState("");
  const [selectedLod2Distance, setSelectedLod2DistanceState] = useState(130);
  const [selectedMaxVisibleDistance, setSelectedMaxVisibleDistanceState] = useState(220);
  const [selectedShadowDistance, setSelectedShadowDistanceState] = useState(55);
  const [selectedModelStats, setSelectedModelStats] = useState<VegetationModelStats | null>(null);
  const [models, setModels] = useState<readonly VegetationModelDefinition[]>([]);
  const [instanceCount, setInstanceCount] = useState(0);

  const updateFromEditor = (currentEditor: VegetationEditor | null) => {
    if (!currentEditor) {
      setSelectedModelIdState("");
      setSelectedTargetHeightState(8);
      setSelectedLod1PathState("");
      setSelectedLod1DistanceState(70);
      setSelectedLod2PathState("");
      setSelectedLod2DistanceState(130);
      setSelectedMaxVisibleDistanceState(220);
      setSelectedShadowDistanceState(55);
      setSelectedModelStats(null);
      setModels([]);
      setInstanceCount(0);
      return;
    }

    const settings = currentEditor.brushSettings;
    const selectedModel = currentEditor.selectedModel;
    setBrushModeState(settings.mode);
    setBrushRadiusState(settings.radius);
    setDensityPerSecondState(settings.densityPerSecond);
    setScaleMinState(settings.scaleMin);
    setScaleMaxState(settings.scaleMax);
    setSelectedModelIdState(currentEditor.currentSelectedModelId);
    setSelectedTargetHeightState(selectedModel?.targetHeightMeters ?? 8);
    setSelectedLod1PathState(selectedModel?.lod1Path ?? "");
    setSelectedLod1DistanceState(selectedModel?.lod1DistanceMeters ?? 70);
    setSelectedLod2PathState(selectedModel?.lod2Path ?? "");
    setSelectedLod2DistanceState(selectedModel?.lod2DistanceMeters ?? 130);
    setSelectedMaxVisibleDistanceState(selectedModel?.maxVisibleDistanceMeters ?? 220);
    setSelectedShadowDistanceState(selectedModel?.shadowDistanceMeters ?? 55);
    setSelectedModelStats(currentEditor.selectedModelStats);
    setModels(currentEditor.modelDefinitions);
    setInstanceCount(currentEditor.instanceCount);
  };

  const refresh = () => {
    updateFromEditor(editor);
  };

  useEffect(() => {
    updateFromEditor(editor);
    return editor?.subscribe(() => updateFromEditor(editor));
  }, [editor]);

  const setBrushMode = (mode: VegetationBrushMode) => {
    setBrushModeState(mode);
    editor?.setBrushMode(mode);
  };

  const setBrushRadius = (value: number) => {
    setBrushRadiusState(value);
    editor?.setBrushRadius(value);
  };

  const setDensityPerSecond = (value: number) => {
    setDensityPerSecondState(value);
    editor?.setDensityPerSecond(value);
  };

  const setScaleMin = (value: number) => {
    setScaleMinState(value);
    editor?.setScaleMin(value);
    refresh();
  };

  const setScaleMax = (value: number) => {
    setScaleMaxState(value);
    editor?.setScaleMax(value);
    refresh();
  };

  const setSelectedModel = (modelId: string) => {
    editor?.setSelectedModel(modelId);
    refresh();
  };

  const setSelectedTargetHeight = (value: number) => {
    setSelectedTargetHeightState(value);
    editor?.setSelectedModelTargetHeight(value);
  };

  const setSelectedLod1Path = (path: string) => {
    setSelectedLod1PathState(path);
    editor?.setSelectedModelLod1Path(path);
  };

  const setSelectedLod1Distance = (value: number) => {
    setSelectedLod1DistanceState(value);
    editor?.setSelectedModelLod1Distance(value);
  };

  const setSelectedLod2Path = (path: string) => {
    setSelectedLod2PathState(path);
    editor?.setSelectedModelLod2Path(path);
  };

  const setSelectedLod2Distance = (value: number) => {
    setSelectedLod2DistanceState(value);
    editor?.setSelectedModelLod2Distance(value);
  };

  const setSelectedMaxVisibleDistance = (value: number) => {
    setSelectedMaxVisibleDistanceState(value);
    editor?.setSelectedModelMaxVisibleDistance(value);
  };

  const setSelectedShadowDistance = (value: number) => {
    setSelectedShadowDistanceState(value);
    editor?.setSelectedModelShadowDistance(value);
  };

  const addModel = (path: string, name: string) => {
    editor?.addModel(path, name);
    refresh();
  };

  return {
    brushMode,
    brushRadius,
    densityPerSecond,
    scaleMin,
    scaleMax,
    selectedModelId,
    selectedTargetHeight,
    selectedLod1Path,
    selectedLod1Distance,
    selectedLod2Path,
    selectedLod2Distance,
    selectedMaxVisibleDistance,
    selectedShadowDistance,
    selectedModelStats,
    models,
    instanceCount,
    setBrushMode,
    setBrushRadius,
    setDensityPerSecond,
    setScaleMin,
    setScaleMax,
    setSelectedModel,
    setSelectedTargetHeight,
    setSelectedLod1Path,
    setSelectedLod1Distance,
    setSelectedLod2Path,
    setSelectedLod2Distance,
    setSelectedMaxVisibleDistance,
    setSelectedShadowDistance,
    addModel,
    refresh,
  };
}