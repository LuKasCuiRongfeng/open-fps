// terrainMaterial: TSL-based terrain material for chunks.
// terrainMaterial：基于 TSL 的 chunk 地形材质

import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  clamp,
  color,
  float,
  hash,
  max,
  mix,
  mul,
  mx_fractal_noise_float,
  mx_heighttonormal,
  mx_worley_noise_float,
  normalWorld,
  oneMinus,
  positionWorld,
  smoothstep,
  add,
  vec3,
} from "three/tsl";
import type { TerrainConfig } from "./terrain";

/**
 * Create a TSL-based material for terrain chunks.
 * 为地形 chunk 创建基于 TSL 的材质
 */
export function createChunkMaterial(cfg: TerrainConfig): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.fog = true;

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

  // Procedural detail normal.
  // 程序化细节法线
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
    mat.normalNode = mx_heighttonormal(dnHeight, float(cfg.material.detailNormal.strength));
  }

  mat.colorNode = shaded;
  mat.metalnessNode = float(cfg.material.metalness);

  return mat;
}
