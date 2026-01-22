// Camera System: positions and orients the camera based on player state.
// 相机系统：根据玩家状态定位和朝向相机

import { Quaternion, Vector3 } from "three/webgpu";
import { cameraStaticConfig } from "../../config/camera";
import { playerStaticConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function dampFactorPerSecond(ratePerSecond: number, dt: number) {
  return 1 - Math.exp(-ratePerSecond * dt);
}

const vTarget = new Vector3();
const vDesiredCam = new Vector3();
const qYaw = new Quaternion();
const qPitch = new Quaternion();
const q = new Quaternion();

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0);

/**
 * cameraSystem: updates camera position and orientation based on player.
 * cameraSystem：根据玩家更新相机位置和朝向
 */
export function cameraSystem(world: GameWorld, res: GameResources): void {
  const dt = res.time.dt;
  const camera = res.singletons.camera;
  const terrain = res.runtime.terrain;
  const settings = res.runtime.settings;

  // Get the first player entity.
  // 获取第一个玩家实体
  const result = world.queryOne("transform", "player");
  if (!result) return;

  const [, transform, player] = result;

  const eyeY = transform.y + playerStaticConfig.eyeHeightMeters;
  vTarget.set(transform.x, eyeY, transform.z);

  const yaw = transform.yawRadians;
  const pitch = transform.pitchRadians;

  if (player.cameraMode === "firstPerson") {
    camera.position.copy(vTarget);

    qYaw.setFromAxisAngle(AXIS_Y, yaw);
    qPitch.setFromAxisAngle(AXIS_X, pitch);
    q.copy(qYaw).multiply(qPitch);
    camera.quaternion.copy(q);
    return;
  }

  // Third person camera.
  // 第三人称相机
  const p = settings.player;
  const followLerp = dampFactorPerSecond(p.followLerpPerSecond, dt);

  let distance: number = p.chaseFollowDistance;
  let height: number = p.chaseHeightOffset;
  let shoulder: number = 0;

  if (player.thirdPersonStyle === "overShoulder") {
    distance = p.overShoulderFollowDistance;
    height = p.overShoulderHeightOffset;
    shoulder = p.overShoulderOffset;
  }

  // Offset in rig-local space: x = shoulder, y = height, z = behind.
  // 在玩家局部空间的偏移：x=肩偏移，y=高度，z=向后
  vDesiredCam.set(shoulder, height, distance);

  qYaw.setFromAxisAngle(AXIS_Y, yaw);
  qPitch.setFromAxisAngle(AXIS_X, pitch);
  q.copy(qYaw).multiply(qPitch);

  vDesiredCam.applyQuaternion(q);
  vDesiredCam.add(vTarget);

  // Prevent camera below ground.
  // 防止相机低于地面
  const groundY = terrain.heightAt(vDesiredCam.x, vDesiredCam.z);
  vDesiredCam.y = Math.max(vDesiredCam.y, groundY + cameraStaticConfig.nearMeters * 2);

  camera.position.set(
    lerp(camera.position.x, vDesiredCam.x, followLerp),
    lerp(camera.position.y, vDesiredCam.y, followLerp),
    lerp(camera.position.z, vDesiredCam.z, followLerp),
  );

  camera.lookAt(vTarget);
}
