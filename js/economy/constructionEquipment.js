const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const nonNegative = (value) => Math.max(0, Number(value) || 0);

export const CONSTRUCTION_EQUIPMENT = Object.freeze({
  powerToolSets: { label: 'Powered tool sets', workersPerUnit: 6, portable: true },
  excavators: { label: 'Excavators', workersPerUnit: 42, portable: true },
  bulldozers: { label: 'Bulldozers', workersPerUnit: 55, portable: true },
  constructionTrucks: { label: 'Construction trucks', workersPerUnit: 18, portable: true },
  mobileCranes: { label: 'Mobile/heavy cranes', workersPerUnit: 60, portable: true },
  concretePlantUnits: { label: 'Concrete batching/pumping plant', workersPerUnit: 85, portable: true },
  tunnelBoringMachines: { label: 'Tunnel-boring machines', workersPerUnit: 900, portable: false },
  cableLayingVessels: { label: 'Cable-laying vessels', workersPerUnit: 5000, portable: true, coastal: true },
});

const DEFAULT_STOCK = Object.freeze(Object.fromEntries(Object.keys(CONSTRUCTION_EQUIPMENT).map((id) => [id, 0])));

export function ensureConstructionEquipment(region) {
  region.constructionEquipment ||= { stock: {}, serviceable: {}, targets: {}, utilisation: {}, lastReport: {} };
  const state = region.constructionEquipment;
  state.stock ||= {}; state.serviceable ||= {}; state.targets ||= {}; state.utilisation ||= {}; state.lastReport ||= {};
  for (const id of Object.keys(CONSTRUCTION_EQUIPMENT)) {
    state.stock[id] = nonNegative(state.stock[id] ?? DEFAULT_STOCK[id]);
    state.serviceable[id] = Math.min(state.stock[id], nonNegative(state.serviceable[id] ?? state.stock[id]));
    state.targets[id] = nonNegative(state.targets[id]);
    state.utilisation[id] = 0;
  }
  return state;
}

export function seedConstructionEquipment(region, equipment = {}, { force = false } = {}) {
  const state = ensureConstructionEquipment(region);
  for (const [id, amount] of Object.entries(equipment || {})) {
    if (!CONSTRUCTION_EQUIPMENT[id]) continue;
    const value = nonNegative(amount);
    if (force) state.stock[id] = value;
    else state.stock[id] = Math.max(state.stock[id], value);
    state.serviceable[id] = Math.max(state.serviceable[id], state.stock[id] * 0.94);
    state.targets[id] = Math.max(state.targets[id], state.stock[id]);
  }
  return state;
}

function projectProfile(typeId) {
  const heavyCivil = {
    road_network: { earthworks: .34, haulage: .24, heavyLift: .14, concrete: .08, general: .20 },
    railway_station: { earthworks: .12, haulage: .16, heavyLift: .28, concrete: .18, general: .26 },
    harbour: { earthworks: .18, haulage: .20, heavyLift: .24, concrete: .18, general: .20 },
    advanced_shipyard: { earthworks: .10, haulage: .14, heavyLift: .30, concrete: .18, general: .28 },
    naval_base: { earthworks: .12, haulage: .15, heavyLift: .24, concrete: .16, general: .33 },
    strategic_naval_base: { earthworks: .14, haulage: .15, heavyLift: .25, concrete: .18, tunnelling: .08, general: .20 },
    dry_dock: { earthworks: .18, haulage: .16, heavyLift: .22, concrete: .24, general: .20 },
    container_port: { earthworks: .16, haulage: .20, heavyLift: .28, concrete: .18, general: .18 },
    reservoir_dam: { earthworks: .28, haulage: .15, heavyLift: .10, concrete: .24, tunnelling: .13, general: .10 },
    hydroelectric_station: { earthworks: .10, haulage: .10, heavyLift: .24, concrete: .18, tunnelling: .25, general: .13 },
    canal: { earthworks: .46, haulage: .20, heavyLift: .06, concrete: .08, general: .20 },
    irrigation_canal: { earthworks: .48, haulage: .18, concrete: .08, general: .26 },
    bulk_water_pipeline: { earthworks: .35, haulage: .24, heavyLift: .10, concrete: .06, general: .25 },
    water_treatment_plant: { earthworks: .08, haulage: .10, heavyLift: .20, concrete: .24, general: .38 },
    wastewater_treatment_plant: { earthworks: .10, haulage: .10, heavyLift: .17, concrete: .27, general: .36 },
    coal_power_station: { earthworks: .08, haulage: .12, heavyLift: .27, concrete: .22, general: .31 },
    gas_power_station: { earthworks: .06, haulage: .10, heavyLift: .28, concrete: .16, general: .40 },
    nuclear_power_station: { earthworks: .08, haulage: .10, heavyLift: .28, concrete: .28, general: .26 },
    petroleum_refinery: { earthworks: .06, haulage: .10, heavyLift: .26, concrete: .14, general: .44 },
    factory: { earthworks: .08, haulage: .12, heavyLift: .18, concrete: .18, general: .44 },
  };
  return heavyCivil[typeId] || { earthworks: .06, haulage: .08, heavyLift: .08, concrete: .08, general: .70 };
}

function supportRatio(state, equipmentId, workers) {
  const spec = CONSTRUCTION_EQUIPMENT[equipmentId];
  if (!spec) return 0;
  const supported = nonNegative(state.serviceable[equipmentId]) * spec.workersPerUnit;
  return clamp(supported / Math.max(1, workers), 0, 1);
}

function taskFactor(region, state, task, workers) {
  const industrial = clamp(region?.structuralTransformation?.capability?.manufacture || 0);
  const electricity = clamp(region?.electricity?.industrialService ?? region?.electricity?.service ?? 0);
  const powered = supportRatio(state, 'powerToolSets', workers);
  if (task === 'general') return 1 + powered * (1.5 + electricity * 1.2) + industrial * .8;
  if (task === 'earthworks') {
    const excavators = supportRatio(state, 'excavators', workers);
    const dozers = supportRatio(state, 'bulldozers', workers);
    return .55 + excavators * 4.3 + dozers * 2.8 + powered * .7;
  }
  if (task === 'haulage') {
    const trucks = supportRatio(state, 'constructionTrucks', workers);
    return .55 + trucks * 4.7 + industrial * .5;
  }
  if (task === 'heavyLift') {
    const cranes = supportRatio(state, 'mobileCranes', workers);
    // Industrial steelwork without cranes is a true bottleneck: more labour is not a substitute for lift capacity.
    const manual = industrial > .45 ? .12 : .62;
    return manual + cranes * 7.2 + powered * .25;
  }
  if (task === 'concrete') {
    const plant = supportRatio(state, 'concretePlantUnits', workers);
    return .55 + plant * 5.8 + trucksOrZero(state, workers) * 1.3;
  }
  if (task === 'tunnelling') {
    const tbm = nonNegative(state.serviceable.tunnelBoringMachines);
    if (tbm >= 1) return Math.min(14, 2.2 + tbm * 8.5 + industrial * 1.2);
    return industrial > .45 ? .35 : .75;
  }
  return 1;
}

function trucksOrZero(state, workers) {
  return supportRatio(state, 'constructionTrucks', workers);
}

/**
 * Task-specific construction equipment multiplier. A weighted harmonic mean makes
 * a starved task a genuine bottleneck rather than allowing easy tasks to average it away.
 */
export function constructionEquipmentFactor(region, typeId, workers = 100) {
  const state = ensureConstructionEquipment(region);
  const profile = projectProfile(typeId);
  let denominator = 0;
  const tasks = {};
  for (const [task, share] of Object.entries(profile)) {
    if (share <= 0) continue;
    const factor = Math.max(.02, taskFactor(region, state, task, workers));
    tasks[task] = { share, factor };
    denominator += share / factor;
  }
  const factor = denominator > 0 ? 1 / denominator : 1;
  return { factor: Math.max(.2, Math.min(6, factor)), tasks, profile };
}

export function constructionEquipmentBottlenecks(region, typeId, workers = 100) {
  const result = constructionEquipmentFactor(region, typeId, workers);
  return Object.entries(result.tasks)
    .map(([task, info]) => ({ task, ...info }))
    .filter((entry) => entry.share >= .08 && entry.factor < 1)
    .sort((a, b) => (a.factor - b.factor) || (b.share - a.share));
}

export function constructionEquipmentSummary(region) {
  const state = ensureConstructionEquipment(region);
  return Object.entries(CONSTRUCTION_EQUIPMENT).map(([id, spec]) => ({
    id, label: spec.label, stock: nonNegative(state.stock[id]), serviceable: nonNegative(state.serviceable[id]), target: nonNegative(state.targets[id]),
  }));
}

export function tickConstructionEquipment(region, elapsedDays = 7) {
  const state = ensureConstructionEquipment(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / 365.2425;
  const industrial = clamp(region?.structuralTransformation?.capability?.manufacture || 0);
  const precision = clamp(region?.industrialSupply?.capability?.precision_machining || 0);
  const factories = (region?.construction?.assets || []).filter((asset) => asset.typeId === 'factory' && nonNegative(asset.condition ?? 1) > .5).length;
  const service = clamp(.60 + precision * .28 + industrial * .12);
  const attritionRate = .035 + (1 - service) * .09;
  for (const id of Object.keys(CONSTRUCTION_EQUIPMENT)) {
    const stock = nonNegative(state.stock[id]);
    state.serviceable[id] = Math.min(stock, nonNegative(state.serviceable[id]) * Math.max(0, 1 - attritionRate * years) + stock * service * .025 * years);
  }

  // Mature industry can replenish ordinary plant toward explicit targets. Specialised
  // TBMs and cable ships remain discrete capital: they are never conjured from generic capacity.
  if (factories > 0 && industrial > .35 && precision > .30) {
    const buildable = ['powerToolSets','excavators','bulldozers','constructionTrucks','mobileCranes','concretePlantUnits'];
    const annualCapacity = factories * (4 + industrial * 10 + precision * 8);
    let remainingCapacity = annualCapacity * years;
    for (const id of buildable) {
      if (remainingCapacity <= 0) break;
      const gap = Math.max(0, nonNegative(state.targets[id]) - nonNegative(state.stock[id]));
      if (gap <= 0) continue;
      const unitCost = id === 'powerToolSets' ? .08 : id === 'constructionTrucks' ? .8 : id === 'mobileCranes' ? 2.3 : id === 'concretePlantUnits' ? 1.8 : 1.2;
      const wanted = Math.min(gap, remainingCapacity / unitCost);
      if (wanted <= 0) continue;
      const steelNeed = wanted * unitCost * .28;
      const componentsNeed = wanted * unitCost * .16;
      const steelAvailable = nonNegative(region?.stockpile?.steel);
      const components = nonNegative(region?.industrialSupply?.inventory?.machine_components);
      const resourceFactor = Math.min(1, steelAvailable / Math.max(.001, steelNeed), components / Math.max(.001, componentsNeed));
      const built = wanted * resourceFactor;
      if (built <= 0) continue;
      region.stockpile.steel = steelAvailable - steelNeed * resourceFactor;
      region.industrialSupply.inventory.machine_components = components - componentsNeed * resourceFactor;
      state.stock[id] += built;
      state.serviceable[id] += built;
      remainingCapacity -= built * unitCost;
    }
  }
  state.lastReport = { serviceReadiness: service, industrialCapability: industrial, precisionMachining: precision };
  return state;
}

export function availableSpecialisedEquipment(regions, homeRegion, equipmentId) {
  const polity = homeRegion?.governance?.sovereignPolityId || homeRegion?.scenarioCountryId || homeRegion?.controllingActorId;
  let total = 0;
  for (const region of regions || []) {
    const otherPolity = region?.governance?.sovereignPolityId || region?.scenarioCountryId || region?.controllingActorId;
    if (!polity || otherPolity !== polity) continue;
    if (CONSTRUCTION_EQUIPMENT[equipmentId]?.coastal && !region.isCoastal) continue;
    total += nonNegative(ensureConstructionEquipment(region).serviceable[equipmentId]);
  }
  return total;
}
