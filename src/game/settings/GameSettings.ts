import { cameraConfig } from "../../config/camera";
import { playerConfig } from "../../config/player";
import { renderConfig } from "../../config/render";
import { visualsConfig } from "../../config/visuals";

export type GameSettings = {
  player: {
    mouseSensitivity: number;
    moveSpeed: number;
    sprintBonus: number;
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
  fog: {
    density: number;
  };
};

export type GameSettingsPatch = {
  player?: {
    mouseSensitivity?: number;
    moveSpeed?: number;
    sprintBonus?: number;
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
  fog?: {
    density?: number;
  };
};

export function createDefaultGameSettings(): GameSettings {
  return {
    player: {
      mouseSensitivity: playerConfig.mouseSensitivity,
      moveSpeed: playerConfig.moveSpeed,
      sprintBonus: playerConfig.sprintBonus,
      jumpVelocity: playerConfig.jump.velocityMetersPerSecond,
      gravity: playerConfig.physics.gravityMetersPerSecond2,
      maxFallSpeed: playerConfig.physics.maxFallSpeedMetersPerSecond,
      thirdPerson: {
        chase: {
          followDistance: playerConfig.thirdPerson.chase.followDistanceMeters,
          heightOffset: playerConfig.thirdPerson.chase.heightOffsetMeters,
        },
        overShoulder: {
          followDistance: playerConfig.thirdPerson.overShoulder.followDistanceMeters,
          heightOffset: playerConfig.thirdPerson.overShoulder.heightOffsetMeters,
          shoulderOffset: playerConfig.thirdPerson.overShoulder.shoulderOffsetMeters,
        },
        followLerpPerSecond: playerConfig.thirdPerson.followLerpPerSecond,
      },
    },
    camera: {
      fovDegrees: cameraConfig.fovDegrees,
    },
    render: {
      maxPixelRatio: renderConfig.maxPixelRatio,
    },
    fog: {
      density: visualsConfig.fog.densityPerMeter,
    },
  };
}

export function applySettingsPatch(settings: GameSettings, patch: GameSettingsPatch) {
  // Shallow merge with nested known sections.
  // 浅合并 + 针对嵌套部分做最小合并
  if (patch.player) {
    settings.player.mouseSensitivity = patch.player.mouseSensitivity ?? settings.player.mouseSensitivity;
    settings.player.moveSpeed = patch.player.moveSpeed ?? settings.player.moveSpeed;
    settings.player.sprintBonus = patch.player.sprintBonus ?? settings.player.sprintBonus;
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

  if (patch.fog) {
    settings.fog.density = patch.fog.density ?? settings.fog.density;
  }
}

export function cloneSettings(settings: GameSettings): GameSettings {
  return structuredClone(settings);
}

export function setSettings(settings: GameSettings, next: GameSettings) {
  settings.player.mouseSensitivity = next.player.mouseSensitivity;
  settings.player.moveSpeed = next.player.moveSpeed;
  settings.player.sprintBonus = next.player.sprintBonus;
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
  settings.fog.density = next.fog.density;
}
