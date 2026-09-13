#!/usr/bin/env node
import fs from 'node:fs';
import { geoArea } from 'd3-geo';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};

const input = arg('--input', 'data/world/regions.geo.json');
const output = arg('--output', 'data/world/regions.geo.repaired.json');
const doc = JSON.parse(fs.readFileSync(input, 'utf8'));

const reversePolygon = coordinates => coordinates.map(ring => [...ring].reverse());

let repairedPolygons = 0;
let repairedFeatures = 0;
let polygonCount = 0;
let maxBefore = 0;
let maxAfter = 0;

function repairPolygonCoordinates(coords, featureId) {
  polygonCount += 1;
  const polygon = { type: 'Polygon', coordinates: coords };
  const before = geoArea(polygon);
  maxBefore = Math.max(maxBefore, before);
  if (before <= Math.PI) {
    maxAfter = Math.max(maxAfter, before);
    return { coordinates: coords, changed: false };
  }

  const reversed = reversePolygon(coords);
  const after = geoArea({ type: 'Polygon', coordinates: reversed });
  if (!(after < before) || after > Math.PI) {
    throw new Error(`Could not repair spherical complement polygon in ${featureId}: before=${before}, after=${after}`);
  }
  repairedPolygons += 1;
  maxAfter = Math.max(maxAfter, after);
  return { coordinates: reversed, changed: true };
}

function repairGeometry(geometry, featureId) {
  if (!geometry) return { geometry, changed: false };
  if (geometry.type === 'Polygon') {
    const result = repairPolygonCoordinates(geometry.coordinates, featureId);
    return { geometry: { ...geometry, coordinates: result.coordinates }, changed: result.changed };
  }
  if (geometry.type === 'MultiPolygon') {
    let changed = false;
    const coordinates = geometry.coordinates.map(coords => {
      const result = repairPolygonCoordinates(coords, featureId);
      changed ||= result.changed;
      return result.coordinates;
    });
    return { geometry: { ...geometry, coordinates }, changed };
  }
  throw new Error(`Unexpected non-polygon land geometry ${geometry.type} in ${featureId}`);
}

for (const feature of doc.features ?? []) {
  const featureId = feature.id ?? feature.properties?.id ?? 'unknown';
  const result = repairGeometry(feature.geometry, featureId);
  feature.geometry = result.geometry;
  if (result.changed) repairedFeatures += 1;
}

const complements = [];
for (const feature of doc.features ?? []) {
  const area = geoArea(feature);
  if (area > Math.PI) {
    complements.push({
      id: feature.id ?? feature.properties?.id,
      name: feature.properties?.name,
      area,
      worldFraction: area / (4 * Math.PI),
    });
  }
}
if (complements.length) {
  throw new Error(`D3 repair left ${complements.length} complement-scale features: ${JSON.stringify(complements.slice(0, 10))}`);
}

fs.writeFileSync(output, JSON.stringify(doc));
console.log(`FEATURES=${doc.features?.length ?? 0}`);
console.log(`POLYGONS=${polygonCount}`);
console.log(`REPAIRED_POLYGONS=${repairedPolygons}`);
console.log(`REPAIRED_FEATURES=${repairedFeatures}`);
console.log(`MAX_POLYGON_AREA_BEFORE=${maxBefore}`);
console.log(`MAX_POLYGON_AREA_AFTER=${maxAfter}`);
console.log(`OUTPUT=${output}`);
