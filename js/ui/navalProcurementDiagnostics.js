// Read-only diagnostics for the naval construction loop in economy/laborCore.js.
// Keep these base costs aligned with WARSHIP_BUILD_COST there; the regression
// test covers representative modern classes so the player-facing explanation
// does not silently drift away from the simulation.
export const WARSHIP_BUILD_COST_DIAGNOSTIC = Object.freeze({
  basic_war_boat: { wood: 200 },
  galley: { wood: 300, pitch: 20, textiles: 15, metal: 5 },
  ocean_sailing_warship: { wood: 420, pitch: 28, textiles: 30, metal: 8 },
  gunpowder_sailing_warship: { wood: 520, pitch: 32, textiles: 38, metal: 14, gunpowder: 2 },
  frigate: { wood: 700, pitch: 42, textiles: 52, metal: 25, gunpowder: 5 },
  ship_of_line: { wood: 1100, pitch: 65, textiles: 80, metal: 45, gunpowder: 10 },
  paddle_steam_warship: { wood: 650, iron: 45, coal: 25, machine: 10 },
  steam_frigate: { wood: 600, iron: 70, coal: 35, machine: 16 },
  ironclad: { wood: 350, iron: 150, coal: 45, machine: 24 },
  steel_warship: { wood: 180, steel: 220, coal: 55, machine: 34 },
  fleet_tug: { steel: 90, coal: 24, machine: 26 },
  destroyer: { steel: 150, coal: 42, machine: 46, gunpowder: 4 },
  submarine: { steel: 120, machine: 62, petrol: 30 },
  dreadnought: { steel: 700, coal: 120, machine: 105, gunpowder: 20 },
});

const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;

export function shipbuildingInputAvailable(region, key) {
  if (key === 'metal') return ['bronze', 'iron', 'steel'].reduce((sum, metal) => sum + Math.max(0, Number(region?.stockpile?.[metal]) || 0), 0);
  if (key === 'machine') return Math.max(0, Number(region?.industrialSupply?.inventory?.machine_components) || 0);
  return Math.max(0, Number(region?.stockpile?.[key]) || 0);
}

function currentDesign(region, designId) {
  return [...(region?.navalDesignCatalogue?.[designId] || [])].reverse().find((design) => design?.toolingReady !== false) || null;
}

export function effectiveWarshipBuildCost(region, designId) {
  const base = WARSHIP_BUILD_COST_DIAGNOSTIC[designId];
  if (!base) return null;
  const cost = { ...base };
  const design = currentDesign(region, designId);
  if (cost.steel != null) cost.steel *= Math.max(0, Number(design?.stats?.steelConstructionMultiplier) || 1);
  for (const [key, amount] of Object.entries(design?.stats?.systemInputs || {})) {
    cost[key] = (cost[key] || 0) + Math.max(0, Number(amount) || 0);
  }
  return cost;
}

function polityInputAvailable(world, region, key) {
  const owner = actorId(region);
  return (world?.regions || [])
    .filter((candidate) => actorId(candidate) === owner)
    .reduce((sum, candidate) => sum + shipbuildingInputAvailable(candidate, key), 0);
}

export function navalProcurementDiagnostic(world, region, designId) {
  const procurement = region?.navalProcurement || {};
  const target = Math.max(0, Math.round(Number(procurement.targets?.[designId]) || 0));
  const built = Math.max(0, Number(procurement.built?.[designId]) || 0);
  const outstanding = Math.max(0, target - built);
  const cost = effectiveWarshipBuildCost(region, designId);
  const materials = Object.entries(cost || {}).map(([key, required]) => {
    const local = shipbuildingInputAvailable(region, key);
    const polity = polityInputAvailable(world, region, key);
    return {
      key,
      required,
      local,
      polity,
      elsewhere: Math.max(0, polity - local),
      localHullEquivalents: required > 0 ? local / required : Infinity,
      blocked: required > 0 && local <= 1e-9,
    };
  });
  const shipwrightWorkers = Math.max(0, Number(region?.report?.boatmaking?.workers) || 0);
  const zeroMaterials = materials.filter((item) => item.blocked);
  const currentHullProgress = outstanding > 0 ? Math.max(0, built - Math.floor(built)) : 0;
  let blocker = null;
  if (!cost) blocker = 'No construction profile exists for this ship class.';
  else if (zeroMaterials.length) blocker = `No local ${zeroMaterials.map((item) => item.key.replaceAll('_', ' ')).join(', ')}.`;
  else if (outstanding > 0 && shipwrightWorkers <= 0) blocker = 'No shipwright labour was assigned last tick.';
  return {
    designId,
    target,
    built,
    outstanding,
    currentHullProgress,
    shipwrightWorkers,
    materials,
    blocker,
    localOnly: true,
  };
}
