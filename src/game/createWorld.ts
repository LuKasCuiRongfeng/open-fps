import {
  BoxGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  Scene,
} from "three/webgpu";
import { color, float } from "three/tsl";
import { playerConfig } from "../config/player";
import { terrainConfig } from "../config/terrain";
import { visualsConfig } from "../config/visuals";
import { createTerrainSystem } from "./world/terrain";

export function createWorld(scene: Scene) {
  const visuals = visualsConfig;

  // Sky / atmosphere.
  // 天空 / 大气
  scene.background = new Color(visuals.sky.colorHex);
  scene.fog = new FogExp2(visuals.fog.colorHex, visuals.fog.densityPerMeter);

  // Streaming terrain system.
  // 流式地形系统
  const terrain = createTerrainSystem(terrainConfig, scene);
  scene.add(terrain.root);

  // Basic lighting.
  // 基础光照
  scene.add(
    new HemisphereLight(
      visuals.lights.hemi.skyColorHex,
      visuals.lights.hemi.groundColorHex,
      visuals.lights.hemi.intensity,
    ),
  );

  const sun = new DirectionalLight(visuals.lights.sun.colorHex, visuals.lights.sun.intensity);
  sun.position.set(...visuals.lights.sun.position);
  sun.castShadow = true;
  scene.add(sun);

  // A small marker cube near spawn point (reference object).
  // 出生点附近的小方块（参考物体）
  const s = visuals.debug.originMarkerSizeMeters;
  const markerMat = new MeshStandardNodeMaterial();
  markerMat.colorNode = color(0.95, 0.25, 0.25);
  markerMat.metalnessNode = float(0.0);
  markerMat.roughnessNode = float(0.7);
  markerMat.fog = true;

  const marker = new Mesh(new BoxGeometry(s, s, s), markerMat);
  // Position marker near spawn point - will be repositioned after terrain init.
  // 将 marker 放在出生点附近 - 地形初始化后会重新定位
  const markerX = playerConfig.spawn.xMeters + 3;
  const markerZ = playerConfig.spawn.zMeters;
  marker.position.set(markerX, terrain.heightAt(markerX, markerZ) + s * 0.5, markerZ);
  scene.add(marker);

  return { terrain, marker };
}
