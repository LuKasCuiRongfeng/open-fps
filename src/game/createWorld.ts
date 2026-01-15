import {
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Scene,
} from "three/webgpu";
import { color, float } from "three/tsl";
import { worldConfig } from "../config/world";

export function createWorld(scene: Scene) {
  const { widthMeters, depthMeters, groundY } = worldConfig.map;
  const { visuals } = worldConfig;

  // Ground plane (50x50 meters now; scalable later).
  // 地面（当前 50x50 米，后续可扩展）
  const groundGeo = new PlaneGeometry(widthMeters, depthMeters, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);

  const groundMat = new MeshStandardNodeMaterial();
  groundMat.colorNode = color(...visuals.ground.colorRgb);
  groundMat.metalnessNode = float(visuals.ground.metalness);
  groundMat.roughnessNode = float(visuals.ground.roughness);

  const ground = new Mesh(groundGeo, groundMat);
  ground.position.y = groundY;
  ground.receiveShadow = true;
  scene.add(ground);

  // Simple grid to make scale obvious.
  // 用网格帮助观察尺度
  const grid = new GridHelper(
    Math.max(widthMeters, depthMeters),
    visuals.grid.divisions,
    visuals.grid.majorColorHex,
    visuals.grid.minorColorHex,
  );
  grid.position.y = groundY + visuals.grid.yOffsetMeters;
  scene.add(grid);

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
  const marker = new Mesh(new BoxGeometry(s, s, s), groundMat);
  marker.position.set(0, groundY + s * 0.5, 0);
  scene.add(marker);

  return { groundY };
}
