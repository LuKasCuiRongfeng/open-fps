// Physics System: gravity, velocity integration, and ground collision.
// 物理系统：重力、速度积分和地面碰撞

import { playerStaticConfig } from "../../config/player";
import type { GameWorld } from "../ecs/GameEcs";
import type { GameResources } from "../ecs/resources";
import type { WorldBoundsMeters, WorldCollisionCellPack, WorldCollisionShape } from "../world/partition";

const PLAYER_COLLISION_RADIUS_METERS = 0.45;

type HorizontalTransform = {
  x: number;
  z: number;
};

/**
 * physicsSystem: integrates velocity into transform, handles gravity and collisions.
 * physicsSystem：将速度积分到位置，处理重力和碰撞
 *
 * Key behavior: when grounded, player Y is continuously snapped to terrain.
 * This ensures the player follows terrain contours while walking.
 * 关键行为：着地时，玩家 Y 持续吸附到地形。
 * 这确保玩家行走时跟随地形轮廓。
 */
export function physicsSystem(world: GameWorld, res: GameResources): void {
  const dt = res.time.dt;
  const settings = res.runtime.settings;
  const terrain = res.runtime.terrain;

  const gravity = settings.player.gravity;
  const maxFall = settings.player.maxFallSpeed;

  // Max height above terrain to still be considered "grounded" (for slopes/small bumps).
  // 仍被视为"着地"的地形以上最大高度（用于坡度/小凸起）
  const groundThreshold = 0.5;

  for (const [, transform, velocity, physics, playerInput] of world.query(
    "transform",
    "velocity",
    "physics",
    "playerInput",
  )) {
    const previousX = transform.x;
    const previousZ = transform.z;

    // Integrate horizontal velocity into position.
    // 将水平速度积分到位置
    transform.x += velocity.vx * dt;
    transform.z += velocity.vz * dt;

    resolveWorldObjectCollision(
      transform,
      previousX,
      previousZ,
      res.runtime.worldPartition.loadedCells.collision,
    );

    // Query terrain height at new XZ position.
    // 查询新 XZ 位置的地形高度
    const groundY = terrain.heightAt(transform.x, transform.z);

    if (physics.grounded) {
      // When grounded: snap Y to terrain surface (follow terrain contours).
      // 着地时：将 Y 吸附到地形表面（跟随地形轮廓）
      transform.y = groundY;
      velocity.vy = 0;
    } else {
      // Airborne: apply gravity and integrate vertical velocity.
      // 空中：应用重力并积分垂直速度
      velocity.vy -= gravity * dt;
      velocity.vy = Math.max(velocity.vy, -maxFall);
      transform.y += velocity.vy * dt;

      // Check for landing.
      // 检查是否落地
      if (transform.y <= groundY) {
        transform.y = groundY;
        velocity.vy = 0;
        physics.grounded = true;
      }
    }

    // Check if player should start falling (walked off edge or terrain dropped).
    // 检查玩家是否应该开始下落（走出边缘或地形下降）
    if (physics.grounded && transform.y > groundY + groundThreshold) {
      physics.grounded = false;
    }

    // Ground friction: decelerate when grounded with no input.
    // 地面摩擦：着地且无输入时减速
    if (physics.grounded) {
      const hasInput =
        Math.abs(playerInput.moveX) > 0.001 || Math.abs(playerInput.moveZ) > 0.001;

      if (!hasInput) {
        // Apply friction deceleration.
        // 应用摩擦减速
        const decel = playerStaticConfig.groundFrictionDeceleration;
        const currentSpeed = Math.sqrt(velocity.vx * velocity.vx + velocity.vz * velocity.vz);

        if (currentSpeed > 0.001) {
          const newSpeed = Math.max(0, currentSpeed - decel * dt);
          const factor = newSpeed / currentSpeed;
          velocity.vx *= factor;
          velocity.vz *= factor;
        } else {
          velocity.vx = 0;
          velocity.vz = 0;
        }
      }
    }
  }
}

function resolveWorldObjectCollision(
  transform: HorizontalTransform,
  previousX: number,
  previousZ: number,
  collisionCells: ReadonlyMap<string, WorldCollisionCellPack>,
): void {
  for (const cell of collisionCells.values()) {
    for (const shape of cell.shapes) {
      if (!isBlockingShape(shape)) {
        continue;
      }

      if (shape.type === "cylinder") {
        resolveCylinderCollision(transform, previousX, previousZ, shape);
      } else {
        resolveBoxCollision(transform, previousX, previousZ, shape.boundsMeters);
      }
    }
  }
}

function isBlockingShape(shape: WorldCollisionShape): boolean {
  return shape.id.startsWith("object-") && shape.boundsMeters !== undefined;
}

function resolveBoxCollision(
  transform: HorizontalTransform,
  previousX: number,
  previousZ: number,
  bounds: WorldBoundsMeters | undefined,
): void {
  if (!bounds) {
    return;
  }

  const minX = bounds.minX - PLAYER_COLLISION_RADIUS_METERS;
  const maxX = bounds.maxX + PLAYER_COLLISION_RADIUS_METERS;
  const minZ = bounds.minZ - PLAYER_COLLISION_RADIUS_METERS;
  const maxZ = bounds.maxZ + PLAYER_COLLISION_RADIUS_METERS;
  if (transform.x < minX || transform.x > maxX || transform.z < minZ || transform.z > maxZ) {
    return;
  }

  if (previousX <= minX) {
    transform.x = minX;
    return;
  }
  if (previousX >= maxX) {
    transform.x = maxX;
    return;
  }
  if (previousZ <= minZ) {
    transform.z = minZ;
    return;
  }
  if (previousZ >= maxZ) {
    transform.z = maxZ;
    return;
  }

  const pushLeft = Math.abs(transform.x - minX);
  const pushRight = Math.abs(maxX - transform.x);
  const pushBack = Math.abs(transform.z - minZ);
  const pushForward = Math.abs(maxZ - transform.z);
  const smallestPush = Math.min(pushLeft, pushRight, pushBack, pushForward);
  if (smallestPush === pushLeft) {
    transform.x = minX;
  } else if (smallestPush === pushRight) {
    transform.x = maxX;
  } else if (smallestPush === pushBack) {
    transform.z = minZ;
  } else {
    transform.z = maxZ;
  }
}

function resolveCylinderCollision(
  transform: HorizontalTransform,
  previousX: number,
  previousZ: number,
  shape: WorldCollisionShape,
): void {
  const center = shape.position;
  if (!center) {
    resolveBoxCollision(transform, previousX, previousZ, shape.boundsMeters);
    return;
  }

  const radius = (shape.radiusMeters ?? 1) + PLAYER_COLLISION_RADIUS_METERS;
  const dx = transform.x - center.x;
  const dz = transform.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= radius) {
    return;
  }

  const fallbackDx = previousX - center.x;
  const fallbackDz = previousZ - center.z;
  const safeDistance = distance > 0.001 ? distance : Math.hypot(fallbackDx, fallbackDz);
  const normalX = safeDistance > 0.001 ? (distance > 0.001 ? dx : fallbackDx) / safeDistance : 1;
  const normalZ = safeDistance > 0.001 ? (distance > 0.001 ? dz : fallbackDz) / safeDistance : 0;
  transform.x = center.x + normalX * radius;
  transform.z = center.z + normalZ * radius;
}

