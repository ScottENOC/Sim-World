const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);
const has = (region, techId) => Boolean(region?.unlockedTechIds?.has?.(techId));

export const BATTERY_MATERIAL_TECH_IDS = Object.freeze({
  MINERAL_PROCESSING: 'battery_mineral_processing',
  CELL_MANUFACTURING: 'battery_cell_manufacturing',
});

export const BATTERY_CELL_GOODS = Object.freeze({
  lead_acid: 'lead_acid_battery_cells',
  advanced_rechargeable: 'advanced_rechargeable_cells',
  lithium_ion: 'lithium_ion_cells',
});

export const BATTERY_RESOURCE_KEYS = Object.freeze([
  'lead_ore', 'lead',
  'lithium_ore', 'battery_grade_lithium',
  'cobalt_ore', 'battery_grade_cobalt',
  'nickel_ore', 'battery_grade_nickel',
  'natural_graphite', 'battery_graphite',
  ...Object.values(BATTERY_CELL_GOODS),
]);

const GEOLOGY = Object.freeze({
  lead: { chance: 0.43, minDepth: 0.20, scale: 150 },
  lithium: { chance: 0.24, minDepth: 0.18, scale: 70 },
  cobalt: { chance: 0.12, minDepth: 0.16, scale: 35 },
  nickel: { chance: 0.31, minDepth: 0.20, scale: 90 },
  graphite: { chance: 0.28, minDepth: 0.18, scale: 80 },
});

const CELL_CAPACITY_PER_UNIT = Object.freeze({
  lead_acid: 20,
  advanced_rechargeable: 34,
  lithium_ion: 62,
});

function stable01(text, salt = '') {
  let h = 2166136261;
  const value = `${salt}:${text || 'region'}`;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

function industrialReadiness(region) {
  const manufacture = clamp(region.structuralTransformation?.capability?.manufacture || 0);
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const chemistry = clamp(region.massEducation?.literacy || region.education?.literacy || 0);
  const electricity = clamp(region.electricity?.industrialService || 0);
  return clamp(manufacture * 0.38 + machining * 0.25 + chemistry * 0.15 + electricity * 0.22);
}

function miningReadiness(region) {
  const miners = nonNegative(region.occupations?.miner);
  const pop = Math.max(1, nonNegative(region.population));
  return clamp(0.16 + clamp(miners / pop * 18) * 0.44 + clamp(region.industrialSupply?.capability?.precision_machining || 0) * 0.40);
}

export function ensureBatteryGeology(region) {
  region.resourceDeposits ||= {};
  for (const [key, spec] of Object.entries(GEOLOGY)) {
    if (region.resourceDeposits[key]) continue;
    const occurrence = stable01(region.id || region.name, `battery-${key}-occurrence`);
    const present = occurrence < spec.chance;
    region.resourceDeposits[key] = {
      depth: present ? clamp(spec.minDepth + stable01(region.id || region.name, `battery-${key}-grade`) * (1 - spec.minDepth)) : 0,
      remainingFraction: present ? 1 : 0,
      inferred: true,
    };
  }
  return region.resourceDeposits;
}

export function ensureBatterySupplyChain(region) {
  region.stockpile ||= {};
  for (const key of BATTERY_RESOURCE_KEYS) if (!Number.isFinite(region.stockpile[key])) region.stockpile[key] = 0;
  region.batteryIndustry ||= {
    experience: { mineralProcessing: 0, cellManufacturing: 0 },
    facilities: { mineralProcessing: 0, cellManufacturing: 0 },
    lastOutput: {},
    shortages: {},
    totalCellsMade: 0,
  };
  region.batteryIndustry.experience ||= { mineralProcessing: 0, cellManufacturing: 0 };
  region.batteryIndustry.facilities ||= { mineralProcessing: 0, cellManufacturing: 0 };
  region.batteryIndustry.lastOutput ||= {};
  region.batteryIndustry.shortages ||= {};
  ensureBatteryGeology(region);
  return region.batteryIndustry;
}

function extract(region, depositKey, stockKey, scale, years) {
  const dep = region.resourceDeposits?.[depositKey];
  const depth = clamp(dep?.depth || 0);
  const remaining = clamp(dep?.remainingFraction ?? (depth > 0 ? 1 : 0));
  if (depth <= 0 || remaining <= 0 || years <= 0) return 0;
  const output = scale * depth * remaining * miningReadiness(region) * years;
  region.stockpile[stockKey] = nonNegative(region.stockpile[stockKey]) + output;
  dep.remainingFraction = clamp(remaining - output / Math.max(12000, scale * 160));
  return output;
}

function consume(stockpile, key, requested) {
  const available = nonNegative(stockpile[key]);
  const amount = Math.min(available, Math.max(0, requested));
  stockpile[key] = available - amount;
  return amount;
}

function recipeScale(stockpile, recipe, requestedOutput) {
  let scale = 1;
  for (const [key, perOutput] of Object.entries(recipe)) {
    if (perOutput <= 0) continue;
    scale = Math.min(scale, nonNegative(stockpile[key]) / Math.max(1e-9, requestedOutput * perOutput));
  }
  return clamp(scale);
}

function runRecipe(stockpile, recipe, outputKey, requestedOutput) {
  const scale = recipeScale(stockpile, recipe, requestedOutput);
  const output = Math.max(0, requestedOutput) * scale;
  for (const [key, perOutput] of Object.entries(recipe)) consume(stockpile, key, output * perOutput);
  stockpile[outputKey] = nonNegative(stockpile[outputKey]) + output;
  return output;
}

function bootstrapTechnology(region, industry) {
  region.unlockedTechIds ||= new Set();
  if ((has(region, 'advanced_rechargeable_batteries') || has(region, 'lithium_ion_batteries')) && industry > 0.28) {
    region.unlockedTechIds.add(BATTERY_MATERIAL_TECH_IDS.MINERAL_PROCESSING);
  }
  if (has(region, 'advanced_factories') && has(region, 'advanced_rechargeable_batteries') && industry > 0.42) {
    region.unlockedTechIds.add(BATTERY_MATERIAL_TECH_IDS.CELL_MANUFACTURING);
  }
}

function growFacilities(region, state, years, industry) {
  if (has(region, BATTERY_MATERIAL_TECH_IDS.MINERAL_PROCESSING)) {
    state.facilities.mineralProcessing = nonNegative(state.facilities.mineralProcessing) + years * (2 + 9 * industry) * (1 - clamp(state.facilities.mineralProcessing / 220));
  }
  if (has(region, BATTERY_MATERIAL_TECH_IDS.CELL_MANUFACTURING)) {
    state.facilities.cellManufacturing = nonNegative(state.facilities.cellManufacturing) + years * (1 + 6 * industry) * (1 - clamp(state.facilities.cellManufacturing / 160));
  }
}

function processMinerals(region, state, years, industry) {
  const capacity = nonNegative(state.facilities.mineralProcessing) * (0.35 + industry * 0.9) * years;
  if (capacity <= 0) return {};
  const each = capacity / 5;
  const outputs = {};
  const routes = [
    ['lead_ore', 'lead', 0.82],
    ['lithium_ore', 'battery_grade_lithium', 0.42],
    ['cobalt_ore', 'battery_grade_cobalt', 0.48],
    ['nickel_ore', 'battery_grade_nickel', 0.58],
    ['natural_graphite', 'battery_graphite', 0.72],
  ];
  for (const [input, output, yieldRate] of routes) {
    const feed = consume(region.stockpile, input, each);
    const made = feed * yieldRate * (0.78 + industry * 0.30);
    region.stockpile[output] = nonNegative(region.stockpile[output]) + made;
    outputs[output] = made;
  }
  const processed = Object.values(outputs).reduce((sum, value) => sum + value, 0);
  state.experience.mineralProcessing = nonNegative(state.experience.mineralProcessing) + processed;
  return outputs;
}

function cellDemandSignal(region) {
  const grids = Math.max(0, Number(region.construction?.completed?.local_electric_grid) || 0);
  const drones = Math.max(0, Number(region.droneForces?.inventory?.length) || 0);
  const pop = Math.max(0, Number(region.population) || 0);
  return 0.8 + grids * 1.6 + drones * 0.12 + Math.pow(pop / 100000, 0.45) * 1.2;
}

function makeCells(region, state, years, industry) {
  const capacity = nonNegative(state.facilities.cellManufacturing) * (0.38 + industry * 0.95) * years;
  if (capacity <= 0) return {};
  const demand = cellDemandSignal(region);
  const totalTarget = Math.min(capacity, demand * Math.max(0.25, years * 3.5));
  const output = {};

  if (has(region, 'lead_acid_batteries')) {
    const target = totalTarget * (has(region, 'lithium_ion_batteries') ? 0.16 : has(region, 'advanced_rechargeable_batteries') ? 0.42 : 1);
    output.lead_acid_battery_cells = runRecipe(region.stockpile, { lead: 0.78, sulfur: 0.08, copper: 0.025 }, 'lead_acid_battery_cells', target);
  }
  if (has(region, 'advanced_rechargeable_batteries')) {
    const target = totalTarget * (has(region, 'lithium_ion_batteries') ? 0.22 : 0.58);
    output.advanced_rechargeable_cells = runRecipe(region.stockpile, { battery_grade_nickel: 0.34, steel: 0.06, copper: 0.04 }, 'advanced_rechargeable_cells', target);
  }
  if (has(region, 'lithium_ion_batteries')) {
    const target = totalTarget * 0.62;
    // An abstract NMC-like mix. The low cobalt share also lets later economies
    // substitute away from cobalt without making lithium-ion batteries material-free.
    output.lithium_ion_cells = runRecipe(region.stockpile, {
      battery_grade_lithium: 0.10,
      battery_grade_cobalt: 0.06,
      battery_grade_nickel: 0.22,
      battery_graphite: 0.30,
      aluminium: 0.035,
      copper: 0.055,
      electronic_components: 0.012,
    }, 'lithium_ion_cells', target);
  }

  const made = Object.values(output).reduce((sum, value) => sum + nonNegative(value), 0);
  state.totalCellsMade = nonNegative(state.totalCellsMade) + made;
  state.experience.cellManufacturing = nonNegative(state.experience.cellManufacturing) + made;
  return output;
}

export function batteryCellGoodForChemistry(chemistryId) {
  return BATTERY_CELL_GOODS[chemistryId] || null;
}

export function batteryCellCapacityPerUnit(chemistryId) {
  return CELL_CAPACITY_PER_UNIT[chemistryId] || 0;
}

export function availableBatteryCapacityFromCells(region, chemistryId) {
  ensureBatterySupplyChain(region);
  const good = batteryCellGoodForChemistry(chemistryId);
  if (!good) return 0;
  return nonNegative(region.stockpile[good]) * batteryCellCapacityPerUnit(chemistryId);
}

export function consumeBatteryCellsForCapacity(region, chemistryId, requestedCapacity) {
  ensureBatterySupplyChain(region);
  const good = batteryCellGoodForChemistry(chemistryId);
  const capacityPerUnit = batteryCellCapacityPerUnit(chemistryId);
  if (!good || capacityPerUnit <= 0) return { capacity: 0, cellsUsed: 0, good };
  const requested = Math.max(0, Number(requestedCapacity) || 0);
  const cellsWanted = requested / capacityPerUnit;
  const cellsUsed = consume(region.stockpile, good, cellsWanted);
  return { capacity: cellsUsed * capacityPerUnit, cellsUsed, good };
}

export function consumeBatteryCells(region, chemistryId, cellsRequested) {
  ensureBatterySupplyChain(region);
  const good = batteryCellGoodForChemistry(chemistryId);
  if (!good) return 0;
  return consume(region.stockpile, good, Math.max(0, Number(cellsRequested) || 0));
}

export function tickBatterySupplyChain(region, elapsedDays = 7) {
  const state = ensureBatterySupplyChain(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const industry = industrialReadiness(region);
  bootstrapTechnology(region, industry);
  growFacilities(region, state, years, industry);

  const extracted = {
    lead_ore: extract(region, 'lead', 'lead_ore', GEOLOGY.lead.scale, years),
    lithium_ore: extract(region, 'lithium', 'lithium_ore', GEOLOGY.lithium.scale, years),
    cobalt_ore: extract(region, 'cobalt', 'cobalt_ore', GEOLOGY.cobalt.scale, years),
    nickel_ore: extract(region, 'nickel', 'nickel_ore', GEOLOGY.nickel.scale, years),
    natural_graphite: extract(region, 'graphite', 'natural_graphite', GEOLOGY.graphite.scale, years),
  };
  const processed = has(region, BATTERY_MATERIAL_TECH_IDS.MINERAL_PROCESSING) ? processMinerals(region, state, years, industry) : {};
  const cells = has(region, BATTERY_MATERIAL_TECH_IDS.CELL_MANUFACTURING) ? makeCells(region, state, years, industry) : {};
  state.lastOutput = { extracted, processed, cells };
  state.shortages = {
    lithium: has(region, 'lithium_ion_batteries') && nonNegative(region.stockpile.battery_grade_lithium) < 0.2,
    cobalt: has(region, 'lithium_ion_batteries') && nonNegative(region.stockpile.battery_grade_cobalt) < 0.1,
    nickel: has(region, 'advanced_rechargeable_batteries') && nonNegative(region.stockpile.battery_grade_nickel) < 0.2,
    graphite: has(region, 'lithium_ion_batteries') && nonNegative(region.stockpile.battery_graphite) < 0.3,
  };
  return state.lastOutput;
}
