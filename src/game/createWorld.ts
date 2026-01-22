import {
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Scene,
} from "three/webgpu";
import { terrainConfig } from "../config/terrain";
import { fogRuntimeConfig, fogStaticConfig } from "../config/fog";
import { skyRuntimeConfig, skyStaticConfig } from "../config/sky";
import { createTerrainSystem } from "./world/terrain/terrain";
import { SkySystem } from "./world/sky/SkySystem";
import { createDefaultGameSettings } from "./settings";

export function createWorld(scene: Scene) {
  // Physical sky system (replaces solid color background).
  // 物理天空系统（替代纯色背景）
  const skySettings = createDefaultGameSettings().sky;
  // Sync initial sun position with sky config.
  // 将初始太阳位置与天空配置同步
  const sunPos = skyStaticConfig.sunPosition;
  // Convert XYZ position to elevation/azimuth.
  // 将 XYZ 位置转换为仰角/方位角
  const sunDist = Math.sqrt(sunPos[0] ** 2 + sunPos[1] ** 2 + sunPos[2] ** 2);
  skySettings.sunElevation = Math.asin(sunPos[1] / sunDist) * (180 / Math.PI);
  skySettings.sunAzimuth = Math.atan2(sunPos[0], sunPos[2]) * (180 / Math.PI);
  
  const skySystem = new SkySystem(scene, skySettings);

  // Fog for atmosphere (density reduced since sky provides atmosphere).
  // 雾用于大气效果（密度降低，因为天空已提供大气效果）
  scene.fog = new FogExp2(fogStaticConfig.colorHex, fogRuntimeConfig.densityPerMeter);

  // Streaming terrain system.
  // 流式地形系统
  const terrain = createTerrainSystem(terrainConfig, scene);
  scene.add(terrain.root);

  // Basic lighting.
  // 基础光照
  const hemi = new HemisphereLight(
    skyStaticConfig.hemiSkyColorHex,
    skyStaticConfig.hemiGroundColorHex,
    skyRuntimeConfig.ambientIntensity,
  );
  scene.add(hemi);

  const sun = new DirectionalLight(skyStaticConfig.sunColorHex, skyRuntimeConfig.sunIntensity);
  sun.position.set(...skyStaticConfig.sunPosition);
  sun.castShadow = true;

  // Configure shadow map for large terrain.
  // 为大地形配置阴影贴图
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  // Shadow camera covers area around player (will be updated dynamically if needed).
  // 阴影相机覆盖玩家周围区域（如需要会动态更新）
  const shadowSize = 200;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  // Bias values to prevent shadow acne on terrain.
  // 偏移值以防止地形上的阴影条纹
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;

  scene.add(sun);

  // Link sky system to directional light for synchronized sun position.
  // 将天空系统链接到方向光以同步太阳位置
  skySystem.setDirectionalLight(sun);

  return { terrain, sun, hemi, skySystem };
}
