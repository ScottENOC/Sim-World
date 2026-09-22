const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const CIRCULAR_ECONOMY_TECH_IDS = Object.freeze({
  RECYCLING: 'industrial_materials_recycling',
  ADVANCED_RECOVERY: 'advanced_materials_recovery',
  ECODESIGN: 'industrial_ecodesign',
});

export const MATERIAL_SPECS = Object.freeze({
  copper: { stockKey: 'copper', depositKeys: ['copper'], lifetimeYears: 32, maxRecovery: .92, criticality: .72, substitutability: .42 },
  tin: { stockKey: 'tin', depositKeys: ['tin'], lifetimeYears: 24, maxRecovery: .88, criticality: .58, substitutability: .48 },
  iron: { stockKey: 'iron', depositKeys: ['ironOre','iron'], lifetimeYears: 38, maxRecovery: .94, criticality: .35, substitutability: .64 },
  steel: { stockKey: 'steel', depositKeys: ['ironOre','iron'], lifetimeYears: 42, maxRecovery: .96, criticality: .38, substitutability: .62 },
  aluminium: { stockKey: 'aluminium', depositKeys: ['bauxite'], lifetimeYears: 28, maxRecovery: .94, criticality: .50, substitutability: .61 },
  titanium: { stockKey: 'titanium', depositKeys: ['titanium_minerals'], lifetimeYears: 34, maxRecovery: .86, criticality: .69, substitutability: .31 },
  lead: { stockKey: 'lead', depositKeys: ['lead'], lifetimeYears: 18, maxRecovery: .96, criticality: .44, substitutability: .58 },
  lithium: { stockKey: 'battery_grade_lithium', depositKeys: ['lithium'], lifetimeYears: 13, maxRecovery: .88, criticality: .90, substitutability: .45 },
  cobalt: { stockKey: 'battery_grade_cobalt', depositKeys: ['cobalt'], lifetimeYears: 13, maxRecovery: .91, criticality: .96, substitutability: .66 },
  nickel: { stockKey: 'battery_grade_nickel', depositKeys: ['nickel'], lifetimeYears: 18, maxRecovery: .91, criticality: .77, substitutability: .54 },
  graphite: { stockKey: 'battery_graphite', depositKeys: ['graphite'], lifetimeYears: 12, maxRecovery: .78, criticality: .73, substitutability: .50 },
});

function tech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function industry(region) { return clamp(region?.structuralTransformation?.capability?.manufacture || 0); }
function literacy(region) { return clamp(region?.massEducation?.literacy ?? region?.publicEducation?.literacy ?? region?.educationLevel ?? 0); }
function electricity(region) { return clamp(region?.electricity?.industrialService || 0); }

export function ensureCircularEconomy(region) {
  region.circularEconomy ||= {};
  const s = region.circularEconomy;
  s.policy ||= { collectionEffort: .18, recycledContentStandard: 0, landfillDisincentive: .08, repairAndReuse: .12 };
  s.capability ||= { collection: .08, sorting: .05, recovery: .04, ecodesign: 0 };
  s.inUse ||= {}; s.scrap ||= {}; s.pendingUse ||= {}; s.recovered ||= {}; s.losses ||= {}; s.materials ||= {};
  for (const key of Object.keys(MATERIAL_SPECS)) {
    if (!Number.isFinite(s.inUse[key])) s.inUse[key] = 0;
    if (!Number.isFinite(s.scrap[key])) s.scrap[key] = 0;
    if (!Number.isFinite(s.pendingUse[key])) s.pendingUse[key] = 0;
    if (!Number.isFinite(s.recovered[key])) s.recovered[key] = 0;
    if (!Number.isFinite(s.losses[key])) s.losses[key] = 0;
  }
  if (!Number.isFinite(s.circularityRate)) s.circularityRate = 0;
  if (!Number.isFinite(s.virginDependence)) s.virginDependence = 1;
  if (!Number.isFinite(s.materialSecurity)) s.materialSecurity = 0;
  if (!Number.isFinite(s.durableControlMargin)) s.durableControlMargin = 0;
  return s;
}

export function setCircularEconomyPolicy(region, patch = {}) {
  const p = ensureCircularEconomy(region).policy;
  for (const key of ['collectionEffort','recycledContentStandard','landfillDisincentive','repairAndReuse']) if (patch[key] !== undefined) p[key] = clamp(patch[key]);
  return { ...p };
}

export function recordMaterialUse(region, material, amount, sector = 'general') {
  if (!MATERIAL_SPECS[material]) return 0;
  const used = nonNegative(amount);
  if (!used) return 0;
  const s = ensureCircularEconomy(region);
  s.pendingUse[material] = nonNegative(s.pendingUse[material]) + used;
  s.materials[material] ||= {}; s.materials[material].lastSector = sector;
  return used;
}

function depositReserve(deposit) {
  if (!deposit) return { remaining: 0, initial: 0, fraction: 0 };
  if (Array.isArray(deposit.tiers)) {
    let remaining = 0, initial = 0;
    for (const tier of deposit.tiers) { remaining += nonNegative(tier.remainingStock); initial += nonNegative(tier.initialStock); }
    return { remaining, initial, fraction: initial > 0 ? clamp(remaining / initial) : 0 };
  }
  const fraction = clamp(deposit.remainingFraction ?? (deposit.depth > 0 ? 1 : 0));
  return { remaining: fraction, initial: deposit.depth > 0 ? 1 : 0, fraction };
}

export function materialReserveStatus(region, material) {
  const spec = MATERIAL_SPECS[material]; if (!spec) return { fraction: 0, remaining: 0, initial: 0 };
  let remaining = 0, initial = 0;
  for (const key of spec.depositKeys) { const d = depositReserve(region?.resourceDeposits?.[key]); remaining += d.remaining; initial += d.initial; }
  return { remaining, initial, fraction: initial > 0 ? clamp(remaining / initial) : 0 };
}

function bootstrapKnowledge(region) {
  region.unlockedTechIds ||= new Set(); const ind = industry(region), lit = literacy(region), elec = electricity(region);
  if ((tech(region,'advanced_factories') || tech(region,'industrial_electrification')) && ind > .34) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.RECYCLING);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.RECYCLING) && tech(region,'industrial_electrification') && ind > .55 && lit > .45 && elec > .35) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY) && ind > .62 && lit > .58) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN);
}

function updateCapability(region, s, years) {
  bootstrapKnowledge(region);
  const ind = industry(region), lit = literacy(region), elec = electricity(region), p = s.policy;
  const recycling = tech(region,CIRCULAR_ECONOMY_TECH_IDS.RECYCLING) ? 1 : 0, advanced = tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY) ? 1 : 0, ecodesign = tech(region,CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN) ? 1 : 0;
  const targets = {
    collection: clamp(.06 + p.collectionEffort*.46 + p.landfillDisincentive*.18 + recycling*.18 + advanced*.12),
    sorting: clamp(.04 + ind*.22 + lit*.12 + recycling*.30 + advanced*.28),
    recovery: clamp(.03 + ind*.16 + elec*.14 + recycling*.28 + advanced*.36),
    ecodesign: clamp(p.repairAndReuse*.18 + p.recycledContentStandard*.22 + ecodesign*.60),
  };
  const rate = clamp(years * (.18 + ind*.20), 0, .35);
  for (const [key,target] of Object.entries(targets)) s.capability[key] += (target - s.capability[key]) * rate;
}

function tickMaterial(region, s, material, years) {
  const spec = MATERIAL_SPECS[material], added = nonNegative(s.pendingUse[material]); s.pendingUse[material] = 0;
  const repairLife = 1 + s.policy.repairAndReuse * .55 + s.capability.ecodesign * .45;
  const retireRate = 1 - Math.exp(-years / Math.max(1, spec.lifetimeYears * repairLife));
  const retired = nonNegative(s.inUse[material]) * retireRate;
  s.inUse[material] = Math.max(0, nonNegative(s.inUse[material]) + added - retired);
  const collected = retired * clamp(s.capability.collection);
  const uncollected = retired - collected;
  s.scrap[material] = nonNegative(s.scrap[material]) + collected;
  const recoveryEfficiency = clamp((.18 + s.capability.sorting*.34 + s.capability.recovery*.48) * spec.maxRecovery, 0, spec.maxRecovery);
  const processRate = clamp(years * (.35 + s.capability.recovery*1.8), 0, 1);
  const scrapProcessed = s.scrap[material] * processRate;
  const recovered = scrapProcessed * recoveryEfficiency;
  const processLoss = scrapProcessed - recovered;
  s.scrap[material] = Math.max(0, s.scrap[material] - scrapProcessed);
  s.recovered[material] += recovered; s.losses[material] += uncollected + processLoss;
  region.stockpile ||= {}; region.stockpile[spec.stockKey] = nonNegative(region.stockpile[spec.stockKey]) + recovered;
  const reserve = materialReserveStatus(region, material);
  const annualUse = years > 0 ? added / years : 0;
  const secondaryShare = added > 0 ? clamp(recovered / added) : (retired > 0 ? clamp(recovered / retired) : 0);
  const depletionPressure = annualUse > 0 ? clamp((1-reserve.fraction) * spec.criticality * (1-secondaryShare*.72)) : 0;
  const substitution = clamp(spec.substitutability * (.25 + s.capability.ecodesign*.55 + industry(region)*.20));
  const security = clamp(reserve.fraction*.42 + secondaryShare*.36 + substitution*.22);
  s.materials[material] = { ...(s.materials[material]||{}), added, retired, recovered, reserveFraction: reserve.fraction, secondaryShare, depletionPressure, substitutionPotential: substitution, security };
  return s.materials[material];
}

export function tickCircularEconomy(region, elapsedDays = 7) {
  const s = ensureCircularEconomy(region), years = Math.max(0, Number(elapsedDays)||0) / DAYS_PER_YEAR;
  updateCapability(region,s,years);
  const results = {}; for (const material of Object.keys(MATERIAL_SPECS)) results[material] = tickMaterial(region,s,material,years);
  const active = Object.values(results).filter(m => m.added > 0 || m.retired > 0 || m.reserveFraction > 0);
  const weighted = active.length ? active.reduce((a,m)=>{const w=.25+.75*(m.depletionPressure||.1);a.w+=w;a.secondary+=m.secondaryShare*w;a.security+=m.security*w;return a;},{w:0,secondary:0,security:0}) : {w:1,secondary:0,security:.5};
  s.circularityRate = clamp(weighted.secondary/Math.max(.0001,weighted.w));
  s.materialSecurity = clamp(weighted.security/Math.max(.0001,weighted.w));
  s.virginDependence = clamp(1-s.circularityRate);
  const reserveFloor = active.length ? Math.min(...active.map(m=>m.security)) : .5;
  s.durableControlMargin = clamp(s.materialSecurity*.55 + reserveFloor*.25 + s.circularityRate*.20);
  region.report ||= {}; region.report.circularEconomy = circularEconomySummary(region);
  return s;
}

export function circularEconomySummary(region) {
  const s=ensureCircularEconomy(region); return { workers:0, policy:{...s.policy}, capability:{...s.capability}, circularityRate:s.circularityRate, virginDependence:s.virginDependence, materialSecurity:s.materialSecurity, durableControlMargin:s.durableControlMargin, materials:Object.fromEntries(Object.entries(s.materials).map(([k,v])=>[k,{...v,inUse:s.inUse[k],scrap:s.scrap[k],cumulativeRecovered:s.recovered[k],cumulativeLosses:s.losses[k]}])) };
}
