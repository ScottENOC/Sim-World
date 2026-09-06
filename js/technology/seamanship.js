// Maritime knowledge is a family of related practical skills. Fishing,
// merchant sailing, exploration and naval combat each improve fastest through
// doing that activity, while transferable skills such as navigation, weather
// reading, sail handling, coastal piloting and crew discipline spill over.

export const MARITIME_SKILLS = Object.freeze({
  FISHING: 'maritimeFishing',
  TRADE: 'maritimeTrade',
  SCOUTING: 'maritimeScouting',
  COMBAT: 'maritimeCombat',
});

const SKILL_KEYS = Object.values(MARITIME_SKILLS);
const CEILING = 0.45;
const EXPERIENCE_SCALE = 220_000; // ~63% of ceiling at this much effective practice
const SPILLOVER = 0.22; // 22% of practice transfers into each sibling skill

const ACTIVITY_WEIGHT = Object.freeze({
  [MARITIME_SKILLS.FISHING]: 1.0,
  [MARITIME_SKILLS.TRADE]: 1.4,
  [MARITIME_SKILLS.SCOUTING]: 1.8,
  [MARITIME_SKILLS.COMBAT]: 2.2,
});

function ensureExperience(region) {
  if (!region.experience) region.experience = {};
}

export function recordMaritimePractice(region, primarySkill, workerEquivalent) {
  if (!SKILL_KEYS.includes(primarySkill)) return;
  const amount = Math.max(0, Number(workerEquivalent) || 0) * (ACTIVITY_WEIGHT[primarySkill] || 1);
  if (amount <= 0) return;
  ensureExperience(region);
  for (const skill of SKILL_KEYS) {
    region.experience[skill] = (region.experience[skill] || 0) + amount * (skill === primarySkill ? 1 : SPILLOVER);
  }
}

export function maritimeSkillMultiplier(region, skill) {
  if (!SKILL_KEYS.includes(skill)) return 1;
  const experience = Math.max(0, Number(region.experience?.[skill]) || 0);
  return 1 + CEILING * (1 - Math.exp(-experience / EXPERIENCE_SCALE));
}

export function maritimeSkillLevel(region, skill) {
  return (maritimeSkillMultiplier(region, skill) - 1) / CEILING;
}

function activeSeaMerchantWorkers(region) {
  const ventures = region.tradeEconomy?.ventures;
  if (!Array.isArray(ventures)) return 0;
  return ventures
    .filter((venture) => venture?.mode === 'sea' && !venture.completed)
    .reduce((sum, venture) => sum + Math.max(0,
      Number(venture.merchants ?? venture.personnel ?? venture.workers ?? 0) || 0), 0);
}

// Called once per simulation tick. It records time actually spent at sea,
// rather than rewarding ownership of boats sitting in harbour.
export function tickMaritimeExperience(regions, activeRaids = [], elapsedDays = 7) {
  const weekScale = Math.max(0, (Number(elapsedDays) || 0) / 7);
  if (weekScale <= 0) return;

  const raidersByOrigin = new Map();
  for (const raid of activeRaids || []) {
    if (!raid?.viaSea || raid.completed) continue;
    raidersByOrigin.set(raid.attackerId,
      (raidersByOrigin.get(raid.attackerId) || 0) + Math.max(0, Number(raid.personnel) || 0));
  }

  for (const region of regions) {
    const boatFishers = Math.max(0, Number(region.occupations?.boatFisher) || 0);
    const seaMerchants = activeSeaMerchantWorkers(region);
    const scouts = region.scouting?.active && region.scouting.mode === 'sea'
      ? Math.max(0, Number(region.scouting.armyCommitted) || 0)
      : 0;
    const navalRaiders = raidersByOrigin.get(region.id) || 0;

    if (boatFishers > 0) recordMaritimePractice(region, MARITIME_SKILLS.FISHING, boatFishers * weekScale);
    if (seaMerchants > 0) recordMaritimePractice(region, MARITIME_SKILLS.TRADE, seaMerchants * weekScale);
    if (scouts > 0) recordMaritimePractice(region, MARITIME_SKILLS.SCOUTING, scouts * weekScale);
    if (navalRaiders > 0) recordMaritimePractice(region, MARITIME_SKILLS.COMBAT, navalRaiders * weekScale);
  }
}
