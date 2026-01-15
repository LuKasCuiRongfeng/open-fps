import {
	BufferAttribute,
	Group,
	HalfFloatType,
	Mesh,
	MeshStandardNodeMaterial,
	PlaneGeometry,
	RGBAFormat,
	StorageTexture
} from "three/webgpu";
import {
	clamp,
	add,
	and,
	bitXor,
	color,
	computeKernel,
	div,
	floor,
	float,
	Fn,
	globalId,
	hash,
	If,
	int,
	ivec2,
	lessThan,
	max,
	min,
	mix,
	mul,
	modelWorldMatrix,
	mx_fractal_noise_float,
	mx_heighttonormal,
	mx_worley_noise_float,
	normalize,
	normalWorld,
	oneMinus,
	positionLocal,
	positionWorld,
	shiftRight,
	smoothstep,
	sub,
	textureLoad,
	textureStore,
	uint,
	uvec2,
	vec3,
	vec4,
} from "three/tsl";
import type { worldConfig } from "../../config/world";
import type { WebGPURenderer } from "three/webgpu";

export type TerrainConfig = (typeof worldConfig)["terrain"];

export type TerrainResource = {
	root: Group;
	heightAt: (xMeters: number, zMeters: number) => number;
	initGpu?: (renderer: WebGPURenderer) => Promise<void>;
};

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function smoothstep01(t: number) {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

function hash2i(xi: number, zi: number, seed: number) {
	// Simple 32-bit integer hash -> [0, 1).
	// 简单 32 位整数哈希 -> [0, 1)
	let n = (xi | 0) * 374761393 + (zi | 0) * 668265263 + (seed | 0) * 2147483647;
	n = (n ^ (n >> 13)) | 0;
	n = Math.imul(n, 1274126177) | 0;
	n = (n ^ (n >> 16)) >>> 0;
	return n / 4294967296;
}

function valueNoise2D(x: number, z: number, seed: number) {
	const xi = Math.floor(x);
	const zi = Math.floor(z);

	const xf = x - xi;
	const zf = z - zi;

	const u = smoothstep01(xf);
	const v = smoothstep01(zf);

	const a = hash2i(xi, zi, seed);
	const b = hash2i(xi + 1, zi, seed);
	const c = hash2i(xi, zi + 1, seed);
	const d = hash2i(xi + 1, zi + 1, seed);

	const ab = lerp(a, b, u);
	const cd = lerp(c, d, u);
	return lerp(ab, cd, v);
}

function fbm2D(x: number, z: number, cfg: TerrainConfig) {
	let sum = 0;
	let amp = 1;
	let freq = cfg.height.frequencyPerMeter;

	for (let i = 0; i < cfg.height.octaves; i++) {
		const n01 = valueNoise2D(x * freq, z * freq, cfg.height.seed + i * 1013);
		const n = n01 * 2 - 1; // [-1, 1]
		sum += n * amp;

		freq *= cfg.height.lacunarity;
		amp *= cfg.height.gain;
	}

	return sum;
}

function smoothstep01Node(t: unknown) {
	const x = clamp(t as any, float(0.0), float(1.0));
	// x*x*(3-2*x)
	return mul(mul(x, x), sub(float(3.0), mul(float(2.0), x)));
}

function seedMul2147483647_i32(seed: number) {
	// Precompute the 32-bit signed multiply to avoid WGSL const-fold overflow.
	// 预先在 CPU 侧做 32 位有符号乘法，避免 WGSL 常量折叠溢出
	return Math.imul(seed | 0, 2147483647) | 0;
}

function hash2iNode(xi: unknown, zi: unknown, seedMul_i32: number) {
	// Match the CPU hash2i() integer math closely for consistent heightAt.
	// 尽量与 CPU hash2i() 的整数运算保持一致，保证渲染/物理高度一致
	const x = int(xi as any);
	const z = int(zi as any);

	const n0 = add(
		mul(x, int(374761393)),
		mul(z, int(668265263)),
		int(seedMul_i32),
	);
	const n1 = bitXor(n0, shiftRight(n0, int(13)));
	const n2 = mul(n1, int(1274126177));
	const n3 = bitXor(n2, shiftRight(n2, int(16)));
	// Convert to uint like >>> 0, then map to [0,1).
	// 转成 uint（等价于 >>> 0），再映射到 [0,1)
	return div(float(uint(n3)), float(4294967296.0));
}

function valueNoise2DNode(x: unknown, z: unknown, seed: number) {
	const xf0 = floor(x as any);
	const zf0 = floor(z as any);

	const xf = sub(x as any, xf0);
	const zf = sub(z as any, zf0);

	const u = smoothstep01Node(xf);
	const v = smoothstep01Node(zf);

	const xi = int(xf0);
	const zi = int(zf0);
	const seedMul = seedMul2147483647_i32(seed);

	const a = hash2iNode(xi, zi, seedMul);
	const b = hash2iNode(add(xi, int(1)), zi, seedMul);
	const c = hash2iNode(xi, add(zi, int(1)), seedMul);
	const d = hash2iNode(add(xi, int(1)), add(zi, int(1)), seedMul);

	const ab = mix(a, b, u);
	const cd = mix(c, d, u);
	return mix(ab, cd, v);
}

function heightAtNode(xMeters: unknown, zMeters: unknown, cfg: TerrainConfig) {
	let x = xMeters as any;
	let z = zMeters as any;

	if (cfg.height.warp.enabled) {
		const wf = float(cfg.height.warp.frequencyPerMeter);
		const wa = float(cfg.height.warp.amplitudeMeters);
		const wx = mul(
			sub(mul(valueNoise2DNode(mul(x, wf), mul(z, wf), cfg.height.seed + 9001), float(2.0)), float(1.0)),
			wa,
		);
		const wz = mul(
			sub(mul(valueNoise2DNode(mul(x, wf), mul(z, wf), cfg.height.seed + 9002), float(2.0)), float(1.0)),
			wa,
		);
		x = add(x, wx);
		z = add(z, wz);
	}

	// Unroll octaves in JS to keep deterministic seeding identical to CPU.
	// 用 JS 展开八度层，保证 seed 处理与 CPU 完全一致
	let sum: any = float(0.0);
	let amp: any = float(1.0);
	let freq: any = float(cfg.height.frequencyPerMeter);

	for (let i = 0; i < cfg.height.octaves; i++) {
		const n01 = valueNoise2DNode(mul(x, freq), mul(z, freq), cfg.height.seed + i * 1013);
		const n = sub(mul(n01, float(2.0)), float(1.0));
		sum = add(sum, mul(n, amp));
		freq = mul(freq, float(cfg.height.lacunarity));
		amp = mul(amp, float(cfg.height.gain));
	}

	return add(float(cfg.height.baseHeightMeters), mul(sum, float(cfg.height.amplitudeMeters)));
}

export function createTerrain(cfg: TerrainConfig): TerrainResource {
	const heightAt = (xMeters: number, zMeters: number) => {
		// Domain warp to avoid obvious grid patterns.
		// 域扭曲：减少明显的网格感
		let x = xMeters;
		let z = zMeters;

		if (cfg.height.warp.enabled) {
			const wf = cfg.height.warp.frequencyPerMeter;
			const wa = cfg.height.warp.amplitudeMeters;
			const wx = (valueNoise2D(x * wf, z * wf, cfg.height.seed + 9001) * 2 - 1) * wa;
			const wz = (valueNoise2D(x * wf, z * wf, cfg.height.seed + 9002) * 2 - 1) * wa;
			x += wx;
			z += wz;
		}

		const n = fbm2D(x, z, cfg);
		return cfg.height.baseHeightMeters + n * cfg.height.amplitudeMeters;
	};

	const totalW = cfg.tile.widthMeters * cfg.tile.tilesX;
	const totalD = cfg.tile.depthMeters * cfg.tile.tilesZ;

	const halfW = totalW * 0.5;
	const halfD = totalD * 0.5;

	const texW = cfg.tile.tilesX * cfg.tile.segmentsPerSide + 1;
	const texH = cfg.tile.tilesZ * cfg.tile.segmentsPerSide + 1;

	const root = new Group();
	root.name = "terrain";

	let initGpu: TerrainResource["initGpu"] | undefined;
	let mat: MeshStandardNodeMaterial;

	if (cfg.gpuBake.enabled) {
		const heightTex = new StorageTexture(texW, texH);
		heightTex.name = "terrain-height";
		// Use float storage so meters-scale heights (incl. negatives) don't clamp.
		// 使用 float 格式，保证“米”尺度高度（含负值）不会被夹到 0..1
		// Important: WGSL storage texture binding format is derived from (format,type),
		// so we must set those (not just internalFormat) to avoid layout/shader mismatch.
		// 关键点：WGSL 的 storage texture 绑定格式来自 (format,type)，
		// 仅设置 internalFormat 会导致 layout/shader 格式不一致。
		heightTex.format = RGBAFormat;
		heightTex.type = HalfFloatType;

		const normalTex = new StorageTexture(texW, texH);
		normalTex.name = "terrain-normal";
		// Use float normals so components can be in [-1, 1].
		// 使用 float 法线，分量可在 [-1, 1]
		normalTex.format = RGBAFormat;
		normalTex.type = HalfFloatType;

		mat = createTerrainMaterial(cfg, {
			heightTex,
			normalTex,
			texW,
			texH,
			totalW,
			totalD,
			halfW,
			halfD,
		});

		const wg = Math.max(1, Math.floor(cfg.gpuBake.workgroupSize));
		const workgroupSize = [wg, wg, 1];
		const stepX = totalW / (texW - 1);
		const stepZ = totalD / (texH - 1);
		const dispatchX = Math.ceil(texW / wg);
		const dispatchY = Math.ceil(texH / wg);

		const bakeHeightFn = Fn(({ outHeight }: { outHeight: StorageTexture }) => {
			const gid = globalId;
			const inBounds = and(
				lessThan(gid.x as any, uint(texW)),
				lessThan(gid.y as any, uint(texH)),
			);

			If(inBounds as any, () => {
				const uv = uvec2(uint(gid.x), uint(gid.y));

				const worldX = add(
					mul(div(float(gid.x), float(texW - 1)), float(totalW)),
					float(-halfW),
				);
				const worldZ = add(
					mul(div(float(gid.y), float(texH - 1)), float(totalD)),
					float(-halfD),
				);

				const h = (() => {
					switch (cfg.gpuBake.debugPattern) {
						case "flat":
							return float(cfg.height.baseHeightMeters);
						case "gradient": {
							const u = div(float(gid.x), float(texW - 1));
							const slope = mul(sub(u, float(0.5)), float(cfg.gpuBake.debugAmplitudeMeters));
							return add(float(cfg.height.baseHeightMeters), slope);
						}
						case "procedural":
						default:
							return heightAtNode(worldX, worldZ, cfg);
					}
				})();
				textureStore(outHeight, uv, vec4(h, float(0.0), float(0.0), float(1.0))).toWriteOnly();
			});
		});

		const bakeHeightNode = bakeHeightFn({ outHeight: heightTex })
			.computeKernel(workgroupSize)
			.setName("terrain-bake-height");

		let bakeNormalNode: ReturnType<typeof computeKernel> | undefined;
		if (cfg.gpuBake.bakeNormals) {
			const bakeNormalFn = Fn(({ outNormal }: { outNormal: StorageTexture }) => {
				const gid = globalId;
				const inBounds = and(
					lessThan(gid.x as any, uint(texW)),
					lessThan(gid.y as any, uint(texH)),
				);

				If(inBounds as any, () => {
					const uv = uvec2(uint(gid.x), uint(gid.y));

					const worldX = add(
						mul(div(float(gid.x), float(texW - 1)), float(totalW)),
						float(-halfW),
					);
					const worldZ = add(
						mul(div(float(gid.y), float(texH - 1)), float(totalD)),
						float(-halfD),
					);

					const xL = max(add(worldX, float(-stepX)), float(-halfW));
					const xR = min(add(worldX, float(stepX)), float(halfW));
					const zD = max(add(worldZ, float(-stepZ)), float(-halfD));
					const zU = min(add(worldZ, float(stepZ)), float(halfD));

					const hL = heightAtNode(xL, worldZ, cfg);
					const hR = heightAtNode(xR, worldZ, cfg);
					const hD = heightAtNode(worldX, zD, cfg);
					const hU = heightAtNode(worldX, zU, cfg);

					const dhdx = div(sub(hR, hL), float(2.0 * stepX));
					const dhdz = div(sub(hU, hD), float(2.0 * stepZ));
					const n = normalize(
						vec3(sub(float(0.0), dhdx), float(1.0), sub(float(0.0), dhdz)),
					);
					textureStore(outNormal, uv, vec4(n, float(1.0))).toWriteOnly();
				});
			});

			bakeNormalNode = bakeNormalFn({ outNormal: normalTex })
				.computeKernel(workgroupSize)
				.setName("terrain-bake-normal");
		}

		initGpu = async (renderer: WebGPURenderer) => {
			const nodes = bakeNormalNode ? [bakeHeightNode, bakeNormalNode] : [bakeHeightNode];
			await renderer.computeAsync(nodes, [dispatchX, dispatchY, 1]);
		};
	} else {
		mat = createTerrainMaterial(cfg);
	}

	const step = cfg.height.normalSampleStepMeters;

	for (let tz = 0; tz < cfg.tile.tilesZ; tz++) {
		for (let tx = 0; tx < cfg.tile.tilesX; tx++) {
			const centerX = -halfW + cfg.tile.widthMeters * 0.5 + tx * cfg.tile.widthMeters;
			const centerZ = -halfD + cfg.tile.depthMeters * 0.5 + tz * cfg.tile.depthMeters;

			const geo = new PlaneGeometry(
				cfg.tile.widthMeters,
				cfg.tile.depthMeters,
				cfg.tile.segmentsPerSide,
				cfg.tile.segmentsPerSide,
			);
			geo.rotateX(-Math.PI / 2);

			const pos = geo.getAttribute("position") as BufferAttribute;
			const normal = geo.getAttribute("normal") as BufferAttribute;

			if (!cfg.gpuBake.enabled) {
				for (let i = 0; i < pos.count; i++) {
					const localX = pos.getX(i);
					const localZ = pos.getZ(i);
					const worldX = centerX + localX;
					const worldZ = centerZ + localZ;
					const y = heightAt(worldX, worldZ);
					pos.setY(i, y);

					// Normal from sampled height gradients (consistent across tiles).
					// 通过高度梯度采样计算法线（跨 tile 一致，避免接缝）
					const hL = heightAt(worldX - step, worldZ);
					const hR = heightAt(worldX + step, worldZ);
					const hD = heightAt(worldX, worldZ - step);
					const hU = heightAt(worldX, worldZ + step);
					const dhdx = (hR - hL) / (2 * step);
					const dhdz = (hU - hD) / (2 * step);

					let nx = -dhdx;
					let ny = 1;
					let nz = -dhdz;
					const invLen = 1 / Math.hypot(nx, ny, nz);
					nx *= invLen;
					ny *= invLen;
					nz *= invLen;
					normal.setXYZ(i, nx, ny, nz);
				}

				pos.needsUpdate = true;
				normal.needsUpdate = true;
			}

			const mesh = new Mesh(geo, mat);
			mesh.receiveShadow = true;
			mesh.position.set(centerX, 0, centerZ);
			if (cfg.gpuBake.enabled) {
				// Displacement happens in the shader; CPU bounds are wrong.
				// 位移在 shader 中完成：CPU bounds 不准确，关闭裁剪以避免闪烁
				mesh.frustumCulled = false;
			}
			mesh.name = `terrain-tile-${tx}-${tz}`;
			root.add(mesh);
		}
	}

	return { root, heightAt, initGpu };
}

function createTerrainMaterial(
	cfg: TerrainConfig,
	gpu?: {
		heightTex: StorageTexture;
		normalTex: StorageTexture;
		texW: number;
		texH: number;
		totalW: number;
		totalD: number;
		halfW: number;
		halfD: number;
	},
) {
	const mat = new MeshStandardNodeMaterial();
	mat.fog = true;

	if (gpu) {
		// Sample baked height/normal using world XZ derived from modelWorldMatrix.
		// 使用 modelWorldMatrix 推导世界坐标，从烘焙贴图采样高度/法线
		// Note: use positionLocal (pre-displacement) to avoid feedback loops.
		// 注意：使用位移前的 positionLocal，避免自反馈循环
		const worldPos = mul(modelWorldMatrix, vec4(positionLocal, float(1.0))).xyz;
		const worldXZ = worldPos.xz;

		const sx = clamp(
			div(add(worldXZ.x, float(gpu.halfW)), float(gpu.totalW)),
			float(0.0),
			float(1.0),
		);
		const sz = clamp(
			div(add(worldXZ.y, float(gpu.halfD)), float(gpu.totalD)),
			float(0.0),
			float(1.0),
		);

		const px = int(add(mul(sx, float(gpu.texW - 1)), float(0.5)));
		const pz = int(add(mul(sz, float(gpu.texH - 1)), float(0.5)));
		const p = ivec2(px, pz);

		const h = textureLoad(gpu.heightTex, p, 0).x;
		mat.positionNode = add(positionLocal, vec3(float(0.0), h, float(0.0)));

		if (cfg.gpuBake.bakeNormals) {
			const baseN = normalize(textureLoad(gpu.normalTex, p, 0).xyz);
			let finalN = baseN;
			if (cfg.material.detailNormal.enabled) {
				const dnPos = mul(
					vec3(positionWorld.x, float(0.0), positionWorld.z),
					float(cfg.material.detailNormal.frequencyPerMeter),
				);
				const dnHeight = mx_fractal_noise_float(
					dnPos,
					cfg.material.detailNormal.octaves,
					cfg.material.detailNormal.lacunarity,
					cfg.material.detailNormal.diminish,
					cfg.material.detailNormal.amplitude,
				);
				const dn = mx_heighttonormal(dnHeight, float(cfg.material.detailNormal.strength));
				finalN = normalize(add(baseN, sub(dn, vec3(float(0.0), float(1.0), float(0.0)))));
			}
			mat.normalNode = finalN;
		}
	}

	// Height & slope driven material blending.
	// 基于高度 + 坡度的材质混合
	const y = positionWorld.y;
	const slope = clamp(oneMinus(normalWorld.y), float(0.0), float(1.0));

	const dirt = color(...cfg.material.dirtColorRgb);
	const grass = color(...cfg.material.grassColorRgb);
	const rock = color(...cfg.material.rockColorRgb);

	// Macro noise for large-scale patchiness.
	// 宏观噪声：制造成片的自然变化
	const macroPos = mul(
		vec3(positionWorld.x, float(0.0), positionWorld.z),
		float(cfg.material.macro.frequencyPerMeter),
	);
	const macroN = mx_fractal_noise_float(
		macroPos,
		cfg.material.macro.octaves,
		cfg.material.macro.lacunarity,
		cfg.material.macro.diminish,
		cfg.material.macro.amplitude,
	);
	const macro01 = clamp(macroN, float(0.0), float(1.0));
	const macroShift = mul(
		add(mul(macro01, float(2.0)), float(-1.0)),
		float(cfg.material.macro.heightShiftMeters),
	);

	const dirtToGrass = smoothstep(
		add(float(cfg.material.dirtToGrassStartMeters), macroShift),
		add(float(cfg.material.dirtToGrassEndMeters), macroShift),
		y,
	);
	const base = mix(dirt, grass, dirtToGrass);

	const rockBySlope = smoothstep(
		float(cfg.material.rockSlopeStart),
		float(cfg.material.rockSlopeEnd),
		slope,
	);
	const rockByHeight = smoothstep(
		float(cfg.material.rockHeightStartMeters),
		float(cfg.material.rockHeightEndMeters),
		y,
	);

	let rockMask = max(rockBySlope, rockByHeight);

	// Rock breakup to avoid continuous bands.
	// 岩石破碎度：打散连续的岩石带
	const worley = mx_worley_noise_float(
		mul(positionWorld.xz, float(cfg.material.rockBreakup.frequencyPerMeter)),
		cfg.material.rockBreakup.jitter,
	);
	const rockBreak = smoothstep(
		float(cfg.material.rockBreakup.threshold),
		float(cfg.material.rockBreakup.threshold + cfg.material.rockBreakup.softness),
		worley,
	);
	rockMask = clamp(
		add(rockMask, mul(rockBreak, float(cfg.material.rockBreakup.strength))),
		float(0.0),
		float(1.0),
	);
	const c = mix(base, rock, rockMask);

	// Micro-variation (cheap hash noise in world space).
	// 微观变化（世界空间哈希噪声，成本低）
	const n = hash(mul(positionWorld.xz, float(cfg.material.detailFrequencyPerMeter)));
	const shade = mix(float(cfg.material.detailShadeMin), float(cfg.material.detailShadeMax), n);
	let shaded = mul(c, shade);

	// Wet/muddy lowlands.
	// 低洼湿地/泥地
	if (cfg.material.wetness.enabled) {
		const wetHeight = oneMinus(
			smoothstep(
				float(cfg.material.wetness.startHeightMeters),
				float(cfg.material.wetness.endHeightMeters),
				y,
			),
		);

		const wetFlat = oneMinus(
			smoothstep(
				float(cfg.material.wetness.slopeStart),
				float(cfg.material.wetness.slopeEnd),
				slope,
			),
		);

		const macroMul = mix(
			float(1.0 - cfg.material.wetness.macroInfluence),
			float(1.0 + cfg.material.wetness.macroInfluence),
			macro01,
		);

		const wetMask = clamp(mul(mul(wetHeight, wetFlat), macroMul), float(0.0), float(1.0));
		const wetBlend = clamp(
			mul(wetMask, float(cfg.material.wetness.strength)),
			float(0.0),
			float(1.0),
		);

		const mud = color(...cfg.material.wetness.mudColorRgb);
		shaded = mul(mix(shaded, mud, wetBlend), float(cfg.material.wetness.darken));

		mat.roughnessNode = mix(
			float(cfg.material.roughness),
			float(cfg.material.wetness.roughness),
			wetBlend,
		);
	} else {
		mat.roughnessNode = float(cfg.material.roughness);
	}

	// Procedural detail normal is integrated into the baked normal path above.
	// 程序化细节法线：在烘焙法线路径中已合成
	if (!gpu && cfg.material.detailNormal.enabled) {
		const dnPos = mul(
			vec3(positionWorld.x, float(0.0), positionWorld.z),
			float(cfg.material.detailNormal.frequencyPerMeter),
		);
		const dnHeight = mx_fractal_noise_float(
			dnPos,
			cfg.material.detailNormal.octaves,
			cfg.material.detailNormal.lacunarity,
			cfg.material.detailNormal.diminish,
			cfg.material.detailNormal.amplitude,
		);
		mat.normalNode = mx_heighttonormal(dnHeight, float(cfg.material.detailNormal.strength));
	}

	mat.colorNode = shaded;
	mat.metalnessNode = float(cfg.material.metalness);

	return mat;
}