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

// Editor mouse action type.
// 编辑器鼠标动作类型
export type EditorMouseAction = "brush" | "orbit" | "pan";

// Editor settings (no config equivalent - editor-only).
// 编辑器设置（无对应 config - 仅编辑器使用）
export type EditorSettings = {
    leftButton: EditorMouseAction;
    rightButton: EditorMouseAction;
    middleButton: EditorMouseAction;
    /** When true, drag operations continue even if mouse leaves window. / 为 true 时，拖拽操作在鼠标离开窗口后继续 */
    stickyDrag: boolean;
};

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
    editor: EditorSettings;
    time: TimeSettings;
};

/** Partial settings patch type (all fields optional). / 部分设置补丁类型（所有字段可选） */
export type GameSettingsPatch = DeepPartial<GameSettings>;
