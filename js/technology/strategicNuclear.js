import { nuclearIndustrialReadiness, NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, SPENT_FUEL_MANAGEMENT_TECH_ID } from '../economy/nuclearPower.js?v=20260920-nuclear1';
import { ISOTOPE_SEPARATION_TECH_ID, SPENT_FUEL_REPROCESSING_TECH_ID } from '../economy/strategicNuclear.js?v=20260920-strategic-nuclear1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function contacts(region, byId, techId) {
  const ids = new Set([...(region.neighbors || []), ...(region.tradePartnerIds || [])]);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  let n = 0;
  for (const id of ids) if (byId.get(id)?.unlockedTechIds?.has?.(techId)) n++;
  return n;
}
function diffusion(region, byId, techId, base) { return 1 - Math.pow(1 - base, contacts(region, byId, techId)); }

export function strategicNuclearBreakthroughChances(region, byId) {
  const tech = region.unlockedTechIds || new Set();
  const readiness = nuclearIndustrialReadiness(region);
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const chemistry = clamp(region.industrialSupply?.capability?.industrial_chemistry || region.structuralTransformation?.capability?.chemicals || 0);
  const electricity = clamp(region.electricity?.industrialService || region.electricity?.industrialCoverage || 0);
  const records = clamp(region.governance?.administration?.recordKeeping || region.administration?.recordKeeping || region.governance?.administrativeControl || 0);

  const isotopeSeparation = tech.has(ISOTOPE_SEPARATION_TECH_ID) || !tech.has(NUCLEAR_PHYSICS_TECH_ID) ||
    !tech.has(URANIUM_FUEL_CYCLE_TECH_ID) || !tech.has('industrial_electrification') ? 0 :
    readiness * (0.34 + machining * 0.31 + electricity * 0.25 + records * 0.10) * 0.0000018 +
    diffusion(region, byId, ISOTOPE_SEPARATION_TECH_ID, 0.000018) * (0.18 + readiness * 0.82);

  const reprocessing = tech.has(SPENT_FUEL_REPROCESSING_TECH_ID) || !tech.has(SPENT_FUEL_MANAGEMENT_TECH_ID) ||
    !tech.has(URANIUM_FUEL_CYCLE_TECH_ID) ? 0 :
    readiness * (0.28 + chemistry * 0.42 + records * 0.18 + machining * 0.12) * 0.0000016 +
    diffusion(region, byId, SPENT_FUEL_REPROCESSING_TECH_ID, 0.000015) * (0.18 + readiness * 0.82);

  return { isotopeSeparation: clamp(isotopeSeparation), reprocessing: clamp(reprocessing) };
}

export function tickStrategicNuclearBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const byId = new Map((regions || []).map((r) => [r.id, r]));
  const scale = Math.max(0, Number(elapsedDays) || 0) / 7;
  const events = [];
  const attempts = [
    ['isotopeSeparation', ISOTOPE_SEPARATION_TECH_ID, 'isotope_separation_breakthrough', 'Industrial isotope separation',
      'Engineers can now separate uranium isotopes at industrial scale. This has civilian fuel uses but also creates strategic proliferation significance.'],
    ['reprocessing', SPENT_FUEL_REPROCESSING_TECH_ID, 'spent_fuel_reprocessing_breakthrough', 'Spent-fuel reprocessing',
      'Nuclear engineers can chemically recover useful reactor material from spent fuel, creating both fuel-cycle benefits and strategic material-handling capability.'],
  ];
  for (const region of regions || []) {
    region.unlockedTechIds ||= new Set();
    const chances = strategicNuclearBreakthroughChances(region, byId);
    for (const [key, id, type, title, message] of attempts) {
      if (region.unlockedTechIds.has(id)) continue;
      const chance = 1 - Math.pow(1 - (chances[key] || 0), scale);
      if ((rng?.() ?? Math.random()) >= chance) continue;
      region.unlockedTechIds.add(id);
      events.push({ type, regionId: region.id, regionName: region.name, tick: currentTick, title: `${title} developed`, message: `${region.name}: ${message}` });
      break;
    }
  }
  return events;
}

export { ISOTOPE_SEPARATION_TECH_ID, SPENT_FUEL_REPROCESSING_TECH_ID };
