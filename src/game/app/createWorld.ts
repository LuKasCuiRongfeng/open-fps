import {
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Scene,
} from "three/webgpu";
import { terrainConfig } from "@config/terrain";
import { fogRuntimeConfig, fogStaticConfig } from "@config/fog";
import { skyRuntimeConfig, skyStaticConfig } from "@config/sky";
import { createTerrainSystem } from "../world/terrain/terrain";
import { SkySystem } from "../world/sky/SkySystem";
import { createDefaultGameSettings } from "../settings";

export function createWorld(scene: Scene) {
  const skySettings = createDefaultGameSettings().sky;
  const sunPos = skyStaticConfig.sunPosition;
  const sunDist = Math.sqrt(sunPos[0] ** 2 + sunPos[1] ** 2 + sunPos[2] ** 2);
  skySettings.sunElevation = Math.asin(sunPos[1] / sunDist) * (180 / Math.PI);
  skySettings.sunAzimuth = Math.atan2(sunPos[0], sunPos[2]) * (180 / Math.PI);

  const skySystem = new SkySystem(scene, skySettings);

  scene.fog = new FogExp2(fogStaticConfig.colorHex, fogRuntimeConfig.densityPerMeter);

  const terrain = createTerrainSystem(terrainConfig, scene);
  scene.add(terrain.root);

  const hemi = new HemisphereLight(
    skyStaticConfig.hemiSkyColorHex,
    skyStaticConfig.hemiGroundColorHex,
    skyRuntimeConfig.ambientIntensity,
  );
  scene.add(hemi);

  const sun = new DirectionalLight(skyStaticConfig.sunColorHex, skyRuntimeConfig.sunIntensity);
  sun.position.set(...skyStaticConfig.sunPosition);
  sun.castShadow = true;

  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  const shadowSize = 200;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;

  scene.add(sun);
  skySystem.setDirectionalLight(sun);

  return { terrain, sun, hemi, skySystem };
}