import { clamp } from "./shared.mjs";

export const semanticPolylineDefinitions = [
  {
    prefix: "main-road",
    layer: "road",
    archetype: "road-dirt-segment",
    widthMeters: 9,
    points: [
      [-1080, -900], [-260, -1080], [760, -760], [1120, -40], [640, 860], [-620, 820], [-1120, -120], [-1080, -900],
    ],
  },
  {
    prefix: "ridge-road",
    layer: "road",
    archetype: "road-rocky-segment",
    widthMeters: 6,
    points: [
      [-260, -420], [-460, -780], [-650, -1120], [-420, -1380],
    ],
  },
  {
    prefix: "forest-path",
    layer: "road",
    archetype: "road-forest-path",
    widthMeters: 5,
    points: [
      [260, -140], [700, -260], [1160, -430],
    ],
  },
  {
    prefix: "main-river",
    layer: "water",
    archetype: "river-segment",
    widthMeters: 18,
    points: [
      [-420, -1510], [-250, -820], [-80, -280], [160, 360], [420, 900], [560, 1460],
    ],
  },
  {
    prefix: "forest-stream",
    layer: "water",
    archetype: "stream-segment",
    widthMeters: 7,
    points: [
      [930, -900], [650, -520], [320, -120], [120, 260],
    ],
  },
];

export const semanticPoiDefinitions = [
  ["central-camp", "camp", -180, -240, 34, ["spawn-adjacent", "poi", "camp"]],
  ["north-lookout", "lookout-tower", -420, -1320, 28, ["poi", "vista", "ridge"]],
  ["south-bridge", "broken-bridge", 430, 980, 38, ["poi", "bridge", "water-crossing"]],
  ["west-homestead", "abandoned-homestead", -1040, 420, 46, ["poi", "building", "cover"]],
  ["forest-clearing", "forest-clearing", 980, -360, 42, ["poi", "clearing", "encounter-space"]],
];

export const semanticPropDefinitions = [
  ["sign-central-north", "road-sign", -260, -520, 5],
  ["sign-forest", "road-sign", 610, -250, 5],
  ["fence-west-01", "split-rail-fence", -900, 340, 18],
  ["fence-west-02", "split-rail-fence", -980, 500, 18],
  ["camp-crates", "supply-crates", -145, -220, 8],
  ["bridge-planks", "bridge-debris", 390, 930, 12],
];

export function createSemanticWorldObjects(heightAt) {
  return [
    ...semanticPolylineDefinitions.flatMap((definition) => createPolylineObjects(definition, heightAt)),
    ...createPointsOfInterest(heightAt),
    ...createRoadProps(heightAt),
  ];
}

export function createSemanticArchetypes() {
  return {
    "road-dirt-segment": { layer: "road", navCost: 0.45, clearsVegetation: true },
    "road-rocky-segment": { layer: "road", navCost: 0.65, clearsVegetation: true },
    "road-forest-path": { layer: "road", navCost: 0.55, clearsVegetation: true },
    "river-segment": { layer: "water", navCost: 3.5, clearsVegetation: true },
    "stream-segment": { layer: "water", navCost: 2.5, clearsVegetation: true },
    camp: { layer: "poi", navCost: 0.8, collision: true },
    "lookout-tower": { layer: "poi", navCost: 1.1, collision: true },
    "broken-bridge": { layer: "poi", navCost: 1.4, collision: true },
    "abandoned-homestead": { layer: "poi", navCost: 1.0, collision: true },
    "forest-clearing": { layer: "poi", navCost: 0.7, collision: false },
    "road-sign": { layer: "prop", collision: true },
    "split-rail-fence": { layer: "prop", collision: true },
    "supply-crates": { layer: "prop", collision: true },
    "bridge-debris": { layer: "prop", collision: true },
  };
}

export function sampleWorldSemantics(x, z, objects) {
  const road = findNearestWorldObjectPath(x, z, objects, "road");
  const water = findNearestWorldObjectPath(x, z, objects, "water");
  const roadWidth = road?.object.spline?.widthMeters ?? 0;
  const waterWidth = water?.object.spline?.widthMeters ?? 0;
  const roadCore = road ? 1 - smoothstep(roadWidth * 0.55, roadWidth * 1.35 + 4, road.distanceMeters) : 0;
  const roadShoulder = road ? 1 - smoothstep(roadWidth * 1.25 + 4, roadWidth * 5 + 18, road.distanceMeters) : 0;
  const waterCore = water ? 1 - smoothstep(waterWidth * 0.55, waterWidth * 1.25 + 4, water.distanceMeters) : 0;
  const waterBank = water ? 1 - smoothstep(waterWidth * 0.85 + 5, waterWidth * 4.5 + 24, water.distanceMeters) : 0;
  const poiClearance = objects.reduce((max, object) => {
    if (object.layer !== "poi") {
      return max;
    }
    const radius = object.radiusMeters ?? boundsRadius(object.boundsMeters) ?? 16;
    const distance = Math.hypot(x - object.position.x, z - object.position.z);
    return Math.max(max, 1 - smoothstep(radius * 0.55, radius * 1.5, distance));
  }, 0);
  const propClearance = objects.reduce((max, object) => {
    if (!object.collision || !object.boundsMeters) {
      return max;
    }
    return Math.max(max, boundsInfluence(x, z, object.boundsMeters, 6, 24));
  }, 0);

  return {
    road,
    water,
    roadCore,
    roadShoulder,
    waterCore,
    waterBank,
    poiClearance,
    propClearance,
    vegetationClearance: clamp(Math.max(roadCore, waterCore, poiClearance, propClearance), 0, 1),
  };
}

export function getSemanticPathInfluence(x, z, options, innerRadius, outerRadius) {
  let influence = 0;
  for (const definition of semanticPolylineDefinitions) {
    if (options.layer && definition.layer !== options.layer) {
      continue;
    }
    if (options.prefix && definition.prefix !== options.prefix) {
      continue;
    }

    for (let index = 0; index < definition.points.length - 1; index += 1) {
      const [ax, az] = definition.points[index];
      const [bx, bz] = definition.points[index + 1];
      const distance = distancePointToSegmentCoordinates(x, z, ax, az, bx, bz);
      influence = Math.max(influence, 1 - smoothstep(innerRadius, outerRadius, distance));
    }
  }

  return influence;
}

export function findNearestWorldObjectPath(x, z, objects, layer) {
  let nearest = null;
  for (const object of objects) {
    if (object.layer !== layer || !object.spline?.points?.length) {
      continue;
    }

    const points = object.spline.points;
    for (let index = 0; index < points.length - 1; index += 1) {
      const distanceMeters = distancePointToSegment(x, z, points[index], points[index + 1]);
      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = { object, distanceMeters };
      }
    }
  }

  return nearest;
}

export function estimateSlopeDegrees(x, z, heightAt, sampleDistance = 8) {
  const heightLeft = heightAt(x - sampleDistance, z);
  const heightRight = heightAt(x + sampleDistance, z);
  const heightBack = heightAt(x, z - sampleDistance);
  const heightForward = heightAt(x, z + sampleDistance);
  const gradientX = (heightRight - heightLeft) / (sampleDistance * 2);
  const gradientZ = (heightForward - heightBack) / (sampleDistance * 2);
  return Math.atan(Math.hypot(gradientX, gradientZ)) * 180 / Math.PI;
}

export function isPointInsideBounds(x, z, bounds) {
  return bounds && x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createPolylineObjects(definition, heightAt) {
  const objects = [];
  const { prefix, layer, archetype, widthMeters, points } = definition;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [startX, startZ] = points[index];
    const [endX, endZ] = points[index + 1];
    const centerX = (startX + endX) * 0.5;
    const centerZ = (startZ + endZ) * 0.5;
    const lengthMeters = Math.hypot(endX - startX, endZ - startZ);
    objects.push({
      id: `${prefix}-${index.toString().padStart(2, "0")}`,
      layer,
      archetype,
      position: { x: round(centerX), y: round(heightAt(centerX, centerZ)), z: round(centerZ) },
      rotationY: round(Math.atan2(endX - startX, endZ - startZ)),
      boundsMeters: createBounds(centerX, centerZ, Math.max(widthMeters, lengthMeters * 0.5)),
      spline: {
        widthMeters,
        points: [
          { x: startX, z: startZ },
          { x: endX, z: endZ },
        ],
      },
      tags: layer === "water" ? ["water", "nav-cost", "vegetation-clear"] : ["road", "nav-preferred", "vegetation-clear"],
    });
  }

  return objects;
}

function createPointsOfInterest(heightAt) {
  return semanticPoiDefinitions.map(([id, archetype, x, z, radiusMeters, tags]) => ({
    id,
    layer: "poi",
    archetype,
    position: { x, y: round(heightAt(x, z)), z },
    rotationY: 0,
    boundsMeters: createBounds(x, z, radiusMeters),
    radiusMeters,
    tags,
    collision: {
      type: archetype.includes("bridge") ? "box" : "cylinder",
      radiusMeters: Math.max(4, radiusMeters * 0.45),
      heightMeters: archetype.includes("tower") ? 12 : 4,
    },
  }));
}

function createRoadProps(heightAt) {
  return semanticPropDefinitions.map(([id, archetype, x, z, radiusMeters]) => ({
    id,
    layer: "prop",
    archetype,
    position: { x, y: round(heightAt(x, z)), z },
    rotationY: 0,
    boundsMeters: createBounds(x, z, radiusMeters),
    radiusMeters,
    tags: ["prop", "collision"],
    collision: {
      type: "box",
      radiusMeters,
      heightMeters: 2,
    },
  }));
}

function distancePointToSegment(x, z, start, end) {
  return distancePointToSegmentCoordinates(x, z, start.x, start.z, end.x, end.z);
}

function distancePointToSegmentCoordinates(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return Math.hypot(x - ax, z - az);
  }

  const t = clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function boundsInfluence(x, z, bounds, innerPadding, outerPadding) {
  const nearestX = clamp(x, bounds.minX, bounds.maxX);
  const nearestZ = clamp(z, bounds.minZ, bounds.maxZ);
  const distance = Math.hypot(x - nearestX, z - nearestZ);
  return 1 - smoothstep(innerPadding, outerPadding, distance);
}

function boundsRadius(bounds) {
  if (!bounds) {
    return null;
  }

  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.5;
}

function createBounds(x, z, radiusMeters) {
  return {
    minX: round(x - radiusMeters),
    minZ: round(z - radiusMeters),
    maxX: round(x + radiusMeters),
    maxZ: round(z + radiusMeters),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}