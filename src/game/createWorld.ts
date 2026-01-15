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
import { createTerrain, createTerrainSystem, type TerrainResource } from "./world/terrain";

export function createWorld(scene: Scene) {
  const { widthMeters, depthMeters, groundY } = worldConfig.map;
  const { visuals } = worldConfig;

  // Sky / atmosphere.
  // 天空 / 大气
  scene.background = new Color(visuals.sky.colorHex);
  scene.fog = new FogExp2(visuals.fog.colorHex, visuals.fog.densityPerMeter);

  // Choose terrain system based on streaming config.
  // 根据 streaming 配置选择地形系统
  let terrain: TerrainResource;
  if (worldConfig.terrain.streaming.enabled) {
    // Use new streaming terrain system.
    // 使用新的流式地形系统
    terrain = createTerrainSystem(worldConfig.terrain, scene);
  } else {
    // Use legacy single-tile terrain.
    // 使用旧的单块地形
    terrain = createTerrain(worldConfig.terrain);
  }
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

  // Air-wall hooks at the map boundaries (invisible for now).
  // 地图边界空气墙（目前不可见，作为未来物理/碰撞系统的挂点）
  const inset = worldConfig.map.airWallInsetMeters;
  const wallHeight = 6;
  const wallThickness = 0.5;
  const halfW = widthMeters * 0.5 - inset;
  const halfD = depthMeters * 0.5 - inset;

  const wallMat = new MeshStandardNodeMaterial();
  wallMat.colorNode = color(0.0, 0.0, 0.0);
  wallMat.metalnessNode = float(0.0);
  wallMat.roughnessNode = float(1.0);
  wallMat.fog = true;

  const wallXGeo = new BoxGeometry(wallThickness, wallHeight, depthMeters);
  const wallZGeo = new BoxGeometry(widthMeters, wallHeight, wallThickness);

  const wallPX = new Mesh(wallXGeo, wallMat);
  wallPX.position.set(halfW, groundY + wallHeight * 0.5, 0);
  wallPX.visible = false;
  scene.add(wallPX);

  const wallNX = new Mesh(wallXGeo, wallMat);
  wallNX.position.set(-halfW, groundY + wallHeight * 0.5, 0);
  wallNX.visible = false;
  scene.add(wallNX);

  const wallPZ = new Mesh(wallZGeo, wallMat);
  wallPZ.position.set(0, groundY + wallHeight * 0.5, halfD);
  wallPZ.visible = false;
  scene.add(wallPZ);

  const wallNZ = new Mesh(wallZGeo, wallMat);
  wallNZ.position.set(0, groundY + wallHeight * 0.5, -halfD);
  wallNZ.visible = false;
  scene.add(wallNZ);

  return { terrain };
}
