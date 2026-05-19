// Game settings type definitions.
// 游戏设置类型定义
//
// Types are derived from runtime config objects using `typeof`.
// This ensures settings always match config without manual synchronization.
// 类型通过 `typeof` 从运行时配置对象派生。
// 这确保设置始终与配置匹配，无需手动同步。

import type {
    cameraRuntimeConfig,
    playerRuntimeConfig,
    renderRuntimeConfig,
    skyRuntimeConfig,
} from "@config/index";

/** DeepPartial: recursively makes all fields optional. / 递归使所有字段可选 */
export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Derive settings types from config objects.
// 从配置对象派生设置类型
export type PlayerSettings = typeof playerRuntimeConfig;
export type CameraSettings = typeof cameraRuntimeConfig;
export type RenderSettings = typeof renderRuntimeConfig;
export type SkySettings = typeof skyRuntimeConfig;

// Time settings (no config equivalent - runtime-only state).
// 时间设置（无对应 config - 仅运行时状态）
export type TimeSettings = {
    /** Current time of day in hours (0-24). / 当前时间（小时，0-24） */
    timeOfDay: number;
    /** Time flow speed multiplier (0 = paused, 1 = realtime, 60 = 1 min/sec). / 时间流逝速度倍数 */
    timeSpeed: number;
    /** Whether time is paused. / 是否暂停时间 */
    timePaused: boolean;
    /** Whether sun position is driven by time. / 太阳位置是否由时间驱动 */
    timeDrivenSun: boolean;
};

// EN: UI settings are shared by the game and editor shells.
// 中文: UI 设置由游戏和编辑器外壳共享。
export type UiTheme = "dark" | "light";

export type UiSettings = {
    /** Active UI theme. / 当前 UI 主题 */
    theme: UiTheme;
};

export type DebugSettings = {
    /** Show loaded collision cell shapes. / 显示已加载的碰撞 cell 形状 */
    showCollisionOverlay: boolean;
    /** Show loaded navigation nodes, links, and portals. / 显示已加载的导航节点、连接与 portal */
    showNavOverlay: boolean;
};

/**
 * Game settings - all values can be modified at runtime.
 * 游戏设置 - 所有值都可以在运行时修改
 *
 * These settings are exposed to the UI and can be changed dynamically.
 * Changes are applied immediately without requiring a restart.
 * 这些设置暴露给 UI，可以动态修改。修改立即生效，无需重启。
 */
export type GameSettings = {
    player: PlayerSettings;
    camera: CameraSettings;
    render: RenderSettings;
    sky: SkySettings;
    time: TimeSettings;
    ui: UiSettings;
    debug: DebugSettings;
};

/** Partial settings patch type (all fields optional). / 部分设置补丁类型（所有字段可选） */
export type GameSettingsPatch = DeepPartial<GameSettings>;
