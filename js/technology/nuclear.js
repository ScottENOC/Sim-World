import { nuclearIndustrialReadiness, NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, REACTOR_ENGINEERING_TECH_ID, NUCLEAR_POWER_TECH_ID, SPENT_FUEL_MANAGEMENT_TECH_ID } from '../economy/nuclearPower.js?v=20260920-nuclear1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function contacts(region, byId, techId) {
  const ids = new Set([...(region.neighbors || []), ...(region.tradePartnerIds || [])]);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  let n = 0;
  for (const id of ids) if (byId.get(id)?.unlockedTechIds?.has?.(techId)) n++;
  return n;
}
function diffusion(region, byId, techId, base) { return 1 - Math.pow(1 - base, contacts(region, byId, techId)); }

export function nuclearBreakthroughChances(region, byId) {
  const tech = region.unlockedTechIds || new Set();
  const readiness = nuclearIndustrialReadiness(region);
  const literacy = clamp(region.massEducation?.literacy || region.education?.literacy || 0);
  const machining = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const chemistry = clamp(region.industrialSupply?.capability?.industrial_chemistry || region.structuralTransformation?.capability?.chemicals || 0);
  const records = clamp(region.governance?.administration?.recordKeeping || region.administration?.recordKeeping || region.governance?.administrativeControl || 0);
  const advancedIndustry = tech.has('advanced_factories') && tech.has('electrical_generation');
  const electrifiedIndustry = advancedIndustry && tech.has('industrial_electrification');

  const physics = tech.has(NUCLEAR_PHYSICS_TECH_ID) || !advancedIndustry || literacy < 0.42 ? 0 :
    readiness * literacy * (0.40 + machining * 0.35 + records * 0.25) * 0.0000035 +
    diffusion(region, byId, NUCLEAR_PHYSICS_TECH_ID, 0.000060) * (0.30 + readiness * 0.70);

  const fuelCycle = tech.has(URANIUM_FUEL_CYCLE_TECH_ID) || !tech.has(NUCLEAR_PHYSICS_TECH_ID) || !electrifiedIndustry ? 0 :
    readiness * (0.30 + chemistry * 0.45 + machining * 0.25) * 0.0000028 +
    diffusion(region, byId, URANIUM_FUEL_CYCLE_TECH_ID, 0.000045) * (0.25 + readiness * 0.75);

  const reactorEngineering = tech.has(REACTOR_ENGINEERING_TECH_ID) || !tech.has(NUCLEAR_PHYSICS_TECH_ID) || !electrifiedIndustry ? 0 :
    readiness * (0.38 + machining * 0.34 + records * 0.28) * 0.0000025 +
    diffusion(region, byId, REACTOR_ENGINEERING_TECH_ID, 0.000040) * (0.20 + readiness * 0.80);

  const nuclearPower = tech.has(NUCLEAR_POWER_TECH_ID) || !tech.has(URANIUM_FUEL_CYCLE_TECH_ID) || !tech.has(REACTOR_ENGINEERING_TECH_ID) || !tech.has('local_electric_distribution') ? 0 :
    readiness * readiness * (0.55 + records * 0.45) * 0.0000022 +
    diffusion(region, byId, NUCLEAR_POWER_TECH_ID, 0.000032) * (0.20 + readiness * 0.80);

  const spent = Math.max(0, Number(region.stockpile?.spent_nuclear_fuel) || 0);
  const wasteExperience = clamp(Math.log1p(spent) / Math.log(41));
  const spentFuelManagement = tech.has(SPENT_FUEL_MANAGEMENT_TECH_ID) || !tech.has(NUCLEAR_POWER_TECH_ID) ? 0 :
    (0.20 + wasteExperience * 0.80) * (0.45 + readiness * 0.55) * 0.000004 +
    diffusion(region, byId, SPENT_FUEL_MANAGEMENT_TECH_ID, 0.000055) * (0.30 + readiness * 0.70);

  return {
    physics: clamp(physics), fuelCycle: clamp(fuelCycle), reactorEngineering: clamp(reactorEngineering),
    nuclearPower: clamp(nuclearPower), spentFuelManagement: clamp(spentFuelManagement),
  };
}

export function tickNuclearBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const byId = new Map((regions || []).map((r) => [r.id, r]));
  const scale = Math.max(0, Number(elapsedDays) || 0) / 7;
  const events = [];
  const attempts = [
    ['physics', NUCLEAR_PHYSICS_TECH_ID, 'nuclear_physics_breakthrough', 'Nuclear physics', 'Scientists have developed a practical understanding of atomic nuclei and controlled neutron interactions.'],
    ['fuelCycle', URANIUM_FUEL_CYCLE_TECH_ID, 'uranium_fuel_cycle_breakthrough', 'Uranium fuel cycle', 'Industry can now mine, concentrate and fabricate uranium into controlled reactor fuel.'],
    ['reactorEngineering', REACTOR_ENGINEERING_TECH_ID, 'reactor_engineering_breakthrough', 'Reactor engineering', 'Engineers can design controlled chain-reaction systems with cooling, shielding and reliable control mechanisms.'],
    ['nuclearPower', NUCLEAR_POWER_TECH_ID, 'nuclear_power_breakthrough', 'Civilian nuclear power', 'Large controlled reactors can now be integrated with the electrical grid as civilian generating stations.'],
    ['spentFuelManagement', SPENT_FUEL_MANAGEMENT_TECH_ID, 'spent_fuel_management_breakthrough', 'Spent-fuel management', 'Engineers have developed dedicated systems for storing and handling highly radioactive spent reactor fuel.'],
  ];
  for (const region of regions || []) {
    region.unlockedTechIds ||= new Set();
    const chances = nuclearBreakthroughChances(region, byId);
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

export { NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, REACTOR_ENGINEERING_TECH_ID, NUCLEAR_POWER_TECH_ID, SPENT_FUEL_MANAGEMENT_TECH_ID };
