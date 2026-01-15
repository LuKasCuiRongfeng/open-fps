import { Quaternion, Vector3 } from "three/webgpu";
import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

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

export function cameraSystem(stores: ComponentStores, resources: GameResources, dt: number) {
  // Single-player prototype: use the first player entity.
  // 单人原型：使用第一个玩家实体
  const firstPlayerEntry = stores.player.entries().next();
  if (firstPlayerEntry.done) return;

  const [entityId, player] = firstPlayerEntry.value;
  const transform = stores.transform.get(entityId);
  if (!transform) return;

  const groundY = worldConfig.map.groundY;
  const eyeY = transform.y + worldConfig.player.eyeHeightMeters;

  vTarget.set(transform.x, eyeY, transform.z);

  const yaw = transform.yawRadians;
  const pitch = transform.pitchRadians;

  if (player.cameraMode === "firstPerson") {
    resources.camera.position.copy(vTarget);

    qYaw.setFromAxisAngle(AXIS_Y, yaw);
    qPitch.setFromAxisAngle(AXIS_X, pitch);
    q.copy(qYaw).multiply(qPitch);
    resources.camera.quaternion.copy(q);
    return;
  }

  const follow = worldConfig.player.thirdPerson;
  const followLerp = dampFactorPerSecond(follow.followLerpPerSecond, dt);

  let distance: number = follow.chase.followDistanceMeters;
  let height: number = follow.chase.heightOffsetMeters;
  let shoulder: number = 0;

  if (player.thirdPersonStyle === "overShoulder") {
    distance = follow.overShoulder.followDistanceMeters;
    height = follow.overShoulder.heightOffsetMeters;
    shoulder = follow.overShoulder.shoulderOffsetMeters;
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
  vDesiredCam.y = Math.max(vDesiredCam.y, groundY + worldConfig.camera.nearMeters * 2);

  resources.camera.position.set(
    lerp(resources.camera.position.x, vDesiredCam.x, followLerp),
    lerp(resources.camera.position.y, vDesiredCam.y, followLerp),
    lerp(resources.camera.position.z, vDesiredCam.z, followLerp),
  );

  resources.camera.lookAt(vTarget);
}
