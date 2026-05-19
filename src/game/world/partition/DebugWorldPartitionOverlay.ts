// DebugWorldPartitionOverlay: collision and nav visualization for loaded partition cells.
// DebugWorldPartitionOverlay：已加载分区 cell 的碰撞与导航可视化。

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Material,
  type Object3D,
  type Scene,
} from "three/webgpu";
import type { WorldCollisionCellPack, WorldCollisionShape, WorldNavCellPack, WorldNavNode } from "./WorldPartitionPayloads";

export type DebugWorldPartitionOverlaySettings = {
  collision: boolean;
  nav: boolean;
};

export class DebugWorldPartitionOverlay {
  private readonly root = new Group();
  private readonly collisionRoot = new Group();
  private readonly navRoot = new Group();
  private readonly collisionMaterial = new MeshBasicMaterial({ color: 0xff4d6d, opacity: 0.22, transparent: true, wireframe: true, depthWrite: false });
  private readonly navNodeMaterial = new MeshBasicMaterial({ color: 0x2fe6a7, opacity: 0.65, transparent: true, depthWrite: false });
  private readonly navLinkMaterial = new LineBasicMaterial({ color: 0x42a5ff, transparent: true, opacity: 0.72, depthWrite: false });
  private readonly navPortalMaterial = new LineBasicMaterial({ color: 0xffcc4d, transparent: true, opacity: 0.82, depthWrite: false });
  private collisionEnabled = false;
  private navEnabled = false;

  constructor() {
    this.root.name = "DebugWorldPartitionOverlay";
    this.root.renderOrder = 30;
    this.collisionRoot.name = "CollisionOverlay";
    this.navRoot.name = "NavOverlay";
    this.root.add(this.collisionRoot, this.navRoot);
    this.applyVisibility();
  }

  attach(scene: Scene): void {
    if (this.root.parent !== scene) {
      scene.add(this.root);
    }
  }

  detach(): void {
    this.root.removeFromParent();
  }

  setVisibility(settings: DebugWorldPartitionOverlaySettings): void {
    this.collisionEnabled = settings.collision;
    this.navEnabled = settings.nav;
    this.applyVisibility();
  }

  setCollisionCells(cells: Iterable<WorldCollisionCellPack>): void {
    clearGroup(this.collisionRoot, false);
    for (const cell of cells) {
      for (const shape of cell.shapes) {
        const object = createCollisionShapeObject(shape, this.collisionMaterial);
        if (object) {
          this.collisionRoot.add(object);
        }
      }
    }
  }

  setNavCells(cells: Iterable<WorldNavCellPack>): void {
    clearGroup(this.navRoot, false);
    const nodeById = new Map<string, WorldNavNode>();
    const cellByKey = new Map<string, WorldNavCellPack>();
    const linePositions: number[] = [];
    const portalPositions: number[] = [];

    for (const cell of cells) {
      cellByKey.set(cell.cell.key, cell);
      for (const node of cell.nodes) {
        if (!node.walkable) {
          continue;
        }

        nodeById.set(node.id, node);
        this.navRoot.add(createNavNodeObject(node, this.navNodeMaterial));
      }
    }

    for (const cell of cellByKey.values()) {
      for (const link of cell.links) {
        const from = nodeById.get(link.from);
        const to = nodeById.get(link.to);
        if (from && to) {
          pushLine(linePositions, from, to, 0.18);
        }
      }

      for (const portal of cell.crossCellLinks ?? []) {
        const from = nodeById.get(portal.from);
        const targetCell = cellByKey.get(portal.targetCell);
        const to = from && targetCell ? findNearestNode(targetCell.nodes, from.position.x, from.position.z) : null;
        if (from && to) {
          pushLine(portalPositions, from, to, 0.34);
        }
      }
    }

    if (linePositions.length > 0) {
      this.navRoot.add(createLineSegments(linePositions, this.navLinkMaterial, "NavLinks"));
    }
    if (portalPositions.length > 0) {
      this.navRoot.add(createLineSegments(portalPositions, this.navPortalMaterial, "NavPortalLinks"));
    }
  }

  clear(): void {
    clearGroup(this.collisionRoot, false);
    clearGroup(this.navRoot, false);
  }

  dispose(): void {
    this.detach();
    this.clear();
    this.collisionMaterial.dispose();
    this.navNodeMaterial.dispose();
    this.navLinkMaterial.dispose();
    this.navPortalMaterial.dispose();
  }

  private applyVisibility(): void {
    this.collisionRoot.visible = this.collisionEnabled;
    this.navRoot.visible = this.navEnabled;
    this.root.visible = this.collisionEnabled || this.navEnabled;
  }
}

function createCollisionShapeObject(shape: WorldCollisionShape, material: Material): Object3D | null {
  if (shape.boundsMeters) {
    const width = Math.max(0.1, shape.boundsMeters.maxX - shape.boundsMeters.minX);
    const depth = Math.max(0.1, shape.boundsMeters.maxZ - shape.boundsMeters.minZ);
    const height = shape.heightMeters ?? 2;
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.position.set(
      (shape.boundsMeters.minX + shape.boundsMeters.maxX) * 0.5,
      (shape.position?.y ?? 0) + height * 0.5,
      (shape.boundsMeters.minZ + shape.boundsMeters.maxZ) * 0.5,
    );
    mesh.name = `Collision:${shape.id}`;
    return mesh;
  }

  if (shape.radiusMeters && shape.position) {
    const height = shape.heightMeters ?? Math.max(1, shape.radiusMeters * 2);
    const mesh = new Mesh(new CylinderGeometry(shape.radiusMeters, shape.radiusMeters, height, 16, 1, true), material);
    mesh.position.set(shape.position.x, shape.position.y + height * 0.5, shape.position.z);
    mesh.name = `Collision:${shape.id}`;
    return mesh;
  }

  return null;
}

function createNavNodeObject(node: WorldNavNode, material: Material): Object3D {
  const mesh = new Mesh(new SphereGeometry(0.9, 8, 4), material);
  mesh.position.set(node.position.x, node.position.y + 0.45, node.position.z);
  mesh.name = `NavNode:${node.id}`;
  return mesh;
}

function createLineSegments(positions: number[], material: Material, name: string): Object3D {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const lines = new LineSegments(geometry, material);
  lines.name = name;
  return lines;
}

function pushLine(positions: number[], from: WorldNavNode, to: WorldNavNode, yOffset: number): void {
  positions.push(
    from.position.x, from.position.y + yOffset, from.position.z,
    to.position.x, to.position.y + yOffset, to.position.z,
  );
}

function findNearestNode(nodes: readonly WorldNavNode[], x: number, z: number): WorldNavNode | null {
  let bestNode: WorldNavNode | null = null;
  let bestDistanceSq = Infinity;
  for (const node of nodes) {
    if (!node.walkable) {
      continue;
    }

    const dx = node.position.x - x;
    const dz = node.position.z - z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestNode = node;
    }
  }

  return bestNode;
}

function clearGroup(group: Group, disposeMaterial: boolean): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child, disposeMaterial);
  }
}

function disposeObject(object: Object3D, disposeMaterial: boolean): void {
  object.traverse((child) => {
    const mesh = child as Mesh | LineSegments;
    mesh.geometry?.dispose();
    if (disposeMaterial) {
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material?.dispose();
      }
    }
  });
}
