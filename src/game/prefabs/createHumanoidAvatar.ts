import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SphereGeometry,
} from "three/webgpu";
import { color, float } from "three/tsl";
import { playerConfig } from "../../config/player";

export type HumanoidAvatar = {
  root: Group;
};

export function createHumanoidAvatar(): HumanoidAvatar {
  const avatar = playerConfig.avatar;
  const { geometry } = avatar;

  const materialBody = new MeshStandardNodeMaterial();
  materialBody.colorNode = color(...avatar.colors.bodyRgb);
  materialBody.roughnessNode = float(avatar.roughness);
  materialBody.metalnessNode = float(avatar.metalness);
  materialBody.fog = true;

  const materialHead = new MeshStandardNodeMaterial();
  materialHead.colorNode = color(...avatar.colors.headRgb);
  materialHead.roughnessNode = float(avatar.roughness);
  materialHead.metalnessNode = float(avatar.metalness);
  materialHead.fog = true;

  const materialLegs = new MeshStandardNodeMaterial();
  materialLegs.colorNode = color(...avatar.colors.legsRgb);
  materialLegs.roughnessNode = float(avatar.roughness);
  materialLegs.metalnessNode = float(avatar.metalness);
  materialLegs.fog = true;

  const root = new Group();

  // Simple humanoid made of primitives.
  // 使用基础几何体拼一个简单人体（未来可替换外部模型）
  const bodyGeo = new CylinderGeometry(
    avatar.body.radiusMeters,
    avatar.body.radiusMeters,
    avatar.body.heightMeters,
    geometry.bodyRadialSegments,
    1,
    false,
  );
  const body = new Mesh(bodyGeo, materialBody);
  body.castShadow = true;
  body.receiveShadow = true;
  body.position.y = avatar.legs.heightMeters + avatar.body.heightMeters * 0.5;
  root.add(body);

  const headGeo = new SphereGeometry(
    avatar.head.radiusMeters,
    geometry.headWidthSegments,
    geometry.headHeightSegments,
  );
  const head = new Mesh(headGeo, materialHead);
  head.castShadow = true;
  head.position.y =
    avatar.legs.heightMeters + avatar.body.heightMeters + avatar.head.radiusMeters * 1.15;
  root.add(head);

  const legGeo = new CylinderGeometry(
    avatar.legs.radiusMeters,
    avatar.legs.radiusMeters,
    avatar.legs.heightMeters,
    geometry.legsRadialSegments,
    1,
    false,
  );

  const leftLeg = new Mesh(legGeo, materialLegs);
  leftLeg.castShadow = true;
  leftLeg.position.set(-avatar.legs.spreadMeters * 0.5, avatar.legs.heightMeters * 0.5, 0);
  root.add(leftLeg);

  const rightLeg = new Mesh(legGeo, materialLegs);
  rightLeg.castShadow = true;
  rightLeg.position.set(avatar.legs.spreadMeters * 0.5, avatar.legs.heightMeters * 0.5, 0);
  root.add(rightLeg);

  return { root };
}
