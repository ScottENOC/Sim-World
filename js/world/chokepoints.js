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
  malacca: {
    id: 'malacca', label: 'Strait of Malacca',
    seas: ['sea_andaman', 'sea_malacca_strait', 'sea_south_china'],
    physicalFriction: 0.09, controlCenter: [101.2, 3.2], controlRadiusKm: 240,
  },
  sunda: {
    id: 'sunda', label: 'Sunda Strait',
    seas: ['sea_east_indian', 'sea_sunda_strait', 'sea_java'],
    physicalFriction: 0.08, controlCenter: [105.8, -5.9], controlRadiusKm: 160,
  },
  lombok: {
    id: 'lombok', label: 'Lombok Strait',
    seas: ['sea_east_indian', 'sea_lombok_strait', 'sea_java'],
    physicalFriction: 0.07, controlCenter: [115.8, -8.5], controlRadiusKm: 140,
  },
  torres: {
    id: 'torres', label: 'Torres Strait',
    seas: ['sea_arafura', 'sea_torres_strait', 'sea_coral'],
    physicalFriction: 0.10, controlCenter: [142.0, -10.0], controlRadiusKm: 220,
  },
  taiwan: {
    id: 'taiwan', label: 'Taiwan Strait',
    seas: ['sea_south_china', 'sea_taiwan_strait', 'sea_east_china'],
    physicalFriction: 0.06, controlCenter: [119.5, 24.0], controlRadiusKm: 180,
  },
  korea: {
    id: 'korea', label: 'Korea Strait',
    seas: ['sea_east_china', 'sea_korea_strait', 'sea_japan'],
    physicalFriction: 0.06, controlCenter: [129.2, 34.0], controlRadiusKm: 180,
  },
  bass: {
    id: 'bass', label: 'Bass Strait',
    seas: ['sea_great_bight', 'sea_bass_strait', 'sea_tasman'],
    physicalFriction: 0.05, controlCenter: [146.0, -39.5], controlRadiusKm: 260,
  },
  cook: {
    id: 'cook', label: 'Cook Strait',
    seas: ['sea_tasman', 'sea_cook_strait', 'sea_tasman_east'],
    physicalFriction: 0.05, controlCenter: [174.7, -41.2], controlRadiusKm: 130,
  },
});

// Ordinary open-water links. This stays an explicit, tiny strategic graph
// rather than a runtime polygon pathfinder: global route finding remains cheap
// and deterministic even when the land simulation grows to thousands of regions.
const OPEN_CONNECTIONS = [
  // Atlantic Europe and Mediterranean approaches.
  ['sea_ne_atlantic', 'sea_celtic'], ['sea_ne_atlantic', 'sea_north'],
  ['sea_ne_atlantic', 'sea_barents'], ['sea_ne_atlantic', 'sea_hebrides'],
  ['sea_ne_atlantic', 'sea_faroe_shetland'], ['sea_ne_atlantic', 'sea_north_atlantic_e'],
  ['sea_celtic', 'sea_english_channel'], ['sea_celtic', 'sea_biscay'],
  ['sea_celtic', 'sea_irish'], ['sea_celtic', 'sea_bristol'],
  ['sea_irish', 'sea_bristol'], ['sea_irish', 'sea_hebrides'],
  ['sea_english_channel', 'sea_north'], ['sea_biscay', 'sea_portuguese'],
  ['sea_portuguese', 'sea_gulf_cadiz'], ['sea_portuguese', 'sea_moroccan_atlantic'],
  ['sea_portuguese', 'sea_azores'], ['sea_portuguese', 'sea_madeira'],
  ['sea_moroccan_atlantic', 'sea_gulf_cadiz'], ['sea_moroccan_atlantic', 'sea_canary'],
  ['sea_canary', 'sea_madeira'], ['sea_canary', 'sea_equatorial_atlantic_e'],
  ['sea_madeira', 'sea_azores'], ['sea_madeira', 'sea_north_atlantic_e'],
  ['sea_azores', 'sea_north_atlantic_e'],

  ['sea_alboran', 'sea_balearic'], ['sea_balearic', 'sea_gulf_lion'],
  ['sea_balearic', 'sea_central_mediterranean'], ['sea_gulf_lion', 'sea_ligurian_corsican'],
  ['sea_ligurian_corsican', 'sea_tyrrhenian'], ['sea_tyrrhenian', 'sea_central_mediterranean'],
  ['sea_central_mediterranean', 'sea_ionian'], ['sea_central_mediterranean', 'sea_gulf_sidra'],
  ['sea_ionian', 'sea_adriatic'], ['sea_ionian', 'sea_aegean'], ['sea_ionian', 'sea_gulf_sidra'],
  ['sea_gulf_sidra', 'sea_nile_mediterranean'], ['sea_nile_mediterranean', 'sea_levantine'],
  ['sea_aegean', 'sea_levantine'],

  // Red Sea, Gulf and Indian Ocean.
  ['sea_gulf_aqaba', 'sea_northern_red'], ['sea_northern_red', 'sea_southern_red'],
  ['sea_gulf_aden', 'sea_arabian'], ['sea_gulf_aden', 'sea_somali_bight'],
  ['sea_gulf_oman', 'sea_arabian'], ['sea_arabian', 'sea_somali_bight'],
  ['sea_arabian', 'sea_laccadive'], ['sea_arabian', 'sea_west_indian'],
  ['sea_arabian', 'sea_central_indian'], ['sea_somali_bight', 'sea_kenya_coast'],
  ['sea_kenya_coast', 'sea_zanzibar_channel'], ['sea_zanzibar_channel', 'sea_mozambique_channel'],
  ['sea_mozambique_channel', 'sea_west_indian'], ['sea_west_indian', 'sea_central_indian'],
  ['sea_west_indian', 'sea_southern_indian_w'], ['sea_central_indian', 'sea_east_indian'],
  ['sea_central_indian', 'sea_laccadive'], ['sea_central_indian', 'sea_southern_indian_w'],
  ['sea_central_indian', 'sea_southern_indian_e'], ['sea_laccadive', 'sea_bay_bengal'],
  ['sea_east_indian', 'sea_bay_bengal'], ['sea_east_indian', 'sea_andaman'],
  ['sea_east_indian', 'sea_nw_australia'], ['sea_east_indian', 'sea_southern_indian_e'],
  ['sea_bay_bengal', 'sea_andaman'],

  // Southeast Asia and the western Pacific.
  ['sea_south_china', 'sea_gulf_thailand'], ['sea_south_china', 'sea_philippine'],
  ['sea_south_china', 'sea_java'], ['sea_java', 'sea_makassar'],
  ['sea_makassar', 'sea_banda'], ['sea_makassar', 'sea_philippine'],
  ['sea_banda', 'sea_arafura'], ['sea_banda', 'sea_timor'],
  ['sea_timor', 'sea_north_australia'], ['sea_timor', 'sea_nw_australia'],
  ['sea_arafura', 'sea_north_australia'], ['sea_philippine', 'sea_west_pacific_tropical'],
  ['sea_philippine', 'sea_north_pacific_w'],

  // East Asia and North Pacific.
  ['sea_east_china', 'sea_yellow'], ['sea_yellow', 'sea_korea_strait'],
  ['sea_japan', 'sea_okhotsk'], ['sea_japan', 'sea_north_pacific_w'],
  ['sea_okhotsk', 'sea_bering'], ['sea_okhotsk', 'sea_north_pacific_w'],
  ['sea_bering', 'sea_bering_east'], ['sea_bering_east', 'sea_gulf_alaska'],
  ['sea_bering_east', 'sea_north_pacific_e'], ['sea_gulf_alaska', 'sea_inside_passage'],
  ['sea_gulf_alaska', 'sea_pacific_northwest'], ['sea_gulf_alaska', 'sea_east_pacific_north'],
  ['sea_inside_passage', 'sea_pacific_northwest'], ['sea_pacific_northwest', 'sea_californian'],
  ['sea_pacific_northwest', 'sea_east_pacific_north'], ['sea_californian', 'sea_baja_pacific'],
  ['sea_californian', 'sea_east_pacific_north'], ['sea_baja_pacific', 'sea_mexican_pacific'],
  ['sea_baja_pacific', 'sea_gulf_california'], ['sea_baja_pacific', 'sea_east_pacific_tropical'],
  ['sea_mexican_pacific', 'sea_east_pacific_tropical'],

  // Australia, Melanesia and the Pacific basin.
  ['sea_nw_australia', 'sea_great_bight'], ['sea_nw_australia', 'sea_southern_indian_e'],
  ['sea_great_bight', 'sea_southern_ocean_australia'], ['sea_coral', 'sea_tasman'],
  ['sea_coral', 'sea_solomon'], ['sea_coral', 'sea_west_pacific_tropical'],
  ['sea_solomon', 'sea_bismarck'], ['sea_solomon', 'sea_west_pacific_tropical'],
  ['sea_bismarck', 'sea_west_pacific_tropical'], ['sea_tasman', 'sea_south_pacific_w'],
  ['sea_tasman', 'sea_southern_ocean_australia'], ['sea_tasman_east', 'sea_south_pacific_e'],
  ['sea_west_pacific_tropical', 'sea_central_pacific_w'],
  ['sea_west_pacific_tropical', 'sea_north_pacific_w'], ['sea_west_pacific_tropical', 'sea_south_pacific_w'],
  ['sea_central_pacific_w', 'sea_central_pacific_e'], ['sea_central_pacific_w', 'sea_north_pacific_w'],
  ['sea_central_pacific_w', 'sea_south_pacific_w'], ['sea_central_pacific_e', 'sea_polynesian'],
  ['sea_central_pacific_e', 'sea_hawaii'], ['sea_central_pacific_e', 'sea_north_pacific_e'],
  ['sea_central_pacific_e', 'sea_south_pacific_e'], ['sea_hawaii', 'sea_north_pacific_e'],
  ['sea_hawaii', 'sea_east_pacific_tropical'], ['sea_polynesian', 'sea_east_pacific_tropical'],
  ['sea_polynesian', 'sea_east_pacific_south'], ['sea_north_pacific_w', 'sea_north_pacific_e'],
  ['sea_north_pacific_e', 'sea_east_pacific_north'], ['sea_south_pacific_w', 'sea_south_pacific_e'],
  ['sea_south_pacific_e', 'sea_east_pacific_south'],
  ['sea_east_pacific_tropical', 'sea_panama_bight'], ['sea_east_pacific_tropical', 'sea_galapagos_waters'],
  ['sea_east_pacific_tropical', 'sea_tropical_pacific_sa'], ['sea_east_pacific_south', 'sea_rapa_nui_waters'],
  ['sea_east_pacific_south', 'sea_southeast_pacific_sa'], ['sea_tropical_pacific_sa', 'sea_panama_bight'],
  ['sea_tropical_pacific_sa', 'sea_galapagos_waters'], ['sea_tropical_pacific_sa', 'sea_southeast_pacific_sa'],

  // Atlantic Americas and the Caribbean.
  ['sea_north_atlantic_w', 'sea_north_atlantic_e'], ['sea_north_atlantic_w', 'sea_labrador'],
  ['sea_north_atlantic_w', 'sea_newfoundland'], ['sea_north_atlantic_w', 'sea_equatorial_atlantic_w'],
  ['sea_north_atlantic_e', 'sea_equatorial_atlantic_e'],
  ['sea_equatorial_atlantic_w', 'sea_equatorial_atlantic_e'],
  ['sea_equatorial_atlantic_w', 'sea_caribbean_east'], ['sea_equatorial_atlantic_w', 'sea_guiana_atlantic'],
  ['sea_equatorial_atlantic_w', 'sea_brazil_atlantic_north'],
  ['sea_equatorial_atlantic_e', 'sea_equatorial_atlantic_islands'],
  ['sea_equatorial_atlantic_w', 'sea_south_atlantic_w'], ['sea_equatorial_atlantic_e', 'sea_south_atlantic_e'],
  ['sea_south_atlantic_w', 'sea_south_atlantic_e'], ['sea_south_atlantic_w', 'sea_brazil_atlantic_south'],
  ['sea_south_atlantic_e', 'sea_cape_waters'], ['sea_south_atlantic_e', 'sea_brazil_atlantic_south'],
  ['sea_guiana_atlantic', 'sea_caribbean_east'], ['sea_guiana_atlantic', 'sea_brazil_atlantic_north'],
  ['sea_brazil_atlantic_north', 'sea_equatorial_atlantic_islands'],
  ['sea_brazil_atlantic_north', 'sea_brazil_atlantic_south'],
  ['sea_brazil_atlantic_south', 'sea_rio_plata'], ['sea_rio_plata', 'sea_patagonian_atlantic'],
  ['sea_patagonian_atlantic', 'sea_southeast_pacific_sa'],
  ['sea_gulf_mexico', 'sea_florida_straits'], ['sea_gulf_mexico', 'sea_caribbean_west'],
  ['sea_florida_straits', 'sea_bahamas_antilles'], ['sea_florida_straits', 'sea_south_atlantic_american'],
  ['sea_caribbean_west', 'sea_caribbean_central'], ['sea_caribbean_west', 'sea_bahamas_antilles'],
  ['sea_caribbean_central', 'sea_caribbean_east'], ['sea_caribbean_central', 'sea_bahamas_antilles'],
  ['sea_caribbean_east', 'sea_bahamas_antilles'], ['sea_bahamas_antilles', 'sea_south_atlantic_american'],
  ['sea_south_atlantic_american', 'sea_mid_atlantic_american'],
  ['sea_mid_atlantic_american', 'sea_gulf_maine'], ['sea_mid_atlantic_american', 'sea_newfoundland'],
  ['sea_gulf_maine', 'sea_gulf_st_lawrence'], ['sea_gulf_maine', 'sea_newfoundland'],
  ['sea_gulf_st_lawrence', 'sea_newfoundland'], ['sea_newfoundland', 'sea_labrador'],
  ['sea_labrador', 'sea_hudson_strait'], ['sea_hudson_strait', 'sea_hudson_bay'],

  // Arctic ring.
  ['sea_hebrides', 'sea_faroe_shetland'], ['sea_faroe_shetland', 'sea_icelandic'],
  ['sea_faroe_shetland', 'sea_greenland'], ['sea_icelandic', 'sea_denmark_strait'],
  ['sea_icelandic', 'sea_greenland'], ['sea_denmark_strait', 'sea_greenland'],
  ['sea_denmark_strait', 'sea_baffin_greenland'], ['sea_baffin_greenland', 'sea_labrador'],
  ['sea_baffin_greenland', 'sea_canadian_arctic'], ['sea_canadian_arctic', 'sea_beaufort'],
  ['sea_beaufort', 'sea_east_siberian_e'], ['sea_east_siberian_e', 'sea_east_siberian'],
  ['sea_east_siberian', 'sea_laptev'], ['sea_laptev', 'sea_kara'], ['sea_kara', 'sea_barents'],
  ['sea_barents', 'sea_greenland'], ['sea_barents', 'sea_white'],

  // Southern-ocean ring and Cape route.
  ['sea_cape_waters', 'sea_west_indian'], ['sea_cape_waters', 'sea_southern_indian_w'],
  ['sea_southern_indian_w', 'sea_southern_indian_e'],
  ['sea_southern_indian_e', 'sea_southern_ocean_australia'],
  ['sea_southern_ocean_australia', 'sea_southern_ocean_pacific_w'],
  ['sea_southern_ocean_pacific_w', 'sea_southern_ocean_pacific_e'],
  ['sea_southern_ocean_pacific_e', 'sea_southern_ocean_america'],
  ['sea_southern_ocean_america', 'sea_patagonian_atlantic'],
  ['sea_southern_ocean_america', 'sea_southeast_pacific_sa'],
];

const graph = new Map();
function addEdge(a, b, passageId = null) {
  if (!graph.has(a)) graph.set(a, []);
  if (!graph.has(b)) graph.set(b, []);
  graph.get(a).push({ seaId: b, passageId });
  graph.get(b).push({ seaId: a, passageId });
}
for (const [a, b] of OPEN_CONNECTIONS) addEdge(a, b, null);

function addPassage(path, passageId) {
  for (let i = 0; i < path.length - 1; i++) addEdge(path[i], path[i + 1], passageId);
}
addPassage(CHOKEPOINTS.gibraltar.seas, 'gibraltar');
addPassage(CHOKEPOINTS.dardanelles.seas, 'dardanelles');
addPassage(CHOKEPOINTS.bosporus.seas, 'bosporus');
addPassage(CHOKEPOINTS.kerch.seas, 'kerch');
addPassage(CHOKEPOINTS.bab_el_mandeb.seas, 'bab_el_mandeb');
addPassage(CHOKEPOINTS.hormuz.seas, 'hormuz');
addPassage(CHOKEPOINTS.danish_straits.seas, 'danish_straits');
addPassage(CHOKEPOINTS.malacca.seas, 'malacca');
addPassage(CHOKEPOINTS.sunda.seas, 'sunda');
addPassage(CHOKEPOINTS.lombok.seas, 'lombok');
addPassage(CHOKEPOINTS.torres.seas, 'torres');
addPassage(CHOKEPOINTS.taiwan.seas, 'taiwan');
addPassage(CHOKEPOINTS.korea.seas, 'korea');
addPassage(CHOKEPOINTS.bass.seas, 'bass');
addPassage(CHOKEPOINTS.cook.seas, 'cook');

const routeCache = new Map();
const MAX_SEA_HOPS = 40;
const MAX_CACHE = 20000;

function cacheKey(aIds, bIds) {
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
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    if (current.path.length > MAX_SEA_HOPS + 1) continue;
    for (const edge of graph.get(current.seaId) || []) {
      if (visited.has(edge.seaId)) continue;
      const passages = edge.passageId ? [...current.passages, edge.passageId] : current.passages;
      const path = [...current.path, edge.seaId];
      if (goals.has(edge.seaId)) {
        const passageIds = [...new Set(passages)];
        const physicalFriction = passageIds.reduce((sum, id) => sum + (CHOKEPOINTS[id]?.physicalFriction || 0), 0);
        return remember(key, { seaIds: path, passageIds, physicalFriction });
      }
      visited.add(edge.seaId);
      queue.push({ seaId: edge.seaId, path, passages });
    }
  }
  return remember(key, null);
}

export function maritimeNetworkDiagnostics(knownSeaIds = []) {
  const known = new Set(knownSeaIds || []);
  const graphSeaIds = [...graph.keys()];
  const unknownGraphSeaIds = known.size ? graphSeaIds.filter((id) => !known.has(id)).sort() : [];
  return { graphSeaIds: graphSeaIds.sort(), unknownGraphSeaIds, edgeCount: [...graph.values()].reduce((n, edges) => n + edges.length, 0) / 2 };
}

export function maritimeReachableSeaIds(startSeaId) {
  if (!graph.has(startSeaId)) return [];
  const visited = new Set([startSeaId]);
  const queue = [startSeaId];
  for (let head = 0; head < queue.length; head++) {
    for (const edge of graph.get(queue[head]) || []) {
      if (visited.has(edge.seaId)) continue;
      visited.add(edge.seaId);
      queue.push(edge.seaId);
    }
  }
  return [...visited];
}

export function chokepointDefinition(id) {
  return CHOKEPOINTS[id] || null;
}
