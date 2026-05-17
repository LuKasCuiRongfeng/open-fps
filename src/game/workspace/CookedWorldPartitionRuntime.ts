import {
  COOKED_WORLD_PARTITION_DEPENDENCY_KINDS,
  type CookedWorldPartition,
  type CookedWorldPartitionCell,
  type CookedWorldPartitionDependencies,
  type CookedWorldPartitionDependencyKind,
} from "./CookedMapManifest";

export interface CookedWorldPartitionPlanOptions {
  loadRadiusCells: number;
  unloadRadiusCells?: number;
}

export interface CookedWorldPartitionPlan {
  centerCell: CookedWorldPartitionCell | null;
  loadCells: CookedWorldPartitionCell[];
  keepCells: CookedWorldPartitionCell[];
  unloadCellKeys: string[];
  dependencies: CookedWorldPartitionDependencies;
}

export class CookedWorldPartitionRuntime {
  private readonly cellsByKey = new Map<string, CookedWorldPartitionCell>();
  private readonly activeCellKeys = new Set<string>();

  constructor(private readonly partition: CookedWorldPartition) {
    for (const cell of partition.cells) {
      this.cellsByKey.set(cell.key, cell);
    }
  }

  getActiveCellKeys(): string[] {
    return [...this.activeCellKeys].sort(compareCellKeys);
  }

  getCell(key: string): CookedWorldPartitionCell | null {
    return this.cellsByKey.get(key) ?? null;
  }

  getCellAtMeters(xMeters: number, zMeters: number): CookedWorldPartitionCell | null {
    return this.partition.cells.find((cell) => (
      xMeters >= cell.boundsMeters.minX
      && xMeters < cell.boundsMeters.maxX
      && zMeters >= cell.boundsMeters.minZ
      && zMeters < cell.boundsMeters.maxZ
    )) ?? null;
  }

  createPlan(xMeters: number, zMeters: number, options: CookedWorldPartitionPlanOptions): CookedWorldPartitionPlan {
    const centerCell = this.getCellAtMeters(xMeters, zMeters);
    if (!centerCell) {
      return {
        centerCell: null,
        loadCells: [],
        keepCells: [],
        unloadCellKeys: this.getActiveCellKeys(),
        dependencies: createEmptyDependencies(),
      };
    }

    const unloadRadiusCells = options.unloadRadiusCells ?? options.loadRadiusCells + 1;
    const desiredCells = this.collectCellsInRadius(centerCell, options.loadRadiusCells);
    const keepCells = this.collectCellsInRadius(centerCell, unloadRadiusCells)
      .filter((cell) => this.activeCellKeys.has(cell.key));
    const desiredKeys = new Set(desiredCells.map((cell) => cell.key));
    const keepKeys = new Set(keepCells.map((cell) => cell.key));
    const loadCells = desiredCells.filter((cell) => !this.activeCellKeys.has(cell.key));
    const unloadCellKeys = this.getActiveCellKeys()
      .filter((key) => !desiredKeys.has(key) && !keepKeys.has(key));

    return {
      centerCell,
      loadCells,
      keepCells,
      unloadCellKeys,
      dependencies: collectDependencies([...loadCells, ...keepCells]),
    };
  }

  applyPlan(plan: CookedWorldPartitionPlan): void {
    for (const key of plan.unloadCellKeys) {
      this.activeCellKeys.delete(key);
    }
    for (const cell of [...plan.keepCells, ...plan.loadCells]) {
      this.activeCellKeys.add(cell.key);
    }
  }

  private collectCellsInRadius(centerCell: CookedWorldPartitionCell, radiusCells: number): CookedWorldPartitionCell[] {
    return this.partition.cells
      .filter((cell) => Math.max(Math.abs(cell.x - centerCell.x), Math.abs(cell.z - centerCell.z)) <= radiusCells)
      .sort((left, right) => {
        const leftDistance = (left.x - centerCell.x) ** 2 + (left.z - centerCell.z) ** 2;
        const rightDistance = (right.x - centerCell.x) ** 2 + (right.z - centerCell.z) ** 2;
        return leftDistance - rightDistance || compareCellKeys(left.key, right.key);
      });
  }
}

function collectDependencies(cells: readonly CookedWorldPartitionCell[]): CookedWorldPartitionDependencies {
  const dependencySets = Object.fromEntries(
    COOKED_WORLD_PARTITION_DEPENDENCY_KINDS.map((kind) => [kind, new Set<string>()]),
  ) as Record<CookedWorldPartitionDependencyKind, Set<string>>;

  for (const cell of cells) {
    for (const kind of COOKED_WORLD_PARTITION_DEPENDENCY_KINDS) {
      for (const key of cell.dependencies[kind]) {
        dependencySets[kind].add(key);
      }
    }
  }

  return Object.fromEntries(
    COOKED_WORLD_PARTITION_DEPENDENCY_KINDS.map((kind) => [kind, [...dependencySets[kind]].sort(compareCellKeys)]),
  ) as CookedWorldPartitionDependencies;
}

function createEmptyDependencies(): CookedWorldPartitionDependencies {
  const dependencies: Partial<CookedWorldPartitionDependencies> = {};
  for (const kind of COOKED_WORLD_PARTITION_DEPENDENCY_KINDS) {
    dependencies[kind] = [];
  }

  return dependencies as CookedWorldPartitionDependencies;
}

function compareCellKeys(left: string, right: string): number {
  const [leftX, leftZ] = parseCellKey(left);
  const [rightX, rightZ] = parseCellKey(right);
  return leftZ - rightZ || leftX - rightX;
}

function parseCellKey(key: string): [number, number] {
  const [x, z] = key.split(",").map((part) => Number(part));
  return [Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0];
}
