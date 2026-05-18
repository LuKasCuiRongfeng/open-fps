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
  const modelPath = (assetId) => `../../assets/model/${assetId}_1k.gltf/${assetId}_1k.gltf`;
  return {
    "road-dirt-segment": {
      layer: "road",
      navCost: 0.45,
      clearsVegetation: true,
      render: { kind: "ribbon", ribbonMaterial: "road" },
      editor: { icon: "route", color: "#b9854f", placement: "spline", defaultRadiusMeters: 9 },
      scatter: { mode: "path", minSpacingMeters: 12, alignToTerrain: true, avoidLayers: ["water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 18, clearsVegetation: true },
    },
    "road-rocky-segment": {
      layer: "road",
      navCost: 0.65,
      clearsVegetation: true,
      render: { kind: "ribbon", ribbonMaterial: "road" },
      editor: { icon: "route", color: "#95806a", placement: "spline", defaultRadiusMeters: 6 },
      scatter: { mode: "path", minSpacingMeters: 10, alignToTerrain: true, avoidLayers: ["water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 26, clearsVegetation: true },
    },
    "road-forest-path": {
      layer: "road",
      navCost: 0.55,
      clearsVegetation: true,
      render: { kind: "ribbon", ribbonMaterial: "road" },
      editor: { icon: "route", color: "#7f9863", placement: "spline", defaultRadiusMeters: 5 },
      scatter: { mode: "path", minSpacingMeters: 10, alignToTerrain: true, avoidLayers: ["water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 22, clearsVegetation: true },
    },
    "river-segment": {
      layer: "water",
      navCost: 3.5,
      clearsVegetation: true,
      render: { kind: "ribbon", ribbonMaterial: "water" },
      editor: { icon: "waves", color: "#43a4d8", placement: "spline", defaultRadiusMeters: 18 },
      scatter: { mode: "path", minSpacingMeters: 16, alignToTerrain: true },
      validation: { requiresTerrain: true, maxSlopeDegrees: 12, clearsVegetation: true },
    },
    "stream-segment": {
      layer: "water",
      navCost: 2.5,
      clearsVegetation: true,
      render: { kind: "ribbon", ribbonMaterial: "water" },
      editor: { icon: "waves", color: "#64bfe5", placement: "spline", defaultRadiusMeters: 7 },
      scatter: { mode: "path", minSpacingMeters: 10, alignToTerrain: true },
      validation: { requiresTerrain: true, maxSlopeDegrees: 18, clearsVegetation: true },
    },
    camp: {
      layer: "poi",
      navCost: 0.8,
      collision: { type: "box", radiusMeters: 10, heightMeters: 3 },
      render: { kind: "gltf", path: modelPath("wooden_barrels_01"), targetHeightMeters: 2.4, baseScale: 1.8, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 420, shadowDistanceMeters: 120 },
      editor: { icon: "landmark", color: "#d39a43", placement: "prefab", defaultRadiusMeters: 18 },
      prefab: [
        { archetype: "supply-crates", offsetX: 7, offsetZ: -4, rotationY: 0.5, scale: 0.9 },
        { archetype: "road-sign", offsetX: -9, offsetZ: 5, rotationY: -0.3, scale: 1 },
      ],
      validation: { requiresTerrain: true, maxSlopeDegrees: 10, blocksNav: true, clearsVegetation: true },
    },
    "lookout-tower": {
      layer: "poi",
      navCost: 1.1,
      collision: { type: "cylinder", radiusMeters: 8, heightMeters: 12 },
      render: { kind: "gltf", path: modelPath("tree_stump_01"), targetHeightMeters: 8.5, baseScale: 1.4, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 620, shadowDistanceMeters: 180 },
      editor: { icon: "binoculars", color: "#c9a56c", placement: "single", defaultRadiusMeters: 14 },
      validation: { requiresTerrain: true, maxSlopeDegrees: 16, blocksNav: true, clearsVegetation: true },
    },
    "broken-bridge": {
      layer: "poi",
      navCost: 1.4,
      collision: { type: "box", radiusMeters: 16, heightMeters: 4 },
      render: { kind: "gltf", path: modelPath("modular_wooden_pier"), targetHeightMeters: 3.2, baseScale: 3.8, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 520, shadowDistanceMeters: 130 },
      editor: { icon: "bridge", color: "#b88d58", placement: "single", defaultRadiusMeters: 24 },
      validation: { requiresTerrain: true, maxSlopeDegrees: 14, blocksNav: true, clearsVegetation: true },
    },
    "abandoned-homestead": {
      layer: "poi",
      navCost: 1.0,
      collision: { type: "box", radiusMeters: 14, heightMeters: 4 },
      render: { kind: "gltf", path: modelPath("wooden_crate_01"), targetHeightMeters: 3.6, baseScale: 5.8, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 520, shadowDistanceMeters: 130 },
      editor: { icon: "home", color: "#ad8f65", placement: "prefab", defaultRadiusMeters: 28 },
      prefab: [
        { archetype: "supply-crates", offsetX: -10, offsetZ: 8, rotationY: 0.2, scale: 1.1 },
        { archetype: "split-rail-fence", offsetX: 18, offsetZ: -6, rotationY: 1.2, scale: 1 },
      ],
      validation: { requiresTerrain: true, maxSlopeDegrees: 9, blocksNav: true, clearsVegetation: true },
    },
    "forest-clearing": {
      layer: "poi",
      navCost: 0.7,
      collision: false,
      render: { kind: "gltf", path: modelPath("boulder_01"), targetHeightMeters: 2.2, baseScale: 1.4, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 340, shadowDistanceMeters: 90 },
      editor: { icon: "circle", color: "#7ea06a", placement: "scatter", defaultRadiusMeters: 24 },
      scatter: { mode: "biome", densityPerSquareMeter: 0.004, minSpacingMeters: 18, alignToTerrain: true, avoidLayers: ["road", "water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 18, clearsVegetation: true },
    },
    "road-sign": {
      layer: "prop",
      collision: { type: "box", radiusMeters: 2, heightMeters: 2.6 },
      render: { kind: "gltf", path: modelPath("tree_stump_01"), targetHeightMeters: 2.6, baseScale: 0.34, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 220, shadowDistanceMeters: 55 },
      editor: { icon: "signpost", color: "#d8c071", placement: "single", defaultRadiusMeters: 3 },
      validation: { requiresTerrain: true, maxSlopeDegrees: 24, blocksNav: true },
    },
    "split-rail-fence": {
      layer: "prop",
      collision: { type: "box", radiusMeters: 8, heightMeters: 2 },
      render: { kind: "gltf", path: modelPath("modular_wooden_pier"), targetHeightMeters: 1.8, baseScale: 2.8, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 260, shadowDistanceMeters: 60 },
      editor: { icon: "fence", color: "#b28b62", placement: "spline", defaultRadiusMeters: 8 },
      scatter: { mode: "path", minSpacingMeters: 7, alignToTerrain: true, avoidLayers: ["water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 20, blocksNav: true },
    },
    "supply-crates": {
      layer: "prop",
      collision: { type: "box", radiusMeters: 3.5, heightMeters: 2.8 },
      render: { kind: "gltf", path: modelPath("wooden_crate_01"), targetHeightMeters: 2.2, baseScale: 1.35, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 260, shadowDistanceMeters: 70 },
      editor: { icon: "package", color: "#b78851", placement: "single", defaultRadiusMeters: 5 },
      validation: { requiresTerrain: true, maxSlopeDegrees: 18, blocksNav: true },
    },
    "bridge-debris": {
      layer: "prop",
      collision: { type: "box", radiusMeters: 5, heightMeters: 2.4 },
      render: { kind: "gltf", path: modelPath("wooden_barrels_01"), targetHeightMeters: 2.1, baseScale: 1.2, castShadow: true, receiveShadow: true, maxVisibleDistanceMeters: 260, shadowDistanceMeters: 70 },
      editor: { icon: "package-open", color: "#a98769", placement: "scatter", defaultRadiusMeters: 6 },
      scatter: { mode: "prefab", densityPerSquareMeter: 0.008, minSpacingMeters: 4, alignToTerrain: true, avoidLayers: ["water"] },
      validation: { requiresTerrain: true, maxSlopeDegrees: 18, blocksNav: true },
    },
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