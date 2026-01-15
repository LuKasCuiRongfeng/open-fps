import { worldConfig } from "../../config/world";

export type GameSettings = {
  player: {
    mouseSensitivity: number;
    moveSpeed: number;
    sprintSpeed: number;
    jumpVelocity: number;
    gravity: number;
    maxFallSpeed: number;
    thirdPerson: {
      chase: {
        followDistance: number;
        heightOffset: number;
      };
      overShoulder: {
        followDistance: number;
        heightOffset: number;
        shoulderOffset: number;
      };
      followLerpPerSecond: number;
    };
  };
  camera: {
    fovDegrees: number;
  };
  render: {
    maxPixelRatio: number;
  };
};

export type GameSettingsPatch = {
  player?: {
    mouseSensitivity?: number;
    moveSpeed?: number;
    sprintSpeed?: number;
    jumpVelocity?: number;
    gravity?: number;
    maxFallSpeed?: number;
    thirdPerson?: {
      chase?: {
        followDistance?: number;
        heightOffset?: number;
      };
      overShoulder?: {
        followDistance?: number;
        heightOffset?: number;
        shoulderOffset?: number;
      };
      followLerpPerSecond?: number;
    };
  };
  camera?: {
    fovDegrees?: number;
  };
  render?: {
    maxPixelRatio?: number;
  };
};

export function createDefaultGameSettings(): GameSettings {
  return {
    player: {
      mouseSensitivity: worldConfig.player.mouseSensitivity,
      moveSpeed: worldConfig.player.moveSpeed,
      sprintSpeed: worldConfig.player.sprintSpeed,
      jumpVelocity: worldConfig.player.jump.velocityMetersPerSecond,
      gravity: worldConfig.player.physics.gravityMetersPerSecond2,
      maxFallSpeed: worldConfig.player.physics.maxFallSpeedMetersPerSecond,
      thirdPerson: {
        chase: {
          followDistance: worldConfig.player.thirdPerson.chase.followDistanceMeters,
          heightOffset: worldConfig.player.thirdPerson.chase.heightOffsetMeters,
        },
        overShoulder: {
          followDistance: worldConfig.player.thirdPerson.overShoulder.followDistanceMeters,
          heightOffset: worldConfig.player.thirdPerson.overShoulder.heightOffsetMeters,
          shoulderOffset: worldConfig.player.thirdPerson.overShoulder.shoulderOffsetMeters,
        },
        followLerpPerSecond: worldConfig.player.thirdPerson.followLerpPerSecond,
      },
    },
    camera: {
      fovDegrees: worldConfig.camera.fovDegrees,
    },
    render: {
      maxPixelRatio: worldConfig.render.maxPixelRatio,
    },
  };
}

export function applySettingsPatch(settings: GameSettings, patch: GameSettingsPatch) {
  // Shallow merge with nested known sections.
  // 浅合并 + 针对嵌套部分做最小合并
  if (patch.player) {
    settings.player.mouseSensitivity = patch.player.mouseSensitivity ?? settings.player.mouseSensitivity;
    settings.player.moveSpeed = patch.player.moveSpeed ?? settings.player.moveSpeed;
    settings.player.sprintSpeed = patch.player.sprintSpeed ?? settings.player.sprintSpeed;
    settings.player.jumpVelocity = patch.player.jumpVelocity ?? settings.player.jumpVelocity;
    settings.player.gravity = patch.player.gravity ?? settings.player.gravity;
    settings.player.maxFallSpeed = patch.player.maxFallSpeed ?? settings.player.maxFallSpeed;

    if (patch.player.thirdPerson) {
      const tp = patch.player.thirdPerson;
      if (tp.chase) {
        settings.player.thirdPerson.chase.followDistance =
          tp.chase.followDistance ?? settings.player.thirdPerson.chase.followDistance;
        settings.player.thirdPerson.chase.heightOffset =
          tp.chase.heightOffset ?? settings.player.thirdPerson.chase.heightOffset;
      }
      if (tp.overShoulder) {
        settings.player.thirdPerson.overShoulder.followDistance =
          tp.overShoulder.followDistance ?? settings.player.thirdPerson.overShoulder.followDistance;
        settings.player.thirdPerson.overShoulder.heightOffset =
          tp.overShoulder.heightOffset ?? settings.player.thirdPerson.overShoulder.heightOffset;
        settings.player.thirdPerson.overShoulder.shoulderOffset =
          tp.overShoulder.shoulderOffset ?? settings.player.thirdPerson.overShoulder.shoulderOffset;
      }
      settings.player.thirdPerson.followLerpPerSecond =
        tp.followLerpPerSecond ?? settings.player.thirdPerson.followLerpPerSecond;
    }
  }

  if (patch.camera) {
    settings.camera.fovDegrees = patch.camera.fovDegrees ?? settings.camera.fovDegrees;
  }

  if (patch.render) {
    settings.render.maxPixelRatio = patch.render.maxPixelRatio ?? settings.render.maxPixelRatio;
  }
}

export function cloneSettings(settings: GameSettings): GameSettings {
  return structuredClone(settings);
}

export function setSettings(settings: GameSettings, next: GameSettings) {
  settings.player.mouseSensitivity = next.player.mouseSensitivity;
  settings.player.moveSpeed = next.player.moveSpeed;
  settings.player.sprintSpeed = next.player.sprintSpeed;
  settings.player.jumpVelocity = next.player.jumpVelocity;
  settings.player.gravity = next.player.gravity;
  settings.player.maxFallSpeed = next.player.maxFallSpeed;

  settings.player.thirdPerson.chase.followDistance = next.player.thirdPerson.chase.followDistance;
  settings.player.thirdPerson.chase.heightOffset = next.player.thirdPerson.chase.heightOffset;
  settings.player.thirdPerson.overShoulder.followDistance = next.player.thirdPerson.overShoulder.followDistance;
  settings.player.thirdPerson.overShoulder.heightOffset = next.player.thirdPerson.overShoulder.heightOffset;
  settings.player.thirdPerson.overShoulder.shoulderOffset = next.player.thirdPerson.overShoulder.shoulderOffset;
  settings.player.thirdPerson.followLerpPerSecond = next.player.thirdPerson.followLerpPerSecond;

  settings.camera.fovDegrees = next.camera.fovDegrees;
  settings.render.maxPixelRatio = next.render.maxPixelRatio;
}
