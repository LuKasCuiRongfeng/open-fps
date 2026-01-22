import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
} from "three/webgpu";
import { color, float } from "three/tsl";
import { playerStaticConfig } from "../../config/player";

export type HumanoidAvatar = {
  root: Group;
};

export function createHumanoidAvatar(): HumanoidAvatar {
  const cfg = playerStaticConfig;

  const materialBody = new MeshStandardNodeMaterial();
  materialBody.colorNode = color(...cfg.avatarBodyColor);
  materialBody.roughnessNode = float(cfg.avatarRoughness);
  materialBody.metalnessNode = float(cfg.avatarMetalness);
  materialBody.fog = true;

  const materialHead = new MeshStandardNodeMaterial();
  materialHead.colorNode = color(...cfg.avatarHeadColor);
  materialHead.roughnessNode = float(cfg.avatarRoughness);
  materialHead.metalnessNode = float(cfg.avatarMetalness);
  materialHead.fog = true;

  const materialLegs = new MeshStandardNodeMaterial();
  materialLegs.colorNode = color(...cfg.avatarLegsColor);
  materialLegs.roughnessNode = float(cfg.avatarRoughness);
  materialLegs.metalnessNode = float(cfg.avatarMetalness);
  materialLegs.fog = true;

  const root = new Group();

  // Simple humanoid made of primitives.
  // 使用基础几何体拼一个简单人体（未来可替换外部模型）
  const bodyGeo = new CylinderGeometry(
    cfg.avatarBodyRadius,
    cfg.avatarBodyRadius,
    cfg.avatarBodyHeight,
    cfg.avatarBodySegments,
    1,
    false,
  );
  const body = new Mesh(bodyGeo, materialBody);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = cfg.avatarLegsHeight + cfg.avatarBodyHeight * 0.5;
  root.add(body);

  const headGeo = new SphereGeometry(
    cfg.avatarHeadRadius,
    cfg.avatarHeadWidthSegments,
    cfg.avatarHeadHeightSegments,
  );
  const head = new Mesh(headGeo, materialHead);
  head.castShadow = true;
  head.position.y =
    cfg.avatarLegsHeight + cfg.avatarBodyHeight + cfg.avatarHeadRadius * 1.15;
  root.add(head);

  const legGeo = new CylinderGeometry(
    cfg.avatarLegsRadius,
    cfg.avatarLegsRadius,
    cfg.avatarLegsHeight,
    cfg.avatarLegsSegments,
    1,
    false,
  );

  const leftLeg = new Mesh(legGeo, materialLegs);
  leftLeg.castShadow = true;
  leftLeg.position.set(-cfg.avatarLegsSpread * 0.5, cfg.avatarLegsHeight * 0.5, 0);
  root.add(leftLeg);

  const rightLeg = new Mesh(legGeo, materialLegs);
  rightLeg.castShadow = true;
  rightLeg.position.set(cfg.avatarLegsSpread * 0.5, cfg.avatarLegsHeight * 0.5, 0);
  root.add(rightLeg);

  return { root };
}
