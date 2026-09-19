const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const ELECTRICAL_GENERATION_TECH_ID = 'electrical_generation';
export const LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID = 'local_electric_distribution';
export const INDUSTRIAL_ELECTRIFICATION_TECH_ID = 'industrial_electrification';
export const HYDROELECTRIC_GENERATION_TECH_ID = 'hydroelectric_generation';

function industrialReadiness(region) {
  const c = region.industrialSupply?.capability || {};
  const machining = clamp01(c.precision_machining || 0);
  const steel = clamp01(c.steelmaking || 0);
  const manufacture = clamp01(region.structuralTransformation?.capability?.manufacture || 0);
  return clamp01(machining * 0.46 + steel * 0.24 + manufacture * 0.30);
}

function knowledgeableContacts(region, regionsById, techId) {
  const ids = new Set([...(region.neighbors || []), ...(region.tradePartnerIds || [])]);
  if (region.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) ids.add(id);
  let count = 0;
  for (const id of ids) if (regionsById.get(id)?.unlockedTechIds?.has(techId)) count++;
  return count;
}

function diffusion(region, regionsById, techId, base) {
  const contacts = knowledgeableContacts(region, regionsById, techId);
  return 1 - Math.pow(1 - base, contacts);
}

export function electrificationBreakthroughChances(region, regionsById) {
  const tech = region.unlockedTechIds || new Set();
  const readiness = industrialReadiness(region);
  const admin = region.governance?.administration || region.administration || {};
  const records = clamp01(admin.recordKeeping || 0);
  const generation = tech.has(ELECTRICAL_GENERATION_TECH_ID) ? 0 :
    readiness * readiness * 0.000010 + diffusion(region, regionsById, ELECTRICAL_GENERATION_TECH_ID, 0.00028);
  const distribution = tech.has(LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID) || !tech.has(ELECTRICAL_GENERATION_TECH_ID) ? 0 :
    readiness * (0.45 + records * 0.55) * 0.000009 + diffusion(region, regionsById, LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID, 0.00024);
  const industrialUse = tech.has(INDUSTRIAL_ELECTRIFICATION_TECH_ID) || !tech.has(LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID) ? 0 :
    readiness * readiness * (0.55 + records * 0.45) * 0.000008 + diffusion(region, regionsById, INDUSTRIAL_ELECTRIFICATION_TECH_ID, 0.00025);
  const hydro = tech.has(HYDROELECTRIC_GENERATION_TECH_ID) || !tech.has(ELECTRICAL_GENERATION_TECH_ID) ? 0 :
    readiness * (region.construction?.completed?.reservoir_dam ? 1 : 0.22) * 0.000006 + diffusion(region, regionsById, HYDROELECTRIC_GENERATION_TECH_ID, 0.00018);
  return { generation: clamp01(generation), distribution: clamp01(distribution), industrialUse: clamp01(industrialUse), hydro: clamp01(hydro) };
}

export function tickElectrificationBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const events = [];
  const byId = new Map(regions.map((r) => [r.id, r]));
  const scale = Math.max(0, Number(elapsedDays) || 0) / 7;
  const attempts = [
    ['generation', ELECTRICAL_GENERATION_TECH_ID, 'electrical_generation_breakthrough', 'Electrical generation'],
    ['distribution', LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID, 'electric_distribution_breakthrough', 'Local electric distribution'],
    ['industrialUse', INDUSTRIAL_ELECTRIFICATION_TECH_ID, 'industrial_electrification_breakthrough', 'Industrial electrification'],
    ['hydro', HYDROELECTRIC_GENERATION_TECH_ID, 'hydroelectric_generation_breakthrough', 'Hydroelectric generation'],
  ];
  for (const region of regions) {
    region.unlockedTechIds ||= new Set();
    const chances = electrificationBreakthroughChances(region, byId);
    for (const [key, techId, type, label] of attempts) {
      if (region.unlockedTechIds.has(techId)) continue;
      const chance = 1 - Math.pow(1 - (chances[key] || 0), scale);
      if ((rng?.() ?? Math.random()) >= chance) continue;
      region.unlockedTechIds.add(techId);
      events.push({ type, regionId: region.id, regionName: region.name, tick: currentTick, title: `${label} developed`, message: `${region.name} has developed ${label.toLowerCase()}.` });
      break;
    }
  }
  return events;
}
