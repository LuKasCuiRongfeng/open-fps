// ECS Components - plain data, no methods.
// ECS 组件 - 纯数据，无方法

import type { Group } from "three/webgpu";
import type { CameraMode, ThirdPersonStyle } from "../../config/camera";

// --- Core Components / 核心组件 ---

/**
 * Transform: position and orientation in world space.
 * Transform：世界空间中的位置和朝向
 */
export type TransformComponent = {
  x: number;
  y: number;
  z: number;
  yawRadians: number;
  pitchRadians: number;

  // Smoothed target orientation (for interpolation).
  // 平滑目标朝向（用于插值）
  targetYawRadians: number;
  targetPitchRadians: number;
};

/**
 * Velocity: linear velocity in world space (m/s).
 * Velocity：世界空间中的线速度（米/秒）
 *
 * Industry best practice: separate velocity from transform for proper physics integration.
 * 业界最佳实践：将速度与位置分离，便于正确的物理积分
 */
export type VelocityComponent = {
  vx: number;
  vy: number;
  vz: number;
};

// --- Physics Components / 物理组件 ---

/**
 * Physics state: grounded flag and related physics state.
 * Physics 状态：着地标志和相关物理状态
 */
export type PhysicsComponent = {
  grounded: boolean;
  // Future: friction, bounciness, etc.
  // 未来：摩擦力、弹性等
};

/**
 * Collider: defines collision shape (for future use).
 * Collider：定义碰撞形状（未来使用）
 */
export type ColliderComponent = {
  type: "capsule" | "box" | "sphere";
  // Capsule: height is total height, radius is capsule radius.
  // Capsule：height 是总高度，radius 是胶囊半径
  height: number;
  radius: number;
};

// --- Input Components / 输入组件 ---

/**
 * PlayerInput: processed input state per frame.
 * PlayerInput：每帧处理后的输入状态
 *
 * Industry best practice: decouple raw input from gameplay logic.
 * 业界最佳实践：将原始输入与游戏逻辑解耦
 * This enables: replay systems, AI control, network sync.
 * 这样可以实现：回放系统、AI 控制、网络同步
 */
export type PlayerInputComponent = {
  // Movement intent (normalized -1..1).
  // 移动意图（归一化 -1..1）
  moveX: number;
  moveZ: number;

  // Sprint flag.
  // 冲刺标志
  sprint: boolean;

  // Jump intent (consumed after use).
  // 跳跃意图（使用后消耗）
  jump: boolean;

  // Look delta (radians this frame).
  // 视角增量（本帧弧度）
  lookDeltaYaw: number;
  lookDeltaPitch: number;

  // Camera mode toggle (consumed after use).
  // 相机模式切换（使用后消耗）
  toggleCameraMode: boolean;
  toggleThirdPersonStyle: boolean;
};

// --- Player Components / 玩家组件 ---

/**
 * Player: marker component for player-controlled entities.
 * Player：玩家控制实体的标记组件
 */
export type PlayerComponent = {
  cameraMode: CameraMode;
  thirdPersonStyle: ThirdPersonStyle;
};

// --- Render Components / 渲染组件 ---

/**
 * Avatar: reference to Three.js object for rendering.
 * Avatar：Three.js 对象的引用，用于渲染
 */
export type AvatarComponent = {
  object: Group;
};

// --- Component Store Keys / 组件存储键 ---

/**
 * All component types mapped by key.
 * 所有组件类型的键映射
 *
 * This defines the shape of our ECS stores.
 * 这定义了 ECS 存储的结构
 */
export type ComponentTypes = {
  transform: TransformComponent;
  velocity: VelocityComponent;
  physics: PhysicsComponent;
  collider: ColliderComponent;
  playerInput: PlayerInputComponent;
  player: PlayerComponent;
  avatar: AvatarComponent;
};

/**
 * All component keys as a tuple (for EcsWorld initialization).
 * 所有组件键的元组（用于 EcsWorld 初始化）
 */
export const COMPONENT_KEYS: (keyof ComponentTypes)[] = [
  "transform",
  "velocity",
  "physics",
  "collider",
  "playerInput",
  "player",
  "avatar",
];

