// Strategic passages join otherwise distinct sea basins. The graph models the
// physical route first; political control is deliberately separate so a polity
// must actually hold nearby land/naval power before it can exploit a strait.
//
// Sea regions remain fishing/resource commons. This module only answers the
// navigation question: which basins must a voyage cross, and which constricted
// passages are on that route?

export const CHOKEPOINTS = Object.freeze({
  gibraltar: {
    id: 'gibraltar', label: 'Strait of Gibraltar',
    seas: ['sea_gulf_cadiz', 'sea_strait_gibraltar', 'sea_alboran'],
    physicalFriction: 0.10, controlCenter: [-5.60, 36.02], controlRadiusKm: 180,
  },
  dardanelles: {
    id: 'dardanelles', label: 'Dardanelles',
    seas: ['sea_aegean', 'sea_marmara'],
    physicalFriction: 0.08, controlCenter: [26.42, 40.20], controlRadiusKm: 150,
  },
  bosporus: {
    id: 'bosporus', label: 'Bosporus',
    seas: ['sea_marmara', 'sea_black'],
    physicalFriction: 0.10, controlCenter: [29.06, 41.10], controlRadiusKm: 120,
  },
  kerch: {
    id: 'kerch', label: 'Kerch Strait',
    seas: ['sea_black', 'sea_azov'],
    physicalFriction: 0.08, controlCenter: [36.53, 45.30], controlRadiusKm: 180,
  },
  bab_el_mandeb: {
    id: 'bab_el_mandeb', label: 'Bab el-Mandeb',
    seas: ['sea_southern_red', 'sea_gulf_aden'],
    physicalFriction: 0.08, controlCenter: [43.32, 12.58], controlRadiusKm: 180,
  },
  hormuz: {
    id: 'hormuz', label: 'Strait of Hormuz',
    seas: ['sea_persian_gulf', 'sea_gulf_oman'],
    physicalFriction: 0.08, controlCenter: [56.35, 26.55], controlRadiusKm: 180,
  },
  danish_straits: {
    id: 'danish_straits', label: 'Danish Straits',
    seas: ['sea_north', 'sea_baltic'],
    physicalFriction: 0.06, controlCenter: [12.55, 55.75], controlRadiusKm: 200,
  },
});

// Ordinary open-water links plus the constricted links above. These are a
// deliberately small graph: route finding is O(number of sea basins), not a
// geometric pathfinder executed for every merchant every tick.
const OPEN_CONNECTIONS = [
  ['sea_ne_atlantic', 'sea_celtic'],
  ['sea_ne_atlantic', 'sea_north'],
  ['sea_ne_atlantic', 'sea_barents'],
  ['sea_celtic', 'sea_english_channel'],
  ['sea_celtic', 'sea_biscay'],
  ['sea_celtic', 'sea_irish'],
  ['sea_english_channel', 'sea_north'],
  ['sea_biscay', 'sea_portuguese'],
  ['sea_portuguese', 'sea_gulf_cadiz'],
  ['sea_portuguese', 'sea_moroccan_atlantic'],
  ['sea_moroccan_atlantic', 'sea_gulf_cadiz'],
  ['sea_moroccan_atlantic', 'sea_canary'],
  ['sea_canary', 'sea_madeira'],

  ['sea_alboran', 'sea_balearic'],
  ['sea_balearic', 'sea_gulf_lion'],
  ['sea_balearic', 'sea_central_mediterranean'],
  ['sea_gulf_lion', 'sea_ligurian_corsican'],
  ['sea_ligurian_corsican', 'sea_tyrrhenian'],
  ['sea_tyrrhenian', 'sea_central_mediterranean'],
  ['sea_central_mediterranean', 'sea_ionian'],
  ['sea_central_mediterranean', 'sea_gulf_sidra'],
  ['sea_ionian', 'sea_adriatic'],
  ['sea_ionian', 'sea_aegean'],
  ['sea_ionian', 'sea_gulf_sidra'],
  ['sea_gulf_sidra', 'sea_nile_mediterranean'],
  ['sea_nile_mediterranean', 'sea_levantine'],
  ['sea_aegean', 'sea_levantine'],

  ['sea_gulf_aqaba', 'sea_northern_red'],
  ['sea_northern_red', 'sea_southern_red'],
  ['sea_gulf_aden', 'sea_arabian'],
  ['sea_gulf_oman', 'sea_arabian'],

  ['sea_baltic', 'sea_gulf_finland'],
  ['sea_baltic', 'sea_gulf_bothnia'],
  ['sea_barents', 'sea_white'],
];

const graph = new Map();
function addEdge(a, b, passageId = null) {
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  graph.get(a).push({ seaId: b, passageId });
  graph.get(b).push({ seaId: a, passageId });
}

for (const [a, b] of OPEN_CONNECTIONS) addEdge(a, b, null);

// Gibraltar is represented by a tiny sea region in its own right. Both edges
// carry the same passage id; route output de-duplicates it so a voyage pays one
// Gibraltar passage rather than two arbitrary graph edges.
addEdge('sea_gulf_cadiz', 'sea_strait_gibraltar', 'gibraltar');
addEdge('sea_strait_gibraltar', 'sea_alboran', 'gibraltar');
addEdge('sea_aegean', 'sea_marmara', 'dardanelles');
addEdge('sea_marmara', 'sea_black', 'bosporus');
addEdge('sea_black', 'sea_azov', 'kerch');
addEdge('sea_southern_red', 'sea_gulf_aden', 'bab_el_mandeb');
addEdge('sea_persian_gulf', 'sea_gulf_oman', 'hormuz');
addEdge('sea_north', 'sea_baltic', 'danish_straits');

const routeCache = new Map();
const MAX_SEA_HOPS = 8;
const MAX_CACHE = 20000;

function cacheKey(aIds, bIds) {
  // Routes are directional because downstream UI/animation and toll reporting
  // need the sea sequence in the actual direction of travel.
  const a = [...new Set(aIds || [])].sort().join(',');
  const b = [...new Set(bIds || [])].sort().join(',');
  return `${a}>${b}`;
}

function remember(key, value) {
  if (routeCache.size >= MAX_CACHE) routeCache.clear();
  routeCache.set(key, value);
  return value;
}

export function maritimeRouteBetween(regionA, regionB) {
  const starts = [...new Set(regionA?.adjacentSeaIds || [])];
  const goals = new Set(regionB?.adjacentSeaIds || []);
  if (!starts.length || !goals.size) return null;

  for (const seaId of starts) {
    if (goals.has(seaId)) return { seaIds: [seaId], passageIds: [], physicalFriction: 0 };
  }

  const key = cacheKey(starts, [...goals]);
  if (routeCache.has(key)) return routeCache.get(key);

  const queue = starts.map((seaId) => ({ seaId, path: [seaId], passages: [] }));
  const visited = new Set(starts);
  while (queue.length) {
    const current = queue.shift();
    if (current.path.length > MAX_SEA_HOPS + 1) continue;
    for (const edge of graph.get(current.seaId) || []) {
      if (visited.has(edge.seaId)) continue;
      const passages = edge.passageId
        ? [...current.passages, edge.passageId]
        : current.passages;
      const path = [...current.path, edge.seaId];
      if (goals.has(edge.seaId)) {
        const passageIds = [...new Set(passages)];
        const physicalFriction = passageIds.reduce(
          (sum, id) => sum + (CHOKEPOINTS[id]?.physicalFriction || 0), 0);
        return remember(key, { seaIds: path, passageIds, physicalFriction });
      }
      visited.add(edge.seaId);
      queue.push({ seaId: edge.seaId, path, passages });
    }
  }
  return remember(key, null);
}

export function chokepointDefinition(id) {
  return CHOKEPOINTS[id] || null;
}
