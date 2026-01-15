import { worldConfig } from "../../config/world";
import type { GameResources } from "../ecs/resources";
import type { ComponentStores } from "../ecs/stores";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function movementSystem(stores: ComponentStores, resources: GameResources, dt: number) {
  const forwardDown = resources.input.isDown("KeyW") || resources.input.isDown("ArrowUp");
  const backwardDown = resources.input.isDown("KeyS") || resources.input.isDown("ArrowDown");
  const leftDown = resources.input.isDown("KeyA") || resources.input.isDown("ArrowLeft");
  const rightDown = resources.input.isDown("KeyD") || resources.input.isDown("ArrowRight");
  const sprint = resources.input.isDown("ShiftLeft") || resources.input.isDown("ShiftRight");

  const speed = sprint ? worldConfig.player.sprintSpeed : worldConfig.player.moveSpeed;

  let localX = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
  let localZ = (forwardDown ? 1 : 0) - (backwardDown ? 1 : 0);

  const len = Math.hypot(localX, localZ);
  if (len > 0) {
    localX /= len;
    localZ /= len;
  }

  const halfW = worldConfig.map.widthMeters * 0.5;
  const halfD = worldConfig.map.depthMeters * 0.5;

  for (const entityId of stores.player.keys()) {
    const transform = stores.transform.get(entityId);
    if (!transform) continue;

    if (len > 0) {
      // Build yaw-aligned basis and project the input vector.
      // 根据 yaw 构建基底，并将输入向量投影到世界空间
      const yaw = transform.yawRadians;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);

      // right = (cos, 0, -sin)
      // forward = (-sin, 0, -cos)
      const worldDx = cos * localX + -sin * localZ;
      const worldDz = -sin * localX + -cos * localZ;

      transform.x += worldDx * speed * dt;
      transform.z += worldDz * speed * dt;
    }

    transform.x = clamp(transform.x, -halfW, halfW);
    transform.z = clamp(transform.z, -halfD, halfD);
    transform.y = worldConfig.map.groundY;
  }
}
