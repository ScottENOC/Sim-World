import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function hasTech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function formationCoverage(region, id) {
  return (region.militaryFormations?.traditions || []).filter((f) => f.status === 'active' && f.archetypeId === id)
    .reduce((sum, f) => sum + (Number(f.coverage) || 0) * (0.5 + (Number(f.readiness) || 0) * 0.5), 0);
}

export function ensureMedievalDoctrine(region) {
  region.medievalDoctrine ||= {};
  const d = region.medievalDoctrine;
  d.shares ||= {};
  for (const id of ['spear_pike','archery','crossbow','heavy_cavalry','horse_archer','professional_infantry','firearm_infantry']) {
    if (!Number.isFinite(d.shares[id])) d.shares[id] = 0;
  }
  d.experience ||= {};
  for (const id of Object.keys(d.shares)) if (!Number.isFinite(d.experience[id])) d.experience[id] = 0;
  d.strongpoints ||= { castleNetwork: 0, fortifiedTownNetwork: 0, supplyStorage: 0, bypassCost: 0 };
  return d;
}

function horseAvailability(region) {
  const war = Math.max(0, Number(region.horseEconomy?.war) || 0);
  const army = Math.max(1, Number(region.army?.personnel) || 1);
  return clamp(war / Math.max(25, army * 0.15));
}

function metalAvailability(region) {
  const metal = Math.max(0, Number(region.stockpile?.iron) || 0) + Math.max(0, Number(region.stockpile?.steel) || 0) + Math.max(0, Number(region.stockpile?.bronze) || 0);
  const army = Math.max(1, Number(region.army?.personnel) || 1);
  return clamp(metal / Math.max(12, army * 0.018));
}

function doctrineTargets(region) {
  const formations = region.militaryFormations || {};
  const horses = horseAvailability(region);
  const metal = metalAvailability(region);
  const permanence = clamp(region.policies?.armyPermanence ?? region.militaryPolicy?.armyPermanence ?? 0);
  return {
    spear_pike: clamp(0.18 + metal * 0.24 + permanence * 0.12 + (hasTech(region, 'military_drill') ? 0.18 : 0) + (hasTech(region, 'iron_smelting') ? 0.12 : 0)),
    archery: clamp(0.12 + (region.stockpile?.wood || 0) / 300 * 0.12 + (hasTech(region, 'bowmaking') ? 0.28 : 0)),
    crossbow: clamp(formationCoverage(region, 'crossbow_companies') * 1.8 + (hasTech(region, 'crossbows') ? 0.22 : 0)),
    heavy_cavalry: clamp(formationCoverage(region, 'knightly_retinues') * 2 + horses * 0.28 + (hasTech(region, 'heavy_cavalry') ? 0.18 : 0)),
    horse_archer: clamp(horses * 0.28 + (hasTech(region, 'mounted_cavalry') ? 0.12 : 0) + (hasTech(region, 'composite_bow') ? 0.22 : 0)),
    professional_infantry: clamp(formationCoverage(region, 'professional_cohorts') * 1.6 + permanence * 0.32 + (hasTech(region, 'military_drill') ? 0.16 : 0)),
    firearm_infantry: clamp(Number(region.firearmAdoption?.share || region.firearms?.adoptionShare || 0) + (hasTech(region, 'firearms') ? 0.18 : 0)),
  };
}

export function tickMedievalDoctrine(region, elapsedDays = 30) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const d = ensureMedievalDoctrine(region);
  const targets = doctrineTargets(region);
  for (const [id, target] of Object.entries(targets)) {
    d.experience[id] += target * years * 7;
    const learned = clamp(1 - Math.exp(-d.experience[id] / 22));
    const desired = target * (0.55 + learned * 0.45);
    d.shares[id] += (desired - d.shares[id]) * clamp(years * 0.4);
  }
  const forts = effectiveInfrastructureCount(region, 'hill_fort') + effectiveInfrastructureCount(region, 'settlement_walls') * 1.5;
  const localFort = region.medievalPolitics?.fortification || 0;
  const urban = clamp(Math.log1p(region.urbanisation?.urbanPopulation || 0) / 12);
  d.strongpoints.castleNetwork += (clamp(forts / 5 + localFort * 0.5) - d.strongpoints.castleNetwork) * clamp(years * 0.18);
  d.strongpoints.fortifiedTownNetwork += (clamp(effectiveInfrastructureCount(region, 'settlement_walls') / 3 + urban * 0.35) - d.strongpoints.fortifiedTownNetwork) * clamp(years * 0.18);
  const storage = effectiveInfrastructureCount(region, 'public_granary') + effectiveInfrastructureCount(region, 'storage_pit');
  d.strongpoints.supplyStorage += (clamp(storage / 5 + d.strongpoints.castleNetwork * 0.2) - d.strongpoints.supplyStorage) * clamp(years * 0.15);
  d.strongpoints.bypassCost = clamp(d.strongpoints.castleNetwork * 0.42 + d.strongpoints.fortifiedTownNetwork * 0.38 + d.strongpoints.supplyStorage * 0.2);
  return d;
}

export function doctrineCombatMultiplier(region, opponent, terrain = 'plains') {
  const own = ensureMedievalDoctrine(region).shares;
  const enemy = ensureMedievalDoctrine(opponent).shares;
  let bonus = 0;
  // Interaction effects, not universal era bonuses.
  bonus += own.spear_pike * enemy.heavy_cavalry * 0.28;
  bonus += own.crossbow * (enemy.heavy_cavalry + enemy.professional_infantry * 0.5) * 0.18;
  bonus += own.heavy_cavalry * Math.max(0, 0.7 - enemy.spear_pike) * 0.22;
  bonus += own.horse_archer * Math.max(0, 0.75 - enemy.horse_archer) * (terrain === 'plains' ? 0.2 : 0.06);
  bonus += own.firearm_infantry * (enemy.heavy_cavalry + enemy.professional_infantry) * 0.16;
  bonus += own.professional_infantry * 0.08;
  if (terrain === 'mountains' || terrain === 'forest') bonus -= own.heavy_cavalry * 0.09;
  if (terrain === 'plains') bonus += own.heavy_cavalry * 0.05 + own.horse_archer * 0.06;
  return clamp(1 + bonus, 0.82, 1.42);
}

export function strongpointDefenceMultiplier(region) {
  const s = ensureMedievalDoctrine(region).strongpoints;
  return 1 + s.castleNetwork * 0.28 + s.fortifiedTownNetwork * 0.22;
}

export function strongpointBypassPenalty(region) {
  return ensureMedievalDoctrine(region).strongpoints.bypassCost;
}
