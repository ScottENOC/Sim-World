import fs from 'node:fs';

const geo = JSON.parse(fs.readFileSync('data/world/regions.geo.json','utf8'));
const meta = JSON.parse(fs.readFileSync('data/world/regions.meta.json','utf8'));
const seaMeta = JSON.parse(fs.readFileSync('data/world/seaRegions.meta.json','utf8'));
const chuk = meta.regions.filter(r => /chuk/i.test(r.name || ''));
console.log('LAND_REGIONS=' + meta.regions.length);
console.log('SEA_REGIONS=' + seaMeta.seaRegions.length);
console.log('CHUKOTKA=' + JSON.stringify(chuk));
for (const r of chuk) {
  const f = geo.features.find(x => x.properties?.id === r.id);
  console.log('CHUKOTKA_FEATURE=' + JSON.stringify({id:r.id, name:r.name, sourceGroup:f?.properties?.sourceGroup, centroid:r.centroid, areaSqKm:r.areaSqKm, neighbors:r.neighbors}));
  console.log('CHUKOTKA_SEAS=' + JSON.stringify(seaMeta.seaRegions.filter(s => (s.adjacentLand || []).includes(r.id)).map(s => ({id:s.id,name:s.name}))));
}
function countCoords(coords) {
  if (!Array.isArray(coords)) return 0;
  if (coords.length && typeof coords[0] === 'number') return 1;
  return coords.reduce((n,c)=>n+countCoords(c),0);
}
let landVertices = 0;
for (const f of geo.features) landVertices += countCoords(f.geometry?.coordinates);
const seaGeo = JSON.parse(fs.readFileSync('data/world/seaRegions.geo.json','utf8'));
let seaVertices = 0;
for (const f of seaGeo.features) seaVertices += countCoords(f.geometry?.coordinates);
console.log('LAND_VERTICES=' + landVertices);
console.log('SEA_VERTICES=' + seaVertices);
console.log('TOTAL_MAP_VERTICES=' + (landVertices + seaVertices));
console.log('CURRENT_LOW_ZOOM_PATHS_PER_DRAW=' + (geo.features.length + seaGeo.features.length));
console.log('CURRENT_TRADE_OVERLAY_FULL_MAP_DRAWS_PER_SECOND=up_to_60');
