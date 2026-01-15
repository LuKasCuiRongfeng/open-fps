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
import { worldConfig } from "../config/world";
import { createTerrainSystem } from "./world/terrain";

export function createWorld(scene: Scene) {
  const { visuals } = worldConfig;

  // Sky / atmosphere.
  // 天空 / 大气
  scene.background = new Color(visuals.sky.colorHex);
  scene.fog = new FogExp2(visuals.fog.colorHex, visuals.fog.densityPerMeter);

  // Streaming terrain system.
  // 流式地形系统
  const terrain = createTerrainSystem(worldConfig.terrain, scene);
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

  // A small marker cube (origin reference).
  // 原点参考方块
  const s = visuals.debug.originMarkerSizeMeters;
  const markerMat = new MeshStandardNodeMaterial();
  markerMat.colorNode = color(0.95, 0.25, 0.25);
  markerMat.metalnessNode = float(0.0);
  markerMat.roughnessNode = float(0.7);
  markerMat.fog = true;

  const marker = new Mesh(new BoxGeometry(s, s, s), markerMat);
  marker.position.set(0, terrain.heightAt(0, 0) + s * 0.5, 0);
  scene.add(marker);

  return { terrain };
}
