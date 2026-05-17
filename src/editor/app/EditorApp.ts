import { terrainConfig, type TerrainConfig } from "@config/terrain";
import { vegetationRenderConfig } from "@config/vegetation";
import { getPlatform } from "@/platform";
import { GameApp, type GameBootPhase } from "@game/app";
import type { EditorAppSession } from "./types";
import { BrushIndicatorSystem, type EditorBrushInfo, type ActiveEditorType } from "@editor/runtime/common";
import { EditorCommandHistory, type EditorHistoryState } from "@editor/runtime/history/EditorCommandHistory";
import { TerrainEditor } from "@editor/runtime/terrain/TerrainEditor";
import type { BrushStroke, EditorCameraAction } from "@editor/runtime/terrain/TerrainEditor";
import { TextureEditor } from "@editor/runtime/texture/TextureEditor";
import { VegetationEditor } from "@editor/runtime/vegetation/VegetationEditor";
import { WorldObjectOverlay } from "@editor/runtime/world-objects";
import { TerrainTextureArrays } from "@game/world/terrain/TerrainTextureArrays";
import type { TerrainHeightPageSnapshot } from "@game/world/terrain/terrain";
import { getHeightPageKeys, parsePageKey, type MapData } from "@project/MapData";
import type { VegetationMapData } from "@game/world/vegetation";
import {
  applyEditorSettingsPatch,
  cloneEditorSettings,
  createDefaultEditorSettings,
  setEditorSettings,
  type EditorAppSettings,
  type EditorAppSettingsPatch,
  type EditorSettings,
} from "@editor/settings";

const platform = getPlatform();

// EN: Editor orbit navigation needs a wider streamed terrain footprint than gameplay spawn-side streaming.
// 中文: 编辑器轨道导航需要比游戏出生点流式加载更大的地形覆盖范围。
const editorTerrainConfig: TerrainConfig = {
  ...terrainConfig,
  streaming: {
    ...terrainConfig.streaming,
    viewDistancePages: 8,
    hysteresisPages: 2,
    maxPageOpsPerFrame: 3,
  },
  lod: {
    ...terrainConfig.lod,
    // EN: Use one fixed editor tessellation level to avoid T-junction cracks without paying 64-segment cost for every visible page.
    // 中文: 编辑器使用单一固定细分级别，避免 T-junction 裂缝，同时不让每个可见 page 都承担 64 段成本。
    levels: [{ segmentsPerSide: terrainConfig.lod.levels[1].segmentsPerSide, maxDistanceMeters: Infinity }],
  },
};

interface TerrainBrushStrokeSession {
  beforePages: Map<string, Float32Array>;
  pageKeys: Set<string>;
  changed: boolean;
}

export class EditorApp extends GameApp implements EditorAppSession {
  private readonly editorSettings = createDefaultEditorSettings();
  private readonly terrainEditor = new TerrainEditor(editorTerrainConfig);
  private readonly textureEditor = new TextureEditor();
  private readonly vegetationEditor = new VegetationEditor(this.vegetationScene);
  private readonly worldObjectOverlay = new WorldObjectOverlay();
  private readonly brushIndicator = new BrushIndicatorSystem();
  private readonly history = new EditorCommandHistory();
  private readonly terrainBrushQueue: BrushStroke[][] = [];
  private activeEditorType: ActiveEditorType = null;
  private activeTerrainStroke: TerrainBrushStrokeSession | null = null;
  private terrainBrushApplyPromise: Promise<void> | null = null;
  private terrainHistoryFlushPromise: Promise<void> | null = null;
  private terrainCommandPlaybackInProgress = false;
  private lastWorldObjectTerrainRevision = -1;

  private getProjectDirectoryFromMapDirectory(mapDirectory: string): string {
    return mapDirectory.replace(/[\\/]maps[\\/][^\\/]+$/, "");
  }

  constructor(container: HTMLElement, onBootPhase?: (phase: GameBootPhase) => void) {
    super(container, onBootPhase, {
      gameplayEnabled: false,
      terrainConfig: editorTerrainConfig,
    });

    // EN: Editor overlays must follow terrain page residency so streamed-out pages do not leave floating content behind.
    // 中文: 编辑器叠加内容必须跟随地形 page 驻留状态，避免已卸载区域残留悬空内容。
    this.vegetationScene.setTerrainAvailability((x, z) => this.resources.runtime.terrain.hasRenderablePageAt(x, z));
    this.vegetationScene.configureVisibility(vegetationRenderConfig.editor);
    this.worldObjectOverlay.setTerrainAvailability((x, z) => this.resources.runtime.terrain.hasRenderablePageAt(x, z));
    this.worldObjectOverlay.attach(this.scene);
    this.brushIndicator.attach(this.scene);
    this.textureEditor.setCommandRecorder((command) => this.history.record(command));
    this.vegetationEditor.setCommandRecorder((command) => this.history.record(command));
    this.terrainEditor.setMode("edit");
  }

  override getPlayerPosition(): null {
    return null;
  }

  getTerrainEditor(): TerrainEditor {
    return this.terrainEditor;
  }

  getTextureEditor(): TextureEditor {
    return this.textureEditor;
  }

  getVegetationEditor(): VegetationEditor {
    return this.vegetationEditor;
  }

  getEditorHistoryState(): EditorHistoryState {
    return this.history.getState();
  }

  async flushPendingEditorCommands(): Promise<void> {
    this.endActiveBrushes();
    await this.flushPendingTerrainHistory();
    await this.textureEditor.flushPendingHistory();
    this.vegetationEditor.flushPendingHistory();
  }

  async undoEditorCommand(): Promise<boolean> {
    await this.flushPendingEditorCommands();
    return this.history.undo();
  }

  async redoEditorCommand(): Promise<boolean> {
    await this.flushPendingEditorCommands();
    return this.history.redo();
  }

  setActiveEditorType(type: ActiveEditorType): void {
    this.activeEditorType = type;
    if (type) {
      this.brushIndicator.setActiveEditor(type);
      return;
    }

    this.brushIndicator.hide();
  }

  startEditorCameraAction(
    action: EditorCameraAction,
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    this.applyEditorCameraState();
    this.terrainEditor.startCameraAction(
      action,
      mouseX,
      mouseY,
      viewportWidth,
      viewportHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  updateEditorCameraControl(mouseX: number, mouseY: number, viewportWidth: number, viewportHeight: number): void {
    this.terrainEditor.updateCameraControl(
      mouseX,
      mouseY,
      viewportWidth,
      viewportHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  zoomEditorCamera(delta: number): void {
    this.terrainEditor.zoomCamera(delta);
    this.applyEditorCameraState();
  }

  updateEditorBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.terrainEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  updateTextureBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.textureEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  updateVegetationBrushTarget(mouseX: number, mouseY: number): void {
    const canvas = this.gameRenderer.domElement;
    this.vegetationEditor.updateBrushTarget(
      mouseX,
      mouseY,
      canvas.clientWidth,
      canvas.clientHeight,
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  async loadTexturesFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    await this.textureEditor.loadFromMapDirectory(mapDirectory, mapData);
    const textureDef = this.textureEditor.textureDefinition;
    const projectDirectory = this.getProjectDirectoryFromMapDirectory(mapDirectory);
    const textureArrays = await TerrainTextureArrays.getInstance().loadFromDefinition(projectDirectory, textureDef);
    const splatMapTextures = this.textureEditor.getAllSplatTextures();
    this.resources.runtime.terrain.setTextureData(textureArrays, splatMapTextures);
    await this.skySystem.loadStarTexture(
      projectDirectory,
      platform.files.readBinaryBase64,
    );
  }

  async saveTexturesToMapDirectory(mapDirectory: string, mapData: MapData): Promise<void> {
    await this.textureEditor.saveToMapDirectory(mapDirectory, mapData);
  }

  override async loadVegetationFromMapDirectory(
    mapDirectory: string,
    vegetationDataOrMapData?: VegetationMapData | MapData | null,
  ): Promise<void> {
    const mapData = vegetationDataOrMapData && "heightPageKeys" in vegetationDataOrMapData
      ? vegetationDataOrMapData
      : null;
    await this.vegetationEditor.loadFromMapDirectory(mapDirectory, mapData);
  }

  async saveVegetationToMapDirectory(mapDirectory: string): Promise<void> {
    await this.vegetationEditor.saveToMapDirectory(mapDirectory);
  }

  async loadWorldObjectsFromMapDirectory(mapDirectory: string, mapData?: MapData | null): Promise<void> {
    await this.worldObjectOverlay.loadFromMapDirectory(mapDirectory, mapData);
  }

  protected override async initRuntimeExtensions(): Promise<void> {
    const splatWorldSize = terrainConfig.worldBounds.halfSizeMeters * 2;
    await this.textureEditor.init(this.renderer, splatWorldSize);
    this.frameEditorCameraAt(0, 0, terrainConfig.streaming.pageSizeMeters * 4);
  }

  override getSettingsSnapshot(): EditorAppSettings {
    this.syncEditorSettingsSnapshot(this.editorSettings);

    return {
      ...super.getSettingsSnapshot(),
      editor: cloneEditorSettings(this.editorSettings),
    };
  }

  override updateSettings(patch: EditorAppSettingsPatch): void {
    const { editor, ...gamePatch } = patch;
    super.updateSettings(gamePatch);

    if (editor) {
      applyEditorSettingsPatch(this.editorSettings, editor);
      this.applyEditorSettingsToRuntime();
    }
  }

  override applySettings(newSettings: EditorAppSettings): void {
    const { editor, ...gameSettings } = newSettings;
    super.applySettings(gameSettings);
    setEditorSettings(this.editorSettings, editor);
    this.applyEditorSettingsToRuntime();
  }

  override resetSettings(): void {
    super.resetSettings();
    setEditorSettings(this.editorSettings, createDefaultEditorSettings());
    this.applyEditorSettingsToRuntime();
  }

  private syncEditorSettingsSnapshot(settings: EditorSettings): void {
    const mouseConfig = this.terrainEditor.mouseConfig;
    settings.leftButton = mouseConfig.leftButton;
    settings.rightButton = mouseConfig.rightButton;
    settings.middleButton = mouseConfig.middleButton;
    settings.stickyDrag = this.terrainEditor.stickyDrag;
  }

  private applyEditorSettingsToRuntime(): void {
    this.terrainEditor.setMouseConfig({
      leftButton: this.editorSettings.leftButton,
      rightButton: this.editorSettings.rightButton,
      middleButton: this.editorSettings.middleButton,
    });
    this.terrainEditor.setStickyDrag(this.editorSettings.stickyDrag);
  }

  protected override getMousePositionInternal(): { x: number; y: number; z: number; valid: boolean } | null {
    if (this.terrainEditor.brushTargetValid) {
      const x = this.terrainEditor.brushTargetX;
      const z = this.terrainEditor.brushTargetZ;
      const y = this.resources.runtime.terrain.heightAt(x, z);
      return { x, y, z, valid: true };
    }

    if (this.textureEditor.brushTargetValid) {
      const x = this.textureEditor.brushTargetX;
      const z = this.textureEditor.brushTargetZ;
      const y = this.resources.runtime.terrain.heightAt(x, z);
      return { x, y, z, valid: true };
    }

    if (this.vegetationEditor.brushTargetValid) {
      const x = this.vegetationEditor.brushTargetX;
      const z = this.vegetationEditor.brushTargetZ;
      const y = this.resources.runtime.terrain.heightAt(x, z);
      return { x, y, z, valid: true };
    }

    return { x: 0, y: 0, z: 0, valid: false };
  }

  protected override async afterLoadMapData(mapData: MapData): Promise<void> {
    this.history.clear();
    this.terrainEditor.loadMapData(mapData);
    this.frameEditorCameraForMap(mapData);
  }

  protected override runSimulationStep(): void {
    this.applyEditorCameraState();
  }

  protected override afterFrame(dt: number): void {
    if (!this.terrainCommandPlaybackInProgress) {
      this.terrainEditor.applyBrush(dt);
      const strokes = this.terrainEditor.consumePendingStrokes();
      if (strokes.length > 0) {
        this.enqueueTerrainBrushStrokes(strokes);
      }
      if (!this.terrainEditor.brushActive) {
        this.scheduleTerrainHistoryFlush();
      }
    }

    void this.textureEditor.applyBrush(dt);
    this.vegetationEditor.applyBrush(
      dt,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
    this.syncWorldObjectTerrainVisibility();
    this.updateBrushIndicator();
  }

  private syncWorldObjectTerrainVisibility(): void {
    const revision = this.resources.runtime.terrain.getStreamingRevision();
    if (revision === this.lastWorldObjectTerrainRevision) {
      return;
    }

    this.lastWorldObjectTerrainRevision = revision;
    this.worldObjectOverlay.updateTerrainVisibility();
  }

  protected override resolveTerrainUpdateTarget(): { x: number; z: number } | null {
    const target = this.terrainEditor.getCameraTarget();
    return { x: target.x, z: target.z };
  }

  protected override beforeDispose(): void {
    this.textureEditor.setCommandRecorder(null);
    this.vegetationEditor.setCommandRecorder(null);
    this.terrainBrushQueue.length = 0;
    this.activeTerrainStroke = null;
    this.history.clear();
    this.terrainEditor.dispose();
    this.textureEditor.dispose();
    this.vegetationEditor.dispose();
    this.worldObjectOverlay.dispose();
    this.brushIndicator.dispose();
  }

  private enqueueTerrainBrushStrokes(strokes: readonly BrushStroke[]): void {
    this.terrainBrushQueue.push(strokes.map(cloneTerrainBrushStroke));
    this.ensureTerrainBrushQueueProcessing();
  }

  private ensureTerrainBrushQueueProcessing(): void {
    if (this.terrainBrushApplyPromise) {
      return;
    }

    const applyPromise = this.processTerrainBrushQueue();
    this.terrainBrushApplyPromise = applyPromise;
    void applyPromise.finally(() => {
      if (this.terrainBrushApplyPromise === applyPromise) {
        this.terrainBrushApplyPromise = null;
      }
    });
  }

  private async processTerrainBrushQueue(): Promise<void> {
    while (this.terrainBrushQueue.length > 0) {
      const strokes = this.terrainBrushQueue.shift();
      if (strokes) {
        await this.applyTerrainBrushStrokeBatch(strokes);
      }
    }
  }

  private async applyTerrainBrushStrokeBatch(strokes: readonly BrushStroke[]): Promise<void> {
    const beforeSnapshot = this.resources.runtime.terrain.captureBrushHeightPageSnapshot(strokes);
    if (beforeSnapshot.pages.length === 0) {
      return;
    }

    const session = this.ensureTerrainStrokeSession();
    for (const page of beforeSnapshot.pages) {
      if (!session.beforePages.has(page.key)) {
        session.beforePages.set(page.key, new Float32Array(page.heights));
      }
      session.pageKeys.add(page.key);
    }

    await this.resources.runtime.terrain.applyBrushStrokes(strokes.map(cloneTerrainBrushStroke));
    session.changed = true;
  }

  private ensureTerrainStrokeSession(): TerrainBrushStrokeSession {
    if (!this.activeTerrainStroke) {
      this.activeTerrainStroke = {
        beforePages: new Map<string, Float32Array>(),
        pageKeys: new Set<string>(),
        changed: false,
      };
    }

    return this.activeTerrainStroke;
  }

  private scheduleTerrainHistoryFlush(): void {
    if (!this.hasPendingTerrainHistory()) {
      return;
    }

    void this.startTerrainHistoryFlush();
  }

  private async flushPendingTerrainHistory(): Promise<void> {
    if (this.terrainHistoryFlushPromise) {
      await this.terrainHistoryFlushPromise;
      return;
    }

    if (!this.hasPendingTerrainHistory()) {
      return;
    }

    await this.startTerrainHistoryFlush();
  }

  private hasPendingTerrainHistory(): boolean {
    return this.activeTerrainStroke !== null
      || this.terrainBrushQueue.length > 0
      || this.terrainBrushApplyPromise !== null;
  }

  private startTerrainHistoryFlush(): Promise<void> {
    if (this.terrainHistoryFlushPromise) {
      return this.terrainHistoryFlushPromise;
    }

    const flushPromise = this.finishTerrainStrokeAfterPendingWork();
    this.terrainHistoryFlushPromise = flushPromise;
    void flushPromise.finally(() => {
      if (this.terrainHistoryFlushPromise === flushPromise) {
        this.terrainHistoryFlushPromise = null;
      }
    });
    return flushPromise;
  }

  private async finishTerrainStrokeAfterPendingWork(): Promise<void> {
    while (this.terrainBrushQueue.length > 0 || this.terrainBrushApplyPromise) {
      this.ensureTerrainBrushQueueProcessing();
      if (this.terrainBrushApplyPromise) {
        await this.terrainBrushApplyPromise;
      }
    }

    this.finishTerrainStroke();
  }

  private finishTerrainStroke(): void {
    const session = this.activeTerrainStroke;
    this.activeTerrainStroke = null;
    if (!session?.changed || session.pageKeys.size === 0) {
      return;
    }

    const afterSnapshot = this.resources.runtime.terrain.captureHeightPageSnapshot(Array.from(session.pageKeys));
    const beforeSnapshot: TerrainHeightPageSnapshot = {
      pages: afterSnapshot.pages.flatMap((page) => {
        const heights = session.beforePages.get(page.key);
        return heights ? [{ key: page.key, heights: new Float32Array(heights) }] : [];
      }),
    };

    if (!this.hasTerrainSnapshotChanges(beforeSnapshot, afterSnapshot)) {
      return;
    }

    this.history.record({
      label: "Terrain height stroke",
      undo: () => this.applyTerrainHeightSnapshot(beforeSnapshot),
      redo: () => this.applyTerrainHeightSnapshot(afterSnapshot),
    });
  }

  private async applyTerrainHeightSnapshot(snapshot: TerrainHeightPageSnapshot): Promise<void> {
    this.terrainCommandPlaybackInProgress = true;
    try {
      await this.resources.runtime.terrain.applyHeightPageSnapshot(snapshot);
      this.terrainEditor.markDirty();
    } finally {
      this.terrainCommandPlaybackInProgress = false;
    }
  }

  private hasTerrainSnapshotChanges(
    beforeSnapshot: TerrainHeightPageSnapshot,
    afterSnapshot: TerrainHeightPageSnapshot,
  ): boolean {
    if (beforeSnapshot.pages.length !== afterSnapshot.pages.length) {
      return true;
    }

    for (let pageIndex = 0; pageIndex < beforeSnapshot.pages.length; pageIndex += 1) {
      const beforePage = beforeSnapshot.pages[pageIndex];
      const afterPage = afterSnapshot.pages[pageIndex];
      if (beforePage.key !== afterPage.key || beforePage.heights.length !== afterPage.heights.length) {
        return true;
      }

      for (let heightIndex = 0; heightIndex < beforePage.heights.length; heightIndex += 1) {
        if (beforePage.heights[heightIndex] !== afterPage.heights[heightIndex]) {
          return true;
        }
      }
    }

    return false;
  }

  private endActiveBrushes(): void {
    this.terrainEditor.endBrush();
    this.textureEditor.endBrush();
    this.vegetationEditor.endBrush();
  }

  private frameEditorCameraForMap(mapData: MapData): void {
    const frame = this.resolveMapCameraFrame(mapData);
    this.frameEditorCameraAt(frame.x, frame.z, frame.radius);
  }

  private frameEditorCameraAt(x: number, z: number, radius: number): void {
    // EN: The editor has no player, so the camera must frame terrain from map data instead of spawn state.
    // 中文: 编辑器没有玩家，因此相机必须根据地图数据构图，而不是依赖出生状态。
    const y = this.resources.runtime.terrain.heightAt(x, z);
    this.terrainEditor.frameCameraAt(x, y, z, radius);
    this.applyEditorCameraState();
  }

  private applyEditorCameraState(): void {
    this.terrainEditor.applyCameraState(
      this.camera,
      this.resources.runtime.terrain.heightAt,
      this.resources.runtime.terrain.hasHeightAt,
    );
  }

  private resolveMapCameraFrame(mapData: MapData): { x: number; z: number; radius: number } {
    const keys = getHeightPageKeys(mapData);
    if (keys.length === 0) {
      return { x: 0, z: 0, radius: terrainConfig.streaming.pageSizeMeters * 4 };
    }

    let minPageX = Number.POSITIVE_INFINITY;
    let maxPageX = Number.NEGATIVE_INFINITY;
    let minPageZ = Number.POSITIVE_INFINITY;
    let maxPageZ = Number.NEGATIVE_INFINITY;

    for (const key of keys) {
      const { px, pz } = parsePageKey(key);
      minPageX = Math.min(minPageX, px);
      maxPageX = Math.max(maxPageX, px);
      minPageZ = Math.min(minPageZ, pz);
      maxPageZ = Math.max(maxPageZ, pz);
    }

    const pageSize = mapData.pageSizeMeters;
    const spanX = (maxPageX - minPageX + 1) * pageSize;
    const spanZ = (maxPageZ - minPageZ + 1) * pageSize;
    const x = ((minPageX + maxPageX + 1) * pageSize) / 2;
    const z = ((minPageZ + maxPageZ + 1) * pageSize) / 2;
    const radius = Math.max(terrainConfig.streaming.pageSizeMeters * 4, Math.hypot(spanX, spanZ) * 0.45);

    return { x, z, radius };
  }

  private updateBrushIndicator(): void {
    if (!this.activeEditorType) {
      this.brushIndicator.hide();
      return;
    }

    const heightAt = this.resources.runtime.terrain.heightAt;
    let brushInfo: EditorBrushInfo | null = null;

    switch (this.activeEditorType) {
      case "terrain":
        if (this.terrainEditor.brushTargetValid) {
          brushInfo = {
            targetValid: true,
            targetX: this.terrainEditor.brushTargetX,
            targetZ: this.terrainEditor.brushTargetZ,
            radius: this.terrainEditor.brushSettings.radiusMeters,
            falloff: this.terrainEditor.brushSettings.falloff,
            strength: this.terrainEditor.brushSettings.strength,
            active: this.terrainEditor.brushActive,
          };
        }
        break;

      case "texture":
        if (this.textureEditor.brushTargetValid) {
          brushInfo = {
            targetValid: true,
            targetX: this.textureEditor.brushTargetX,
            targetZ: this.textureEditor.brushTargetZ,
            radius: this.textureEditor.brushSettings.radius,
            falloff: this.textureEditor.brushSettings.falloff,
            strength: this.textureEditor.brushSettings.strength,
            active: this.textureEditor.brushActive,
          };
        }
        break;

      case "vegetation":
        if (this.vegetationEditor.brushTargetValid) {
          brushInfo = {
            targetValid: true,
            targetX: this.vegetationEditor.brushTargetX,
            targetZ: this.vegetationEditor.brushTargetZ,
            radius: this.vegetationEditor.brushSettings.radius,
            falloff: 0.5,
            strength: this.vegetationEditor.brushSettings.mode === "erase" ? 0.85 : 0.45,
            active: this.vegetationEditor.brushActive,
          };
        }
        break;
    }

    this.brushIndicator.update(brushInfo, heightAt);
  }
}

function cloneTerrainBrushStroke(stroke: BrushStroke): BrushStroke {
  return {
    worldX: stroke.worldX,
    worldZ: stroke.worldZ,
    brush: { ...stroke.brush },
    dt: stroke.dt,
  };
}