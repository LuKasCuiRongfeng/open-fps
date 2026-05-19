// WorldNavQuery: lightweight AI queries over loaded cooked navigation cells.
// WorldNavQuery：面向已加载 cooked 导航 cell 的轻量 AI 查询。

import type { WorldNavCellPack, WorldNavLink, WorldNavNode } from "./WorldPartitionPayloads";

export type WorldNavGraph = {
  nodes: Map<string, WorldNavNode>;
  edges: Map<string, WorldNavGraphEdge[]>;
  cellKeys: string[];
};

export type WorldNavGraphEdge = {
  from: string;
  to: string;
  cost: number;
  crossCell: boolean;
};

export type WorldNavPathResult = {
  status: "ok" | "unreachable" | "no-loaded-nav";
  startNode: WorldNavNode | null;
  endNode: WorldNavNode | null;
  cost: number;
  nodes: WorldNavNode[];
};

export function createWorldNavGraph(cells: Iterable<WorldNavCellPack>): WorldNavGraph {
  const nodes = new Map<string, WorldNavNode>();
  const edges = new Map<string, WorldNavGraphEdge[]>();
  const cellKeys: string[] = [];
  const cellsByKey = new Map<string, WorldNavCellPack>();

  for (const cell of cells) {
    cellKeys.push(cell.cell.key);
    cellsByKey.set(cell.cell.key, cell);
    for (const node of cell.nodes) {
      if (node.walkable) {
        nodes.set(node.id, node);
      }
    }
  }

  for (const cell of cellsByKey.values()) {
    for (const link of cell.links) {
      addNavLink(nodes, edges, link, false);
    }

    for (const portal of cell.crossCellLinks ?? []) {
      const targetCell = cellsByKey.get(portal.targetCell);
      if (!targetCell) {
        continue;
      }

      const source = nodes.get(portal.from);
      const target = source ? findNearestNodeInCell(targetCell, source.position.x, source.position.z) : null;
      if (target) {
        addNavEdge(nodes, edges, portal.from, target.id, portal.cost, true);
      }
    }
  }

  return { nodes, edges, cellKeys: cellKeys.sort(compareGridKeys) };
}

export function findNearestNavNode(graph: WorldNavGraph, position: { x: number; z: number }, maxDistanceMeters = Infinity): WorldNavNode | null {
  let bestNode: WorldNavNode | null = null;
  let bestDistanceSq = maxDistanceMeters * maxDistanceMeters;
  for (const node of graph.nodes.values()) {
    const dx = node.position.x - position.x;
    const dz = node.position.z - position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq <= bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestNode = node;
    }
  }

  return bestNode;
}

export function findWorldNavPath(
  graph: WorldNavGraph,
  start: { x: number; z: number },
  end: { x: number; z: number },
  maxSnapDistanceMeters = Infinity,
): WorldNavPathResult {
  if (graph.nodes.size === 0) {
    return { status: "no-loaded-nav", startNode: null, endNode: null, cost: Infinity, nodes: [] };
  }

  const startNode = findNearestNavNode(graph, start, maxSnapDistanceMeters);
  const endNode = findNearestNavNode(graph, end, maxSnapDistanceMeters);
  if (!startNode || !endNode) {
    return { status: "unreachable", startNode, endNode, cost: Infinity, nodes: [] };
  }
  if (startNode.id === endNode.id) {
    return { status: "ok", startNode, endNode, cost: 0, nodes: [startNode] };
  }

  const distances = new Map<string, number>([[startNode.id, 0]]);
  const previous = new Map<string, string>();
  const open = new Set<string>([startNode.id]);

  while (open.size > 0) {
    const currentId = takeLowestCostNode(open, distances, graph.nodes, endNode);
    if (!currentId) {
      break;
    }
    if (currentId === endNode.id) {
      return createPathResult(graph, previous, startNode, endNode, distances.get(currentId) ?? Infinity);
    }

    open.delete(currentId);
    const currentDistance = distances.get(currentId) ?? Infinity;
    for (const edge of graph.edges.get(currentId) ?? []) {
      const nextDistance = currentDistance + edge.cost;
      if (nextDistance >= (distances.get(edge.to) ?? Infinity)) {
        continue;
      }

      distances.set(edge.to, nextDistance);
      previous.set(edge.to, currentId);
      open.add(edge.to);
    }
  }

  return { status: "unreachable", startNode, endNode, cost: Infinity, nodes: [] };
}

function addNavLink(nodes: Map<string, WorldNavNode>, edges: Map<string, WorldNavGraphEdge[]>, link: WorldNavLink, crossCell: boolean): void {
  addNavEdge(nodes, edges, link.from, link.to, link.cost, crossCell);
  addNavEdge(nodes, edges, link.to, link.from, link.cost, crossCell);
}

function addNavEdge(nodes: Map<string, WorldNavNode>, edges: Map<string, WorldNavGraphEdge[]>, from: string, to: string, cost: number, crossCell: boolean): void {
  if (!nodes.has(from) || !nodes.has(to)) {
    return;
  }

  const bucket = edges.get(from) ?? [];
  bucket.push({ from, to, cost: Number.isFinite(cost) ? cost : 1, crossCell });
  edges.set(from, bucket);
}

function findNearestNodeInCell(cell: WorldNavCellPack, x: number, z: number): WorldNavNode | null {
  let bestNode: WorldNavNode | null = null;
  let bestDistanceSq = Infinity;
  for (const node of cell.nodes) {
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

function takeLowestCostNode(
  open: ReadonlySet<string>,
  distances: ReadonlyMap<string, number>,
  nodes: ReadonlyMap<string, WorldNavNode>,
  endNode: WorldNavNode,
): string | null {
  let bestId: string | null = null;
  let bestScore = Infinity;
  for (const id of open) {
    const node = nodes.get(id);
    if (!node) {
      continue;
    }

    const score = (distances.get(id) ?? Infinity) + heuristic(node, endNode);
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId;
}

function createPathResult(
  graph: WorldNavGraph,
  previous: ReadonlyMap<string, string>,
  startNode: WorldNavNode,
  endNode: WorldNavNode,
  cost: number,
): WorldNavPathResult {
  const ids = [endNode.id];
  while (ids[0] !== startNode.id) {
    const nextId = previous.get(ids[0]);
    if (!nextId) {
      return { status: "unreachable", startNode, endNode, cost: Infinity, nodes: [] };
    }
    ids.unshift(nextId);
  }

  return {
    status: "ok",
    startNode,
    endNode,
    cost,
    nodes: ids.flatMap((id) => {
      const node = graph.nodes.get(id);
      return node ? [node] : [];
    }),
  };
}

function heuristic(left: WorldNavNode, right: WorldNavNode): number {
  const dx = left.position.x - right.position.x;
  const dz = left.position.z - right.position.z;
  return Math.hypot(dx, dz) / 64;
}

function compareGridKeys(left: string, right: string): number {
  const leftKey = parseGridKey(left);
  const rightKey = parseGridKey(right);
  return leftKey.z - rightKey.z || leftKey.x - rightKey.x;
}

function parseGridKey(key: string): { x: number; z: number } {
  const [xPart, zPart] = key.split(",");
  const x = Number(xPart);
  const z = Number(zPart);
  return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
}
