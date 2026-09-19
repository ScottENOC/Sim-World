const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const BAYER_ALUMINA_TECH_ID = 'bayer_alumina_refining';
export const ALUMINIUM_SMELTING_TECH_ID = 'hall_heroult_aluminium';
export const TITANIUM_DIOXIDE_TECH_ID = 'titanium_dioxide_pigment';
export const TITANIUM_METAL_TECH_ID = 'kroll_titanium';
export const LIGHT_ALLOY_TECH_ID = 'aerospace_light_alloys';

function stable01(text, salt = '') {
  let h = 2166136261;
  const value = `${salt}:${text || 'region'}`;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function tech(region, id) {
  return Boolean(region?.unlockedTechIds?.has?.(id));
}

function industrialReadiness(region) {
  const manufacture = clamp(region.structuralTransformation?.capability?.manufacture || 0);
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const advanced = tech(region, 'advanced_factories') ? 1 : 0;
  const chemistry = clamp(region.massEducation?.literacy || region.education?.literacy || 0);
  return clamp(manufacture * 0.42 + machining * 0.30 + advanced * 0.16 + chemistry * 0.12);
}

function electricityReadiness(region) {
  const industrial = clamp(region.electricity?.industrialService || 0);
  const delivered = nonNegative(region.electricity?.delivered);
  return clamp(industrial * 0.78 + Math.log1p(delivered) / 18 * 0.22);
}

function miningReadiness(region) {
  const miners = nonNegative(region.occupations?.miner);
  const population = Math.max(1, nonNegative(region.population));
  const minerShare = clamp(miners / population * 16);
  const machinery = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  return clamp(0.22 + minerShare * 0.42 + machinery * 0.36);
}

function ensureGeology(region) {
  region.resourceDeposits ||= {};
  if (!region.resourceDeposits.bauxite) {
    const draw = stable01(region.id || region.name, 'bauxite');
    const stone = clamp(region.resourceDeposits.stone?.depth || region.resourceDeposits.stone?.remainingFraction || 0.45);
    region.resourceDeposits.bauxite = {
      depth: draw > 0.72 ? clamp(0.28 + stable01(region.id || region.name, 'bauxite-grade') * 0.72) : 0,
      remainingFraction: draw > 0.72 ? 1 : 0,
      inferred: true,
      geologyProxy: stone,
    };
  }
  if (!region.resourceDeposits.titanium_minerals) {
    const draw = stable01(region.id || region.name, 'titanium');
    region.resourceDeposits.titanium_minerals = {
      depth: draw > 0.58 ? clamp(0.18 + stable01(region.id || region.name, 'titanium-grade') * 0.72) : 0,
      remainingFraction: draw > 0.58 ? 1 : 0,
      inferred: true,
    };
  }
}

export function ensureLightMetals(region) {
  region.stockpile ||= {};
  for (const key of ['bauxite', 'alumina', 'aluminium', 'titanium_minerals', 'titanium_dioxide', 'titanium']) {
    if (!Number.isFinite(region.stockpile[key])) region.stockpile[key] = 0;
  }
  region.lightMetals ||= {};
  const state = region.lightMetals;
  state.progress ||= {};
  state.experience ||= {};
  state.lastOutput ||= {};
  state.demand ||= {};
  state.military ||= {};
  for (const key of [BAYER_ALUMINA_TECH_ID, ALUMINIUM_SMELTING_TECH_ID, TITANIUM_DIOXIDE_TECH_ID, TITANIUM_METAL_TECH_ID, LIGHT_ALLOY_TECH_ID]) {
    if (!Number.isFinite(state.progress[key])) state.progress[key] = 0;
  }
  ensureGeology(region);
  return state;
}

function advanceTechnology(region, state, id, annualRate, years, ready = true) {
  region.unlockedTechIds ||= new Set();
  if (region.unlockedTechIds.has(id) || !ready) return false;
  state.progress[id] = clamp(state.progress[id] + Math.max(0, annualRate) * years);
  if (state.progress[id] < 1) return false;
  region.unlockedTechIds.add(id);
  state.progress[id] = 1;
  state.newBreakthroughs ||= [];
  state.newBreakthroughs.push(id);
  return true;
}

function bootstrapModernKnowledge(region, state, industry, electric) {
  region.unlockedTechIds ||= new Set();
  const advanced = tech(region, 'advanced_factories');
  const industrialElectricity = tech(region, 'industrial_electrification');
  if (advanced && industry > 0.42) region.unlockedTechIds.add(BAYER_ALUMINA_TECH_ID);
  if (advanced && industrialElectricity && industry > 0.48 && electric > 0.35) region.unlockedTechIds.add(ALUMINIUM_SMELTING_TECH_ID);
  if (advanced && industry > 0.40) region.unlockedTechIds.add(TITANIUM_DIOXIDE_TECH_ID);
  if (advanced && tech(region, 'jet_propulsion') && industry > 0.60) region.unlockedTechIds.add(TITANIUM_METAL_TECH_ID);
  if (tech(region, ALUMINIUM_SMELTING_TECH_ID) && (tech(region, 'automobile') || tech(region, 'jet_propulsion')) && industry > 0.52) region.unlockedTechIds.add(LIGHT_ALLOY_TECH_ID);
  for (const id of region.unlockedTechIds) if (Object.prototype.hasOwnProperty.call(state.progress, id)) state.progress[id] = 1;
}

function extractOre(region, depositKey, stockKey, scale, years) {
  const dep = region.resourceDeposits?.[depositKey];
  const depth = clamp(dep?.depth || 0);
  const remaining = clamp(dep?.remainingFraction ?? (depth > 0 ? 1 : 0));
  if (depth <= 0 || remaining <= 0) return 0;
  const output = scale * depth * remaining * miningReadiness(region) * years;
  region.stockpile[stockKey] = nonNegative(region.stockpile[stockKey]) + output;
  dep.remainingFraction = clamp(remaining - output / Math.max(20000, scale * 180));
  return output;
}

function consume(stockpile, key, requested) {
  const available = nonNegative(stockpile[key]);
  const amount = Math.min(available, Math.max(0, requested));
  stockpile[key] = available - amount;
  return amount;
}

function productionScale(region) {
  const manufacture = clamp(region.structuralTransformation?.capability?.manufacture || 0);
  const scale = Math.max(0.35, Number(region.structuralTransformation?.scaleMultipliers?.manufacture) || 1);
  const factory = nonNegative(region.industrialPlants?.factoryCapacity || region.industrialSupply?.outputCapacity?.steel || 0);
  return (22 + manufacture * 120 + Math.log1p(factory) * 14) * scale;
}

function useCivilianMaterials(region, state, years) {
  const pop = nonNegative(region.population);
  const industry = industrialReadiness(region);
  const motor = tech(region, 'automobile') ? 1 : 0;
  const grids = nonNegative(region.electricity?.delivered) > 0 ? 1 : 0;
  const computing = tech(region, 'packaged_integrated_circuits') || nonNegative(region.stockpile.packaged_chips) > 0 ? 1 : 0;

  const aluminiumWanted = (Math.pow(pop / 1000, 0.58) * (0.4 + industry * 1.6 + motor * 0.65 + grids * 0.45 + computing * 0.18)) * years;
  const aluminiumUsed = consume(region.stockpile, 'aluminium', aluminiumWanted);
  const pigmentWanted = (Math.pow(pop / 1000, 0.54) * (0.25 + industry * 1.25)) * years;
  const pigmentUsed = consume(region.stockpile, 'titanium_dioxide', pigmentWanted);
  const titaniumWanted = tech(region, TITANIUM_METAL_TECH_ID)
    ? (Math.pow(pop / 1000, 0.34) * (0.04 + industry * 0.24 + (tech(region, 'jet_propulsion') ? 0.18 : 0))) * years
    : 0;
  const titaniumUsed = consume(region.stockpile, 'titanium', titaniumWanted);

  state.demand = { aluminiumWanted, aluminiumUsed, titaniumDioxideWanted: pigmentWanted, titaniumDioxideUsed: pigmentUsed, titaniumWanted, titaniumUsed };
  state.civilianBenefits = {
    transportWeightReduction: clamp(aluminiumUsed / Math.max(0.01, aluminiumWanted)) * (tech(region, LIGHT_ALLOY_TECH_ID) ? 0.12 : 0.05),
    electricalConstructionEfficiency: clamp(aluminiumUsed / Math.max(0.01, aluminiumWanted)) * 0.08,
    durableGoodsAndPackaging: clamp(aluminiumUsed / Math.max(0.01, aluminiumWanted)) * 0.10,
    paintPlasticsPaperSupply: clamp(pigmentUsed / Math.max(0.01, pigmentWanted)),
    highPerformanceIndustrialMaterials: clamp(titaniumUsed / Math.max(0.01, titaniumWanted || 1)),
  };
}

function updateMilitaryMaterialProfile(region, state) {
  const designs = region.militaryEquipment?.designs || [];
  const jets = designs.filter(d => ['fighter', 'bomber'].includes(d.family) && d.stats?.propulsion === 'jet').length;
  const aircraft = designs.filter(d => ['fighter', 'bomber'].includes(d.family)).length;
  const aluminiumAvailability = clamp(nonNegative(region.stockpile.aluminium) / (40 + aircraft * 18));
  const titaniumAvailability = tech(region, TITANIUM_METAL_TECH_ID) ? clamp(nonNegative(region.stockpile.titanium) / (12 + jets * 8)) : 0;
  const alloyKnowledge = tech(region, LIGHT_ALLOY_TECH_ID) ? 1 : 0;
  state.military = {
    aluminiumAvailability,
    titaniumAvailability,
    aircraftWeightMultiplier: clamp(1 - aluminiumAvailability * (0.07 + alloyKnowledge * 0.08) - titaniumAvailability * jets * 0.006, 0.72, 1),
    aircraftRangeMultiplier: 1 + aluminiumAvailability * (0.04 + alloyKnowledge * 0.07) + titaniumAvailability * (jets > 0 ? 0.08 : 0.02),
    aircraftPayloadMultiplier: 1 + aluminiumAvailability * (0.035 + alloyKnowledge * 0.065) + titaniumAvailability * (jets > 0 ? 0.07 : 0.015),
    jetEngineHotSectionCapability: jets > 0 ? clamp(0.45 + titaniumAvailability * 0.55) : 0,
    navalCorrosionMaterialCapability: clamp(aluminiumAvailability * 0.45 + titaniumAvailability * 0.55),
    armourMaterialCapability: clamp(titaniumAvailability * 0.38),
  };
}

export function lightMetalMilitaryModifiers(region) {
  return ensureLightMetals(region).military || {};
}

export function tickLightMetals(region, elapsedDays = 7) {
  const state = ensureLightMetals(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const industry = industrialReadiness(region);
  const electric = electricityReadiness(region);
  bootstrapModernKnowledge(region, state, industry, electric);

  advanceTechnology(region, state, BAYER_ALUMINA_TECH_ID, 0.04 + industry * 0.11, years, industry > 0.24);
  advanceTechnology(region, state, ALUMINIUM_SMELTING_TECH_ID, 0.025 + industry * 0.06 + electric * 0.10, years,
    tech(region, BAYER_ALUMINA_TECH_ID) && tech(region, 'industrial_electrification') && electric > 0.18);
  advanceTechnology(region, state, TITANIUM_DIOXIDE_TECH_ID, 0.035 + industry * 0.09, years, industry > 0.30);
  advanceTechnology(region, state, TITANIUM_METAL_TECH_ID, 0.012 + industry * 0.045 + electric * 0.025, years,
    tech(region, TITANIUM_DIOXIDE_TECH_ID) && tech(region, 'advanced_factories') && industry > 0.48);
  advanceTechnology(region, state, LIGHT_ALLOY_TECH_ID, 0.025 + industry * 0.06, years,
    tech(region, ALUMINIUM_SMELTING_TECH_ID) && (tech(region, 'automobile') || tech(region, 'jet_propulsion')));

  const bauxite = extractOre(region, 'bauxite', 'bauxite', 180, years);
  const titaniumMinerals = extractOre(region, 'titanium_minerals', 'titanium_minerals', 85, years);
  const scale = productionScale(region);
  let alumina = 0, aluminium = 0, titaniumDioxide = 0, titanium = 0;

  if (tech(region, BAYER_ALUMINA_TECH_ID)) {
    const feed = consume(region.stockpile, 'bauxite', scale * 1.35 * years);
    alumina = feed * 0.52 * (0.72 + industry * 0.38);
    region.stockpile.alumina += alumina;
  }
  if (tech(region, ALUMINIUM_SMELTING_TECH_ID)) {
    const requestedFeed = scale * 0.55 * years;
    const electricityConstraint = clamp(electric * 1.15);
    const feed = consume(region.stockpile, 'alumina', requestedFeed * electricityConstraint);
    aluminium = feed * 0.48 * (0.82 + industry * 0.22);
    region.stockpile.aluminium += aluminium;
    state.electricityLoad = aluminium * 8.5;
  } else state.electricityLoad = 0;

  if (tech(region, TITANIUM_DIOXIDE_TECH_ID)) {
    const feed = consume(region.stockpile, 'titanium_minerals', scale * 0.48 * years);
    titaniumDioxide = feed * 0.60 * (0.78 + industry * 0.26);
    region.stockpile.titanium_dioxide += titaniumDioxide;
  }
  if (tech(region, TITANIUM_METAL_TECH_ID)) {
    const feed = consume(region.stockpile, 'titanium_minerals', scale * 0.085 * years);
    const power = clamp(0.45 + electric * 0.55);
    titanium = feed * 0.20 * power * (0.72 + industry * 0.34);
    region.stockpile.titanium += titanium;
    state.electricityLoad += titanium * 3.2;
  }

  state.lastOutput = { bauxite, alumina, aluminium, titaniumMinerals, titaniumDioxide, titanium };
  useCivilianMaterials(region, state, years);
  updateMilitaryMaterialProfile(region, state);
  region.report ||= {};
  region.report.lightMetals = {
    workers: 0,
    output: { ...state.lastOutput },
    demand: { ...state.demand },
    civilianBenefits: { ...state.civilianBenefits },
    military: { ...state.military },
    electricityLoad: state.electricityLoad || 0,
    breakthroughs: [...(state.newBreakthroughs || [])],
  };
  state.newBreakthroughs = [];
  return state;
}
