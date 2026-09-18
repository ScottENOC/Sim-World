const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const VETERAN_SUPPORT_POLICIES = Object.freeze({
  none: { id: 'none', label: 'No dedicated veteran support', annualCostPerVeteran: 0, reintegrationHelp: 0 },
  relief: { id: 'relief', label: 'Temporary demobilisation relief', annualCostPerVeteran: 0.002, reintegrationHelp: 0.24 },
  pension: { id: 'pension', label: 'Veteran pensions and reintegration support', annualCostPerVeteran: 0.005, reintegrationHelp: 0.46 },
});

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || null;
}

function smooth(current, target, elapsedDays, annualRate = 1) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const weight = 1 - Math.exp(-annualRate * years);
  return clamp((Number(current) || 0) + (target - (Number(current) || 0)) * weight);
}

function underArms(region) {
  return Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.navy?.personnel) || 0);
}

function conflictPressure(region) {
  return clamp(region.report?.conflict?.pressure ?? region.conflictPressure ?? 0);
}

function housingStress(region) {
  const pop = Math.max(1, Number(region.population) || 1);
  const slum = clamp(region.urbanHousing?.slumPressure ?? region.report?.urbanHousing?.slumPressure ?? 0);
  const capacity = Number(region.housing?.capacity);
  const shortage = Number.isFinite(capacity) ? clamp((pop - capacity) / pop * 5) : 0;
  return Math.max(slum, shortage);
}

function unemployment(region) {
  return clamp(region.employment?.unemploymentRate ?? 0);
}

function hardship(region) {
  return clamp(region.employment?.hardship ?? region.popularWellbeing?.grievance ?? 0);
}

export function ensurePostWarSociety(polity) {
  polity.postWarSociety ||= {};
  const state = polity.postWarSociety;
  state.version = 1;
  state.policy ||= {};
  if (!VETERAN_SUPPORT_POLICIES[state.policy.veteranSupport]) state.policy.veteranSupport = 'none';
  if (typeof state.policy.playerLocked !== 'boolean') state.policy.playerLocked = false;
  state.regionMilitary ||= {};
  for (const [key, value] of Object.entries({
    veteranPopulation: 0,
    reintegrationQueue: 0,
    returnedThisTick: 0,
    reintegratedThisTick: 0,
    reintegrationStress: 0,
    politicalPressure: 0,
    mobilisationMemory: 0,
    supportCoverage: 0,
    fiscalCost: 0,
    cumulativeSupportCost: 0,
  })) if (!Number.isFinite(state[key])) state[key] = value;
  return state;
}

export function setVeteranSupportPolicy(polity, policy, options = {}) {
  if (!VETERAN_SUPPORT_POLICIES[policy]) return { changed: false, reason: 'unknown_policy' };
  const state = ensurePostWarSociety(polity);
  const previous = state.policy.veteranSupport;
  state.policy.veteranSupport = policy;
  if (options.playerIssued) state.policy.playerLocked = true;
  return { changed: previous !== policy, previous, policy };
}

function territorySignals(territories) {
  let pop = 0;
  let unemploymentWeighted = 0;
  let housingWeighted = 0;
  let hardshipWeighted = 0;
  let conflictWeighted = 0;
  for (const region of territories) {
    const weight = Math.max(1, Number(region.population) || 1);
    pop += weight;
    unemploymentWeighted += unemployment(region) * weight;
    housingWeighted += housingStress(region) * weight;
    hardshipWeighted += hardship(region) * weight;
    conflictWeighted += conflictPressure(region) * weight;
  }
  return {
    population: pop,
    unemployment: pop ? unemploymentWeighted / pop : 0,
    housingStress: pop ? housingWeighted / pop : 0,
    hardship: pop ? hardshipWeighted / pop : 0,
    conflict: pop ? conflictWeighted / pop : 0,
  };
}

function treasuryRegion(polity, territories) {
  return territories.find((region) => region.id === polity.capitalRegionId) || territories[0] || null;
}

function npcVeteranPolicy(polity, state) {
  if (state.policy.playerLocked) return null;
  if (state.reintegrationStress >= 0.50 && state.veteranPopulation >= 500 && state.policy.veteranSupport === 'none') {
    state.policy.veteranSupport = 'relief';
    return { type: 'veteran_support_adopted', polityId: polity.id, policy: 'relief' };
  }
  if (state.reintegrationStress >= 0.62 && state.veteranPopulation >= 2500 && state.policy.veteranSupport === 'relief') {
    state.policy.veteranSupport = 'pension';
    return { type: 'veteran_support_expanded', polityId: polity.id, policy: 'pension' };
  }
  return null;
}

export function tickPostWarSociety(polities, regions, currentTick = 0, elapsedDays = 7, options = {}) {
  const events = [];
  const years = Math.max(0.0001, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  for (const polity of polities || []) {
    const state = ensurePostWarSociety(polity);
    const territories = (regions || []).filter((region) => polityId(region) === polity.id);
    if (!territories.length) continue;
    const signals = territorySignals(territories);
    state.returnedThisTick = 0;
    state.reintegratedThisTick = 0;

    let currentMilitary = 0;
    let previousMilitary = 0;
    for (const region of territories) {
      const current = underArms(region);
      const previous = Number.isFinite(state.regionMilitary[region.id]) ? state.regionMilitary[region.id] : current;
      currentMilitary += current;
      previousMilitary += previous;
      // Only treat shrinking forces as demobilisation once active conflict has
      // subsided. Battlefield losses therefore do not magically become veterans.
      if (current < previous && conflictPressure(region) < 0.25) {
        const returning = previous - current;
        state.returnedThisTick += returning;
        state.veteranPopulation += returning;
        state.reintegrationQueue += returning;
        region.postWarSociety ||= {};
        region.postWarSociety.returningVeterans = (region.postWarSociety.returningVeterans || 0) + returning;
      }
      state.regionMilitary[region.id] = current;
    }

    const workingAge = Math.max(1, territories.reduce((sum, region) => sum + Math.max(0, Number(region.demographics?.workingAge) || 0), 0));
    const mobilisationShare = clamp(currentMilitary / workingAge * 3.5);
    state.mobilisationMemory = smooth(state.mobilisationMemory, Math.max(mobilisationShare, signals.conflict), elapsedDays, (mobilisationShare > state.mobilisationMemory || signals.conflict > 0.25) ? 0.9 : 0.16);

    const support = VETERAN_SUPPORT_POLICIES[state.policy.veteranSupport];
    const treasury = treasuryRegion(polity, territories);
    const eligible = state.policy.veteranSupport === 'relief' ? state.reintegrationQueue : state.veteranPopulation;
    const requestedCost = Math.max(0, eligible) * support.annualCostPerVeteran * years;
    const paid = treasury ? Math.min(Math.max(0, Number(treasury.treasury) || 0), requestedCost) : 0;
    if (treasury) treasury.treasury = Math.max(0, (Number(treasury.treasury) || 0) - paid);
    state.fiscalCost = paid;
    state.cumulativeSupportCost += paid;
    state.supportCoverage = requestedCost > 0 ? clamp(paid / requestedCost) : (support.annualCostPerVeteran > 0 ? 1 : 0);
    const effectiveHelp = support.reintegrationHelp * state.supportCoverage;

    const labourAbsorption = clamp(0.10 + (1 - signals.unemployment) * 0.38 + (1 - signals.housingStress) * 0.20 + effectiveHelp * 0.32);
    const reintegrated = Math.min(state.reintegrationQueue, state.reintegrationQueue * labourAbsorption * Math.min(1, years * 2.5));
    state.reintegrationQueue -= reintegrated;
    state.reintegratedThisTick = reintegrated;

    const queueShare = clamp(state.reintegrationQueue / workingAge * 5);
    const supportGap = 1 - effectiveHelp;
    const stressTarget = clamp(queueShare * 0.38 + signals.unemployment * 0.22 + signals.housingStress * 0.16 + signals.hardship * 0.14 + state.mobilisationMemory * 0.10);
    state.reintegrationStress = smooth(state.reintegrationStress, stressTarget * (0.72 + supportGap * 0.28), elapsedDays, 1.35);
    state.politicalPressure = clamp(state.reintegrationStress * 0.58 + state.mobilisationMemory * 0.24 + queueShare * 0.18 - effectiveHelp * 0.22);

    // Reintegration is a concrete household shock. Feed a modest portion into
    // the existing hardship state rather than inventing a separate happiness
    // economy. As the queue clears, the extra pressure naturally fades.
    for (const region of territories) {
      if (!region.employment || state.reintegrationStress <= 0) continue;
      const localShare = Math.max(1, Number(region.population) || 1) / Math.max(1, signals.population);
      region.employment.hardship = clamp((region.employment.hardship || 0) + state.reintegrationStress * localShare * years * 0.08);
      region.employment.povertyPressure = clamp((region.employment.povertyPressure || 0) + state.reintegrationStress * localShare * years * 0.05);
    }

    if (state.returnedThisTick > 0) {
      events.push({
        type: 'mass_demobilisation', polityId: polity.id, returned: state.returnedThisTick,
        reintegrationQueue: state.reintegrationQueue, stress: state.reintegrationStress,
        playerRelevant: polity.id === options.playerPolityId,
      });
    }
    const policyEvent = npcVeteranPolicy(polity, state);
    if (policyEvent) events.push({ ...policyEvent, playerRelevant: polity.id === options.playerPolityId });
  }
  return events;
}

export function postWarSocietySummary(polity) {
  const state = ensurePostWarSociety(polity);
  return {
    veteranSupport: state.policy.veteranSupport,
    veteranSupportLabel: VETERAN_SUPPORT_POLICIES[state.policy.veteranSupport].label,
    veteranPopulation: state.veteranPopulation,
    reintegrationQueue: state.reintegrationQueue,
    returnedThisTick: state.returnedThisTick,
    reintegratedThisTick: state.reintegratedThisTick,
    reintegrationStress: state.reintegrationStress,
    politicalPressure: state.politicalPressure,
    mobilisationMemory: state.mobilisationMemory,
    supportCoverage: state.supportCoverage,
    fiscalCost: state.fiscalCost,
    cumulativeSupportCost: state.cumulativeSupportCost,
  };
}
