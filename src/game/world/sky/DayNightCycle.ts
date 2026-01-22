// DayNightCycle: time-based sun position and lighting calculations.
// DayNightCycle：基于时间的太阳位置和光照计算

import { Color, MathUtils } from "three/webgpu";

/**
 * Calculate sun position from time of day.
 * 根据一天中的时间计算太阳位置
 *
 * @param timeOfDay - Hours (0-24), where 12 = noon (sun at highest).
 * @param latitude - Latitude in degrees (default 45° for temperate zone).
 * @returns Sun elevation and azimuth angles in degrees.
 */
export function timeToSunPosition(
  timeOfDay: number,
  latitude = 45
): { elevation: number; azimuth: number } {
  // Normalize time to 0-24 range.
  // 将时间标准化到 0-24 范围
  const t = ((timeOfDay % 24) + 24) % 24;

  // Solar hour angle: 0 at noon, -180 at midnight, +/-90 at 6am/6pm.
  // 太阳时角：正午为0，午夜为-180，早6点/晚6点为 +/-90
  const hourAngle = (t - 12) * 15;

  // Simplified sun position calculation (assumes equinox, declination = 0).
  // 简化的太阳位置计算（假设春分/秋分，赤纬 = 0）
  const latRad = (latitude * Math.PI) / 180;
  const haRad = (hourAngle * Math.PI) / 180;

  // sin(elevation) = cos(lat) * cos(ha) at equinox.
  // 春分/秋分时 sin(elevation) = cos(lat) * cos(ha)
  const sinElevation = Math.cos(latRad) * Math.cos(haRad);
  const elevation = Math.asin(sinElevation) * (180 / Math.PI);

  // Azimuth: sun from east (90°) through south (180°) to west (270°).
  // 方位角：太阳从东(90°)经南(180°)到西(270°)
  const azimuth = (90 + (t / 24) * 360) % 360;

  return {
    elevation: Math.max(-90, elevation),
    azimuth,
  };
}

/**
 * Calculate day factor from sun elevation.
 * 根据太阳仰角计算白天因子
 *
 * @param sunElevation - Sun elevation in degrees.
 * @returns Day factor (0 = full night, 1 = full day).
 */
export function calculateDayFactor(sunElevation: number): number {
  // Civil twilight: -6° to 0°
  // Nautical twilight: -12° to -6°
  // Astronomical twilight: -18° to -12°
  // Night: below -18°

  if (sunElevation >= 10) {
    return 1.0;
  } else if (sunElevation >= 0) {
    return 0.7 + (sunElevation / 10) * 0.3;
  } else if (sunElevation >= -6) {
    return 0.3 + ((sunElevation + 6) / 6) * 0.4;
  } else if (sunElevation >= -12) {
    return 0.1 + ((sunElevation + 12) / 6) * 0.2;
  } else if (sunElevation >= -18) {
    return ((sunElevation + 18) / 6) * 0.1;
  } else {
    return 0.0;
  }
}

/**
 * Calculate sun color based on elevation (redder at horizon).
 * 根据仰角计算太阳颜色（地平线更红）
 */
export function calculateSunColor(sunElevation: number): Color {
  const color = new Color();

  if (sunElevation < -6) {
    // Night: dim blue-white (moonlight-ish).
    // 夜晚：暗淡的蓝白色（类似月光）
    color.setRGB(0.3, 0.35, 0.5);
  } else if (sunElevation < 0) {
    // Deep twilight: purple-orange.
    // 深曙暮光：紫橙色
    const t = (sunElevation + 6) / 6;
    color.setRGB(0.3 + t * 0.7, 0.35 + t * 0.15, 0.5 - t * 0.3);
  } else if (sunElevation < 10) {
    // Sunrise/sunset: deep red-orange to orange.
    // 日出/日落：深红橙到橙色
    const t = sunElevation / 10;
    color.setRGB(1.0, 0.5 + t * 0.35, 0.2 + t * 0.5);
  } else if (sunElevation < 30) {
    // Morning/evening: orange to warm white.
    // 早晨/傍晚：橙色到暖白色
    const t = (sunElevation - 10) / 20;
    color.setRGB(1.0, 0.85 + t * 0.1, 0.7 + t * 0.2);
  } else {
    // Midday: warm white.
    // 正午：暖白色
    color.setRGB(1.0, 0.95, 0.9);
  }

  return color;
}

/**
 * Calculate directional light color and intensity based on sun elevation.
 * 根据太阳仰角计算方向光颜色和强度
 */
export function calculateLightSettings(sunElevation: number): {
  color: Color;
  intensity: number;
} {
  const color = new Color();
  let intensity: number;

  if (sunElevation < -12) {
    // Deep night: very dim blue.
    // 深夜：非常暗的蓝色
    color.setRGB(0.1, 0.12, 0.2);
    intensity = 0.02;
  } else if (sunElevation < -6) {
    // Nautical twilight.
    // 航海曙暮光
    const t = (sunElevation + 12) / 6;
    color.setRGB(0.1 + t * 0.3, 0.12 + t * 0.2, 0.2 + t * 0.1);
    intensity = 0.02 + t * 0.05;
  } else if (sunElevation < 0) {
    // Civil twilight: dim orange-pink.
    // 民用曙暮光：暗淡的橙粉色
    const t = (sunElevation + 6) / 6;
    color.setRGB(0.4 + t * 0.5, 0.32 + t * 0.18, 0.3 - t * 0.1);
    intensity = 0.07 + t * 0.15;
  } else if (sunElevation < 10) {
    // Golden hour: warm orange.
    // 黄金时刻：暖橙色
    const t = sunElevation / 10;
    color.setRGB(0.9 + t * 0.1, 0.5 + t * 0.35, 0.2 + t * 0.4);
    intensity = 0.22 + t * 0.25;
  } else if (sunElevation < 30) {
    // Morning/afternoon: warming up.
    // 上午/下午：变暖
    const t = (sunElevation - 10) / 20;
    color.setRGB(1.0, 0.85 + t * 0.1, 0.6 + t * 0.25);
    intensity = 0.47 + t * 0.15;
  } else {
    // Midday: bright warm white.
    // 正午：明亮的暖白色
    const t = Math.min(1, (sunElevation - 30) / 60);
    color.setRGB(1.0, 0.95 + t * 0.05, 0.85 + t * 0.1);
    intensity = 0.62 + t * 0.08;
  }

  return { color, intensity };
}

/**
 * Convert elevation/azimuth to Cartesian sun direction vector.
 * 将仰角/方位角转换为笛卡尔太阳方向向量
 */
export function sunPositionToDirection(
  elevation: number,
  azimuth: number
): { x: number; y: number; z: number } {
  const phi = MathUtils.degToRad(90 - elevation);
  const theta = MathUtils.degToRad(azimuth);

  return {
    x: Math.sin(phi) * Math.sin(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.cos(theta),
  };
}
