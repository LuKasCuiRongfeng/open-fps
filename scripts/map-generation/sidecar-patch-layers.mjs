export const sidecarPatchLayerMode = "ordered-nondestructive-v1";

export function createGeneratedPatchLayers(regionKeys, baseLabel, layerSpecs) {
    const regions = sortGridKeys(regionKeys);
    const layers = [
        createLayer("base", baseLabel, "base", 0, regions, "source/base"),
        ...layerSpecs.map((spec, index) => createLayer(
            spec.id,
            spec.label,
            spec.kind ?? "generated",
            index + 1,
            spec.regions ?? regions,
            spec.source,
        )),
    ];

    return {
        mode: sidecarPatchLayerMode,
        activeLayerId: layers.find((layer) => layer.kind === "manual")?.id ?? layers.at(-1)?.id ?? "base",
        layers,
    };
}

function createLayer(id, label, kind, order, regions, source) {
    return {
        id,
        label,
        kind,
        order,
        enabled: true,
        regions: sortGridKeys(regions),
        source,
    };
}

function sortGridKeys(keys) {
    return [...new Set(keys)].sort((left, right) => {
        const leftKey = parseGridKey(left);
        const rightKey = parseGridKey(right);
        return leftKey.z - rightKey.z || leftKey.x - rightKey.x;
    });
}

function parseGridKey(key) {
    const [xPart, zPart] = String(key).split(",");
    const x = Number(xPart);
    const z = Number(zPart);
    return { x: Number.isFinite(x) ? x : 0, z: Number.isFinite(z) ? z : 0 };
}
