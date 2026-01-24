// VegetationSpawnCompute: GPU compute shader for spawning vegetation instances.
// VegetationSpawnCompute：用于生成植被实例的 GPU 计算着色器
//
// GPU-first design: All instance placement is computed on GPU.
// GPU-first 设计：所有实例放置都在 GPU 上计算
//
// ALGORITHM:
// 1. Each thread processes one grid cell in world space
// 2. Sample density map at cell position
// 3. Use deterministic hash for jitter, scale, rotation
// 4. Write instance matrix to output buffer via atomic counter
// 5. Use indirect draw to avoid CPU readback of instance count
// 算法：
// 1. 每个线程处理世界空间中的一个网格单元
// 2. 在单元位置采样密度贴图
// 3. 使用确定性哈希进行抖动、缩放、旋转
// 4. 通过原子计数器将实例矩阵写入输出缓冲区
// 5. 使用 indirect draw 避免回读实例数量

import {
  float,
  int,
  uint,
  ivec2,
  vec4,
  Fn,
  uniform,
  instanceIndex,
  texture,
  sin,
  cos,
  floor,
  fract,
  If,
  atomicAdd,
  atomicStore,
  storage,
  mod,
  struct,
} from "three/tsl";
import {
  StorageBufferAttribute,
  StorageInstancedBufferAttribute,
  IndirectStorageBufferAttribute,
  ComputeNode,
  type WebGPURenderer,
  type DataTexture,
} from "three/webgpu";

// Grid constants.
// 网格常量
const CELL_SIZE = 2.0; // meters per cell / 每单元米数
const MAX_INSTANCES_PER_LAYER = 50000;

/**
 * GPU compute shader for vegetation instance spawning.
 * Uses atomic counters and indirect draw for full GPU-first design.
 * 用于植被实例生成的 GPU 计算着色器
 * 使用原子计数器和 indirect draw 实现完全 GPU-first 设计
 */
export class VegetationSpawnCompute {
  // Compute nodes.
  // 计算节点
  private spawnComputeNode: ComputeNode | null = null;
  private resetComputeNode: ComputeNode | null = null;

  // GPU buffers.
  // GPU 缓冲区
  private counterBuffer: StorageBufferAttribute | null = null;
  private instanceBuffer: StorageInstancedBufferAttribute | null = null;
  private indirectBuffer: IndirectStorageBufferAttribute | null = null;

  // Uniforms.
  // Uniform 变量
  private readonly uCameraX = uniform(0);
  private readonly uCameraZ = uniform(0);
  private readonly uWorldOffsetX = uniform(-512);
  private readonly uWorldOffsetZ = uniform(-512);
  private readonly uWorldSize = uniform(1024);
  private readonly uMaxDistance = uniform(100);
  private readonly uDensityChannel = uniform(0);
  private readonly uModelScale = uniform(1);
  private readonly uScaleMin = uniform(0.8);
  private readonly uScaleMax = uniform(1.2);
  private readonly uRandomRotation = uniform(1); // 0 or 1
  private readonly uDensityResolution = uniform(1024);

  // Height texture for terrain (optional).
  // 地形高度纹理（可选）
  private heightTexture: DataTexture | null = null;
  private readonly uHeightScale = uniform(100);
  private readonly uHeightResolution = uniform(1024);

  // Density texture reference (set externally).
  // 密度纹理引用（外部设置）
  private densityTexture: DataTexture | null = null;

  private initialized = false;
  private gridSize = 0;

  /**
   * Initialize GPU resources.
   * 初始化 GPU 资源
   */
  async init(_renderer: WebGPURenderer, maxDistance: number): Promise<void> {
    // Calculate grid size based on max distance.
    // 根据最大距离计算网格大小
    this.gridSize = Math.ceil((maxDistance * 2) / CELL_SIZE);
    const totalCells = this.gridSize * this.gridSize;

    // Create atomic counter buffer (padded to 16 bytes for alignment).
    // 创建原子计数器缓冲区（填充到 16 字节以对齐）
    this.counterBuffer = new StorageBufferAttribute(new Uint32Array(4), 1);

    // Create instance matrix buffer (mat4 = 16 floats per instance).
    // 创建实例矩阵缓冲区（每实例 mat4 = 16 个浮点数）
    this.instanceBuffer = new StorageInstancedBufferAttribute(
      new Float32Array(MAX_INSTANCES_PER_LAYER * 16),
      16
    );

    // Create indirect draw buffer for InstancedMesh.
    // For indexed geometry: [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
    // 为 InstancedMesh 创建 indirect draw 缓冲区
    // 对于索引几何体：[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
    const indirectData = new Uint32Array(5);
    indirectData[0] = 0; // indexCount (set when geometry bound) / 索引数量（绑定几何体时设置）
    indirectData[1] = 0; // instanceCount (updated by compute) / 实例数量（由计算更新）
    indirectData[2] = 0; // firstIndex
    indirectData[3] = 0; // baseVertex
    indirectData[4] = 0; // firstInstance
    this.indirectBuffer = new IndirectStorageBufferAttribute(indirectData, 5);

    // Build compute shaders.
    // 构建计算着色器
    this.buildComputeShaders(totalCells);

    this.initialized = true;
  }

  /**
   * Build compute shaders for spawn and reset.
   * 构建生成和重置的计算着色器
   */
  private buildComputeShaders(totalCells: number): void {
    const counterBuf = this.counterBuffer!;
    const instanceBuf = this.instanceBuffer!;
    const indirectBuf = this.indirectBuffer!;
    const gridSize = this.gridSize;
    const halfGrid = Math.floor(gridSize / 2);

    // Uniforms.
    // Uniform 变量
    const uCameraX = this.uCameraX;
    const uCameraZ = this.uCameraZ;
    const uWorldOffsetX = this.uWorldOffsetX;
    const uWorldOffsetZ = this.uWorldOffsetZ;
    const uWorldSize = this.uWorldSize;
    const uMaxDistance = this.uMaxDistance;
    const uDensityChannel = this.uDensityChannel;
    const uModelScale = this.uModelScale;
    const uScaleMin = this.uScaleMin;
    const uScaleMax = this.uScaleMax;
    const uRandomRotation = this.uRandomRotation;
    const uDensityResolution = this.uDensityResolution;
    const uHeightScale = this.uHeightScale;
    const uHeightResolution = this.uHeightResolution;

    // Self reference for texture access.
    // 自引用用于纹理访问
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    // Hash function for deterministic randomness.
    // 用于确定性随机的哈希函数
    const hash = Fn(([x, z, seed]: [ReturnType<typeof float>, ReturnType<typeof float>, ReturnType<typeof float>]) => {
      const n = sin(x.mul(12.9898).add(z.mul(78.233)).add(seed.mul(43758.5453)));
      return fract(n.mul(43758.5453));
    });

    // Indirect draw struct with atomic instanceCount.
    // 带原子 instanceCount 的 indirect draw 结构
    const indirectStruct = struct({
      indexCount: "uint",
      instanceCount: { type: "uint", atomic: true },
      firstIndex: "uint",
      baseVertex: "uint",
      firstInstance: "uint",
    }, "IndirectDraw");

    // Create atomic storage for counter (must use .toAtomic() for atomicAdd).
    // 创建原子计数器存储（必须使用 .toAtomic() 才能使用 atomicAdd）
    const counterStorage = storage(counterBuf, "uint", 4).toAtomic();
    const indirectStorage = storage(indirectBuf, indirectStruct, 1);

    // Reset compute shader - runs once before spawn.
    // 重置计算着色器 - 在生成前运行一次
    this.resetComputeNode = Fn(() => {
      // Reset counter to 0.
      // 重置计数器为 0
      atomicStore(counterStorage.element(0), uint(0));

      // Reset indirect instanceCount to 0.
      // 重置 indirect instanceCount 为 0
      atomicStore(indirectStorage.get("instanceCount"), uint(0));
    })().compute(1);

    // Spawn compute shader.
    // 生成计算着色器
    this.spawnComputeNode = Fn(() => {
      // Get grid cell coordinates from thread index.
      // 从线程索引获取网格单元坐标
      const cellX = int(mod(instanceIndex, uint(gridSize))).sub(int(halfGrid));
      const cellZ = int(instanceIndex.div(uint(gridSize))).sub(int(halfGrid));

      // World-space cell coordinates (fixed grid, not camera-relative).
      // 世界空间单元坐标（固定网格，非相机相对）
      const baseCellSize = float(CELL_SIZE);
      const cameraCellX = floor(uCameraX.div(baseCellSize));
      const cameraCellZ = floor(uCameraZ.div(baseCellSize));
      const worldCellX = cameraCellX.add(float(cellX));
      const worldCellZ = cameraCellZ.add(float(cellZ));

      // Deterministic jitter using hash.
      // 使用哈希的确定性抖动
      const jitterX = hash(worldCellX, worldCellZ, float(1)).sub(0.5).mul(baseCellSize).mul(0.8);
      const jitterZ = hash(worldCellX, worldCellZ, float(2)).sub(0.5).mul(baseCellSize).mul(0.8);

      const worldX = worldCellX.mul(baseCellSize).add(jitterX);
      const worldZ = worldCellZ.mul(baseCellSize).add(jitterZ);

      // Distance check from camera.
      // 从相机的距离检查
      const dx = worldX.sub(uCameraX);
      const dz = worldZ.sub(uCameraZ);
      const distSq = dx.mul(dx).add(dz.mul(dz));
      const maxDistSq = uMaxDistance.mul(uMaxDistance);

      If(distSq.lessThan(maxDistSq), () => {
        // Convert to density map UV.
        // 转换为密度贴图 UV
        const u = worldX.sub(uWorldOffsetX).div(uWorldSize);
        const v = worldZ.sub(uWorldOffsetZ).div(uWorldSize);

        If(u.greaterThanEqual(0).and(u.lessThanEqual(1)).and(v.greaterThanEqual(0)).and(v.lessThanEqual(1)), () => {
          // Sample density texture.
          // 采样密度纹理
          const texSize = uDensityResolution;
          const px = int(u.mul(texSize.sub(1)));
          const py = int(v.mul(texSize.sub(1)));

          // Sample density - use actual texture or zero.
          // 采样密度 - 使用实际纹理或零
          const densitySample = self.densityTexture
            ? texture(self.densityTexture).load(ivec2(px, py))
            : vec4(0, 0, 0, 0);

          // Get density for this channel (0=R, 1=G, 2=B, 3=A).
          // 获取此通道的密度（0=R, 1=G, 2=B, 3=A）
          const density = densitySample.element(uDensityChannel);

          // Probability test.
          // 概率测试
          const rand = hash(worldCellX, worldCellZ, float(10).add(float(uDensityChannel)));

          If(rand.lessThan(density).and(density.greaterThan(0.01)), () => {
            // Get terrain height from height texture if available.
            // 如果可用，从高度纹理获取地形高度
            const heightSample = self.heightTexture
              ? texture(self.heightTexture).load(ivec2(
                  int(u.mul(uHeightResolution.sub(1))),
                  int(v.mul(uHeightResolution.sub(1)))
                ))
              : vec4(0, 0, 0, 0);
            const worldY = heightSample.r.mul(uHeightScale);

            // Random scale.
            // 随机缩放
            const scaleRand = hash(worldCellX, worldCellZ, float(3));
            const baseScale = uScaleMin.add(scaleRand.mul(uScaleMax.sub(uScaleMin)));
            const finalScale = baseScale.mul(uModelScale);

            // Random Y rotation.
            // 随机 Y 旋转
            const rotRand = hash(worldCellX, worldCellZ, float(4));
            const rotY = rotRand.mul(float(Math.PI * 2)).mul(float(uRandomRotation));

            // Build transformation matrix (column-major).
            // 构建变换矩阵（列主序）
            const cosR = cos(rotY);
            const sinR = sin(rotY);

            // mat4: scale * rotateY, with translation in column 3
            // mat4：缩放 * Y 旋转，平移在第 3 列
            const m0 = vec4(cosR.mul(finalScale), float(0), sinR.negate().mul(finalScale), float(0));
            const m1 = vec4(float(0), finalScale, float(0), float(0));
            const m2 = vec4(sinR.mul(finalScale), float(0), cosR.mul(finalScale), float(0));
            const m3 = vec4(worldX, worldY, worldZ, float(1));

            // Atomic increment to get instance index.
            // 原子自增获取实例索引
            const idx = atomicAdd(counterStorage.element(0), uint(1));

            If(idx.lessThan(uint(MAX_INSTANCES_PER_LAYER)), () => {
              // Write matrix to instance buffer (4 vec4s per matrix).
              // 将矩阵写入实例缓冲区（每矩阵 4 个 vec4）
              const buf = storage(instanceBuf, "vec4", MAX_INSTANCES_PER_LAYER * 4);
              const baseIdx = idx.mul(4);
              buf.element(baseIdx.add(0)).assign(m0);
              buf.element(baseIdx.add(1)).assign(m1);
              buf.element(baseIdx.add(2)).assign(m2);
              buf.element(baseIdx.add(3)).assign(m3);

              // Also update indirect draw instanceCount.
              // 同时更新 indirect draw 的 instanceCount
              atomicAdd(indirectStorage.get("instanceCount"), uint(1));
            });
          });
        });
      });
    })().compute(totalCells);
  }

  /**
   * Set the density texture for sampling.
   * 设置用于采样的密度纹理
   */
  setDensityTexture(tex: DataTexture | null): void {
    this.densityTexture = tex;
    if (tex) {
      this.uDensityResolution.value = tex.image.width;
    }

    // Rebuild compute shader with new texture reference.
    // 使用新纹理引用重建计算着色器
    if (this.initialized) {
      const totalCells = this.gridSize * this.gridSize;
      this.buildComputeShaders(totalCells);
    }
  }

  /**
   * Set height texture for terrain sampling.
   * 设置用于地形采样的高度纹理
   */
  setHeightTexture(tex: DataTexture | null, heightScale: number = 100): void {
    this.heightTexture = tex;
    this.uHeightScale.value = heightScale;
    if (tex) {
      this.uHeightResolution.value = tex.image.width;
    }

    // Rebuild compute shader with new texture reference.
    // 使用新纹理引用重建计算着色器
    if (this.initialized) {
      const totalCells = this.gridSize * this.gridSize;
      this.buildComputeShaders(totalCells);
    }
  }

  /**
   * Get the instance buffer for rendering.
   * 获取用于渲染的实例缓冲区
   */
  getInstanceBuffer(): StorageInstancedBufferAttribute | null {
    return this.instanceBuffer;
  }

  /**
   * Get the indirect draw buffer for rendering.
   * 获取用于渲染的 indirect draw 缓冲区
   */
  getIndirectBuffer(): IndirectStorageBufferAttribute | null {
    return this.indirectBuffer;
  }

  /**
   * Set the index count for indirect draw (from geometry).
   * 设置 indirect draw 的索引数量（来自几何体）
   */
  setIndexCount(count: number): void {
    if (this.indirectBuffer) {
      (this.indirectBuffer.array as Uint32Array)[0] = count;
      this.indirectBuffer.needsUpdate = true;
    }
  }

  /**
   * Execute spawn compute shader.
   * Returns immediately - rendering uses indirect draw, no CPU readback needed.
   * 执行生成计算着色器
   * 立即返回 - 渲染使用 indirect draw，无需 CPU 回读
   */
  async spawn(
    renderer: WebGPURenderer,
    cameraX: number,
    cameraZ: number,
    worldOffsetX: number,
    worldOffsetZ: number,
    worldSize: number,
    maxDistance: number,
    densityChannel: number,
    modelScale: number,
    scaleMin: number,
    scaleMax: number,
    randomRotation: boolean
  ): Promise<void> {
    if (!this.initialized || !this.spawnComputeNode || !this.resetComputeNode) {
      return;
    }

    // Update uniforms.
    // 更新 uniform 变量
    this.uCameraX.value = cameraX;
    this.uCameraZ.value = cameraZ;
    this.uWorldOffsetX.value = worldOffsetX;
    this.uWorldOffsetZ.value = worldOffsetZ;
    this.uWorldSize.value = worldSize;
    this.uMaxDistance.value = maxDistance;
    this.uDensityChannel.value = densityChannel;
    this.uModelScale.value = modelScale;
    this.uScaleMin.value = scaleMin;
    this.uScaleMax.value = scaleMax;
    this.uRandomRotation.value = randomRotation ? 1 : 0;

    // Reset counter and indirect buffer.
    // 重置计数器和 indirect 缓冲区
    await renderer.computeAsync(this.resetComputeNode);

    // Run spawn compute.
    // 运行生成计算
    await renderer.computeAsync(this.spawnComputeNode);
  }

  /**
   * Dispose GPU resources.
   * 释放 GPU 资源
   */
  dispose(): void {
    this.spawnComputeNode = null;
    this.resetComputeNode = null;
    this.counterBuffer = null;
    this.instanceBuffer = null;
    this.indirectBuffer = null;
    this.densityTexture = null;
    this.heightTexture = null;
    this.initialized = false;
  }
}
