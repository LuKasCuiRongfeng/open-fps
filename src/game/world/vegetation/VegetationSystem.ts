// VegetationSystem: GPU-driven vegetation rendering system.
// VegetationSystem：GPU 驱动的植被渲染系统
//
// GPU-first design:
// - Density map painted by VegetationEditor (GPU compute shader)
// - Instance spawning: GPU compute shader (VegetationSpawnCompute)
// - Instance count: Indirect draw (no CPU readback)
// - Rendering: GPU instanced indirect draw
// GPU-first 设计：
// - 密度贴图由 VegetationEditor 绘制（GPU 计算着色器）
// - 实例生成：GPU 计算着色器（VegetationSpawnCompute）
// - 实例数量：Indirect draw（无 CPU 回读）
// - 渲染：GPU 实例化间接绘制

import {
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  type Scene,
  type WebGPURenderer,
  type PerspectiveCamera,
  type DataTexture,
  type Mesh,
  type Material,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VegetationDefinition, VegetationLayerDef } from "@game/editor/vegetation/VegetationData";
import { VegetationSpawnCompute } from "./VegetationSpawnCompute";

// Maximum instances per vegetation layer.
// 每植被层最大实例数
const MAX_INSTANCES = 50000;

/**
 * Runtime data for each vegetation layer.
 * 每个植被层的运行时数据
 */
interface VegetationLayerRuntime {
  name: string;
  def: VegetationLayerDef;
  mesh: InstancedMesh | null;
  spawnCompute: VegetationSpawnCompute | null;
  loaded: boolean;
  loading: boolean;
  /** Scale factor to normalize oversized models. 归一化超大模型的缩放因子 */
  modelScale: number;
}

/**
 * VegetationSystem: manages GPU-driven vegetation rendering.
 * VegetationSystem：管理 GPU 驱动的植被渲染
 *
 * Workflow:
 * 1. Load vegetation definition from VegetationEditor
 * 2. Load GLB models for each layer
 * 3. GPU compute spawns instances based on density
 * 4. Render using InstancedMesh with indirect draw
 *
 * 工作流程：
 * 1. 从 VegetationEditor 加载植被定义
 * 2. 为每层加载 GLB 模型
 * 3. GPU 计算根据密度生成实例
 * 4. 使用带 indirect draw 的 InstancedMesh 渲染
 */
export class VegetationSystem {
  private readonly root: Group;
  private readonly gltfLoader: GLTFLoader;

  // Layer runtime data.
  // 层运行时数据
  private layers: Map<string, VegetationLayerRuntime> = new Map();

  // References.
  // 引用
  private renderer: WebGPURenderer | null = null;
  private scene: Scene | null = null;
  private densityTexture: DataTexture | null = null;
  private vegetationDefinition: VegetationDefinition | null = null;

  // World parameters.
  // 世界参数
  private worldSize = 1024;
  private worldOffsetX = -512;
  private worldOffsetZ = -512;

  // Height texture for GPU terrain sampling.
  // 用于 GPU 地形采样的高度纹理
  private heightTexture: DataTexture | null = null;
  private heightScale = 100;

  // Update timing.
  // 更新计时
  private timeSinceLastUpdate = 0;
  private lastCameraX = 0;
  private lastCameraZ = 0;
  private needsRespawn = true;
  private spawnInProgress = false;

  // Project path for asset loading.
  // 用于资源加载的项目路径
  private projectPath: string | null = null;

  constructor() {
    this.root = new Group();
    this.root.name = "vegetation-system";
    this.gltfLoader = new GLTFLoader();
  }

  /**
   * Initialize the vegetation system.
   * 初始化植被系统
   */
  async init(
    renderer: WebGPURenderer,
    scene: Scene,
    worldSize: number,
    heightTexture?: DataTexture | null,
    heightScale?: number
  ): Promise<void> {
    this.renderer = renderer;
    this.scene = scene;
    this.worldSize = worldSize;
    this.worldOffsetX = -worldSize / 2;
    this.worldOffsetZ = -worldSize / 2;
    this.heightTexture = heightTexture ?? null;
    this.heightScale = heightScale ?? 100;

    scene.add(this.root);
  }

  /**
   * Set height texture for GPU terrain sampling.
   * 设置用于 GPU 地形采样的高度纹理
   */
  setHeightTexture(texture: DataTexture | null, heightScale: number = 100): void {
    this.heightTexture = texture;
    this.heightScale = heightScale;

    // Update all layer spawn computes.
    // 更新所有层的生成计算
    for (const layer of this.layers.values()) {
      if (layer.spawnCompute) {
        layer.spawnCompute.setHeightTexture(texture, heightScale);
      }
    }
  }

  /**
   * Set vegetation definition and density texture from editor.
   * Only call this when the project is loaded or definition changes.
   * 从编辑器设置植被定义和密度纹理
   * 仅在加载项目或定义更改时调用此方法
   */
  setVegetationData(
    definition: VegetationDefinition | null,
    densityTexture: DataTexture | null,
    projectPath: string | null
  ): void {
    // Skip if same definition (avoid reloading models).
    // 如果是相同定义则跳过（避免重新加载模型）
    const definitionChanged = this.vegetationDefinition !== definition || this.projectPath !== projectPath;

    this.vegetationDefinition = definition;
    this.densityTexture = densityTexture;
    this.projectPath = projectPath;
    this.needsRespawn = true;

    // Update density texture for all layers.
    // 更新所有层的密度纹理
    for (const layer of this.layers.values()) {
      if (layer.spawnCompute && densityTexture) {
        layer.spawnCompute.setDensityTexture(densityTexture);
      }
    }

    // Only reload models if definition actually changed.
    // 仅当定义实际更改时才重新加载模型
    if (!definitionChanged) return;

    // Clear existing layers.
    // 清除现有层
    this.clearLayers();

    if (!definition) return;

    // Create runtime data for each layer.
    // 为每层创建运行时数据
    for (const [name, def] of Object.entries(definition)) {
      this.layers.set(name, {
        name,
        def,
        mesh: null,
        spawnCompute: null,
        loaded: false,
        loading: false,
        modelScale: 1.0,
      });
    }

    // Start loading models.
    // 开始加载模型
    void this.loadModels();
  }

  /**
   * Update the density texture reference (called during painting).
   * This does NOT reload models, only marks for respawn.
   * 更新密度纹理引用（绘制时调用）
   * 这不会重新加载模型，只标记需要重新生成
   */
  updateDensityTexture(densityTexture: DataTexture | null): void {
    this.densityTexture = densityTexture;
    this.needsRespawn = true;

    // Update all layer spawn computes.
    // 更新所有层的生成计算
    for (const layer of this.layers.values()) {
      if (layer.spawnCompute && densityTexture) {
        layer.spawnCompute.setDensityTexture(densityTexture);
      }
    }
  }

  /**
   * Clear all vegetation layers.
   * 清除所有植被层
   */
  private clearLayers(): void {
    for (const layer of this.layers.values()) {
      if (layer.mesh) {
        this.root.remove(layer.mesh);
        layer.mesh.geometry.dispose();
        if (Array.isArray(layer.mesh.material)) {
          layer.mesh.material.forEach((m) => m.dispose());
        } else {
          layer.mesh.material.dispose();
        }
      }
      if (layer.spawnCompute) {
        layer.spawnCompute.dispose();
      }
    }
    this.layers.clear();
  }

  /**
   * Load GLB models for all vegetation layers.
   * 为所有植被层加载 GLB 模型
   */
  private async loadModels(): Promise<void> {
    if (!this.projectPath || !this.renderer) return;

    const loadPromises: Promise<void>[] = [];

    for (const layer of this.layers.values()) {
      if (layer.loading || layer.loaded) continue;

      layer.loading = true;
      const promise = this.loadLayerModel(layer);
      loadPromises.push(promise);
    }

    await Promise.all(loadPromises);
    this.needsRespawn = true;
  }

  /**
   * Load a single layer's model and initialize its GPU spawn compute.
   * 加载单层的模型并初始化其 GPU 生成计算
   */
  private async loadLayerModel(layer: VegetationLayerRuntime): Promise<void> {
    if (!this.renderer) return;

    try {
      // Construct model path.
      // 构建模型路径
      const modelPath = await this.resolveModelPath(layer.def.model);

      console.log(`[VegetationSystem] Loading model from: ${modelPath}`);
      const gltf = await this.gltfLoader.loadAsync(modelPath);

      // Find the first mesh in the loaded model.
      // 在加载的模型中找到第一个网格
      const meshes: Mesh[] = [];
      gltf.scene.traverse((child) => {
        if ((child as Mesh).isMesh) {
          meshes.push(child as Mesh);
        }
      });

      if (meshes.length === 0) {
        console.warn(`[VegetationSystem] No mesh found in model: ${layer.def.model}`);
        layer.loading = false;
        return;
      }

      const sourceMesh = meshes[0];

      // Create instanced mesh.
      // 创建实例化网格
      const geometry = sourceMesh.geometry.clone();

      // Compute bounding sphere for proper rendering.
      // 计算边界球以正确渲染
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();

      // Calculate model scale for oversized models (don't modify geometry).
      // 计算超大模型的缩放因子（不修改几何体）
      const radius = geometry.boundingSphere?.radius ?? 1;
      const targetRadius = 2.0; // 2m radius = 4m diameter vegetation
      if (radius > 10) {
        // Model is in wrong units (likely mm or cm from export).
        // Store scale factor to apply in instance matrix.
        // 模型单位错误（可能是导出时的毫米或厘米）
        // 存储缩放因子以在实例矩阵中应用
        layer.modelScale = targetRadius / radius;
        console.log(`[VegetationSystem] Model ${layer.name} needs scale: ${layer.modelScale.toExponential(2)} (radius: ${radius.toFixed(0)}m -> target: ${targetRadius}m)`);
      } else {
        layer.modelScale = 1.0;
      }

      // Use NodeMaterial for WebGPU compatibility.
      // 使用 NodeMaterial 以兼容 WebGPU
      const material = new MeshStandardNodeMaterial();
      material.roughness = 0.8;
      material.metalness = 0.0;
      material.color.setHex(0x228b22); // Forest green / 森林绿
      material.side = 2; // DoubleSide for visibility / 双面显示以确保可见

      // Copy properties from original material if available.
      // 如果可用，从原始材质复制属性
      const origMat = sourceMesh.material;
      if (origMat && !Array.isArray(origMat)) {
        const mat = origMat as Material & { map?: unknown; color?: { r: number; g: number; b: number } };
        if (mat.map) {
          material.map = mat.map as typeof material.map;
        }
        if (mat.color) {
          material.color.setRGB(mat.color.r, mat.color.g, mat.color.b);
        }
      }

      const instancedMesh = new InstancedMesh(geometry, material, MAX_INSTANCES);
      instancedMesh.name = `vegetation-${layer.name}`;
      instancedMesh.frustumCulled = false; // We handle culling ourselves / 我们自己处理剔除
      instancedMesh.castShadow = layer.def.castShadow !== false;
      instancedMesh.receiveShadow = true;
      instancedMesh.count = 0; // Start with no instances / 从无实例开始

      // Initialize instance matrix buffer with identity.
      // 用单位矩阵初始化实例矩阵缓冲区
      const identity = new Matrix4();
      for (let i = 0; i < MAX_INSTANCES; i++) {
        instancedMesh.setMatrixAt(i, identity);
      }
      instancedMesh.instanceMatrix.needsUpdate = true;

      layer.mesh = instancedMesh;

      // Initialize GPU spawn compute for this layer.
      // 为此层初始化 GPU 生成计算
      layer.spawnCompute = new VegetationSpawnCompute();
      await layer.spawnCompute.init(this.renderer, layer.def.fadeOutDistance);

      // Set height texture if available.
      // 如果可用，设置高度纹理
      if (this.heightTexture) {
        layer.spawnCompute.setHeightTexture(this.heightTexture, this.heightScale);
      }

      // Set density texture if available.
      // 如果可用，设置密度纹理
      if (this.densityTexture) {
        layer.spawnCompute.setDensityTexture(this.densityTexture);
      }

      // Set index count for indirect draw.
      // 为 indirect draw 设置索引数量
      if (geometry.index) {
        layer.spawnCompute.setIndexCount(geometry.index.count);
      } else if (geometry.attributes.position) {
        layer.spawnCompute.setIndexCount(geometry.attributes.position.count);
      }

      // Set up indirect draw buffer on the geometry.
      // 在几何体上设置 indirect draw 缓冲区
      const indirectBuffer = layer.spawnCompute.getIndirectBuffer();
      if (indirectBuffer) {
        geometry.setIndirect(indirectBuffer);
      }

      layer.loaded = true;
      layer.loading = false;

      this.root.add(instancedMesh);

      console.log(`[VegetationSystem] Loaded model for layer: ${layer.name}, geometry vertices: ${geometry.attributes.position?.count ?? 0}, boundingSphere radius: ${geometry.boundingSphere?.radius.toFixed(2) ?? 'null'}`);
    } catch (error) {
      console.error(`[VegetationSystem] Failed to load model for layer ${layer.name}:`, error);
      layer.loading = false;
    }
  }

  /**
   * Resolve model path relative to project.
   * 解析相对于项目的模型路径
   */
  private async resolveModelPath(modelPath: string): Promise<string> {
    // If it's an absolute URL or data URL, use as-is.
    // 如果是绝对 URL 或 data URL，直接使用
    if (modelPath.startsWith("http") || modelPath.startsWith("data:")) {
      return modelPath;
    }

    // For Tauri, use convertFileSrc to properly resolve asset path.
    // 对于 Tauri，使用 convertFileSrc 正确解析资源路径
    if (this.projectPath) {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const fullPath = `${this.projectPath}/${modelPath}`;
      return convertFileSrc(fullPath);
    }

    // Fallback: relative path.
    // 回退：相对路径
    return modelPath;
  }

  /**
   * Update vegetation system each frame.
   * 每帧更新植被系统
   */
  update(dt: number, camera: PerspectiveCamera): void {
    if (!this.densityTexture || !this.renderer) return;

    this.timeSinceLastUpdate += dt;

    const cameraX = camera.position.x;
    const cameraZ = camera.position.z;

    // Check if camera moved significantly (use cell size as threshold).
    // 检查相机是否移动了足够距离（使用单元格大小作为阈值）
    const dx = cameraX - this.lastCameraX;
    const dz = cameraZ - this.lastCameraZ;
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    // Only respawn when:
    // 1. Marked dirty (brush edit)
    // 2. Camera moved more than 2m - but limit update rate
    // 仅在以下情况重新生成：
    // 1. 标记为脏（画刷编辑）
    // 2. 相机移动超过 2m - 但限制更新频率
    const shouldUpdate = (this.needsRespawn ||
      (distMoved > 2.0 && this.timeSinceLastUpdate > 0.1)) && !this.spawnInProgress;

    if (shouldUpdate) {
      void this.spawnInstancesGpu(cameraX, cameraZ);
      this.lastCameraX = cameraX;
      this.lastCameraZ = cameraZ;
      this.timeSinceLastUpdate = 0;
      this.needsRespawn = false;
    }
  }

  /**
   * Spawn vegetation instances using GPU compute shader.
   * No CPU readback - uses indirect draw for instance count.
   * 使用 GPU 计算着色器生成植被实例
   * 无 CPU 回读 - 使用 indirect draw 获取实例数量
   */
  private async spawnInstancesGpu(cameraX: number, cameraZ: number): Promise<void> {
    if (!this.renderer || !this.densityTexture) {
      return;
    }

    this.spawnInProgress = true;

    try {
      for (const layer of this.layers.values()) {
        if (!layer.loaded || !layer.mesh || !layer.spawnCompute) {
          continue;
        }

        // Execute GPU spawn compute.
        // 执行 GPU 生成计算
        await layer.spawnCompute.spawn(
          this.renderer,
          cameraX,
          cameraZ,
          this.worldOffsetX,
          this.worldOffsetZ,
          this.worldSize,
          layer.def.fadeOutDistance,
          layer.def.densityChannel,
          layer.modelScale,
          layer.def.scale.min,
          layer.def.scale.max,
          layer.def.rotation.randomY
        );

        // Get the instance buffer from spawn compute and update InstancedMesh.
        // 从生成计算获取实例缓冲区并更新 InstancedMesh
        const instanceBuffer = layer.spawnCompute.getInstanceBuffer();
        if (instanceBuffer) {
          // Use the storage buffer as instance matrix source.
          // 使用存储缓冲区作为实例矩阵源
          // Note: For indirect draw, we set geometry.indirect earlier.
          // The instanceMatrix attribute will be replaced by the storage buffer.
          // 注意：对于 indirect draw，我们之前已设置了 geometry.indirect
          // instanceMatrix 属性将被存储缓冲区替换
          layer.mesh.instanceMatrix = instanceBuffer;
          layer.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    } finally {
      this.spawnInProgress = false;
    }
  }

  /**
   * Mark vegetation as needing respawn (called after brush edit).
   * 标记植被需要重新生成（在画刷编辑后调用）
   */
  markDirty(): void {
    this.needsRespawn = true;
  }

  /**
   * Get the root object for scene attachment.
   * 获取用于场景附加的根对象
   */
  getRoot(): Group {
    return this.root;
  }

  /**
   * Dispose all resources.
   * 释放所有资源
   */
  dispose(): void {
    this.clearLayers();
    if (this.scene) {
      this.scene.remove(this.root);
    }
    this.renderer = null;
    this.scene = null;
    this.densityTexture = null;
    this.vegetationDefinition = null;
  }
}
