const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const STATE_PATHS = Object.freeze({
  BUREAUCRATIC: 'bureaucratic_officialdom',
  EXAMINATION: 'examination_bureaucracy',
  LANDED_MILITARY: 'landed_military_elites',
  COMMERCIAL_CIVIC: 'commercial_civic_state',
  MILITARY_HOUSEHOLD: 'military_household_state',
});

function ensureSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }

export function ensureStateDevelopment(polity) {
  polity.stateDevelopment ||= {};
  const s = polity.stateDevelopment;
  s.experience ||= {};
  s.strength ||= {};
  for (const id of Object.values(STATE_PATHS)) {
    if (!Number.isFinite(s.experience[id])) s.experience[id] = 0;
    if (!Number.isFinite(s.strength[id])) s.strength[id] = 0;
  }
  s.institutions = ensureSet(s.institutions);
  s.succession ||= {};
  const succession = s.succession;
  if (!Number.isFinite(succession.rulerTenureYears)) succession.rulerTenureYears = 0;
  if (!Number.isFinite(succession.rulerGeneration)) succession.rulerGeneration = 1;
  if (!Number.isFinite(succession.lastSuccessionTick)) succession.lastSuccessionTick = 0;
  if (!Number.isFinite(succession.security)) succession.security = 0.55;
  succession.crisis ||= null;
  return s;
}

function polityRegions(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

function commerce(region) {
  const trade = Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0) + Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0);
  const urban = Math.max(0, Number(region.urbanisation?.urbanPopulation) || 0);
  return clamp(Math.log1p(trade) / 10 + Math.log1p(urban) / 30);
}

function regionalElitePower(region) {
  const medieval = region.medievalPolitics || region.medievalInstitutions || {};
  return clamp((Number(medieval.eliteOrganisation) || 0) * 0.5 + (Number(medieval.localDefence) || 0) * 0.25 + (Number(medieval.localFiscalCapacity) || 0) * 0.25);
}

function professionalMilitary(region) {
  const army = Math.max(0, Number(region.army?.personnel) || 0);
  const pop = Math.max(1, Number(region.population) || 1);
  const permanence = Number(region.policies?.armyPermanence ?? region.militaryPolicy?.armyPermanence ?? 0);
  return clamp(army / Math.max(400, pop * 0.025) * 0.6 + permanence * 0.4);
}

function pathTargets(polity, capital, territories) {
  const admin = polity.administration || {};
  const avgElite = territories.reduce((sum, region) => sum + regionalElitePower(region), 0) / Math.max(1, territories.length);
  const avgCommerce = territories.reduce((sum, region) => sum + commerce(region), 0) / Math.max(1, territories.length);
  const avgMilitary = territories.reduce((sum, region) => sum + professionalMilitary(region), 0) / Math.max(1, territories.length);
  const literacy = clamp(Number(capital?.education?.literacy) || Number(capital?.knowledge?.literacy) || admin.recordKeeping || 0);
  const merit = clamp(Number(polity.governancePreferences?.meritAppointment) || Number(polity.administration?.meritSelection) || 0);
  return {
    [STATE_PATHS.BUREAUCRATIC]: clamp((admin.officialdom || 0) * 0.38 + (admin.recordKeeping || 0) * 0.22 + (admin.communications || 0) * 0.22 + (1 - avgElite) * 0.18),
    [STATE_PATHS.EXAMINATION]: clamp(literacy * 0.25 + (admin.officialdom || 0) * 0.3 + (admin.recordKeeping || 0) * 0.2 + merit * 0.25),
    [STATE_PATHS.LANDED_MILITARY]: clamp(avgElite * 0.48 + territories.reduce((sum, region) => sum + clamp(region.governance?.autonomy || 0), 0) / Math.max(1, territories.length) * 0.24 + avgMilitary * 0.28),
    [STATE_PATHS.COMMERCIAL_CIVIC]: clamp(avgCommerce * 0.52 + (admin.accounting || 0) * 0.24 + (admin.communications || 0) * 0.24),
    [STATE_PATHS.MILITARY_HOUSEHOLD]: clamp(avgMilitary * 0.46 + (admin.officialdom || 0) * 0.18 + (admin.legitimacy || 0) * 0.12 + (1 - avgElite) * 0.24),
  };
}

export function stateDevelopmentProfile(polity) {
  const s = ensureStateDevelopment(polity);
  const ranked = Object.entries(s.strength).sort((a, b) => b[1] - a[1]);
  const strongest = ranked[0] || [STATE_PATHS.BUREAUCRATIC, 0];
  const bureaucratic = Math.max(s.strength[STATE_PATHS.BUREAUCRATIC], s.strength[STATE_PATHS.EXAMINATION]);
  const decentralised = s.strength[STATE_PATHS.LANDED_MILITARY];
  return {
    primaryPath: strongest[0], primaryStrength: strongest[1], bureaucratic,
    decentralised, civic: s.strength[STATE_PATHS.COMMERCIAL_CIVIC], militaryHousehold: s.strength[STATE_PATHS.MILITARY_HOUSEHOLD],
    centralisation: clamp(bureaucratic * 0.58 + s.strength[STATE_PATHS.MILITARY_HOUSEHOLD] * 0.24 + s.strength[STATE_PATHS.COMMERCIAL_CIVIC] * 0.18 - decentralised * 0.25),
  };
}

function updateStatePaths(polity, regions, elapsedYears) {
  const s = ensureStateDevelopment(polity);
  const territories = polityRegions(polity, regions);
  const capital = regions.find((region) => region.id === polity.capitalRegionId) || territories[0];
  if (!capital || !territories.length) return;
  const targets = pathTargets(polity, capital, territories);
  for (const [id, target] of Object.entries(targets)) {
    s.experience[id] += target * elapsedYears * 10;
    const learned = clamp(1 - Math.exp(-s.experience[id] / 35));
    s.strength[id] += (learned * target - s.strength[id]) * clamp(elapsedYears * 0.25);
  }
  const profile = stateDevelopmentProfile(polity);
  // Multiple routes can support capable government. Bureaucracy is not gated behind landed aristocracy.
  if (profile.bureaucratic > 0.48) s.institutions.add('professional_civil_service');
  if (s.strength[STATE_PATHS.EXAMINATION] > 0.52) s.institutions.add('competitive_official_selection');
  if (profile.civic > 0.5) s.institutions.add('chartered_urban_government');
  if (s.strength[STATE_PATHS.LANDED_MILITARY] > 0.5) s.institutions.add('revenue_land_grants');
  if (profile.militaryHousehold > 0.5) s.institutions.add('salaried_military_households');

  const admin = polity.administration || {};
  const adminBoost = Math.max(profile.bureaucratic, profile.civic * 0.72, profile.militaryHousehold * 0.62);
  admin.officialdom = clamp((admin.officialdom || 0) + adminBoost * elapsedYears * 0.0025);
  admin.communications = clamp((admin.communications || 0) + Math.max(profile.bureaucratic, profile.civic) * elapsedYears * 0.0018);

  for (const region of territories) {
    if (region.id === polity.capitalRegionId || region.governance?.relationship === 'core') continue;
    if (profile.centralisation > 0.45) {
      region.governance.administrativeControl = clamp((region.governance.administrativeControl || 0) + profile.centralisation * elapsedYears * 0.015);
      region.governance.autonomy = clamp((region.governance.autonomy || 0) - profile.centralisation * elapsedYears * 0.006, 0, 0.98);
    }
    if (profile.decentralised > 0.45) {
      region.medievalPolitics ||= {};
      region.medievalPolitics.eliteOrganisation = clamp((region.medievalPolitics.eliteOrganisation || 0) + profile.decentralised * elapsedYears * 0.008);
    }
  }
}

function successionHazard(succession) {
  const tenure = succession.rulerTenureYears;
  if (tenure < 12) return 0.003;
  return clamp(0.012 + Math.max(0, tenure - 20) * 0.0022, 0, 0.11);
}

function chanceForYears(annual, years) { return 1 - Math.pow(1 - clamp(annual), Math.max(0, years)); }

function successionSecurity(polity, regions) {
  const s = ensureStateDevelopment(polity);
  const profile = stateDevelopmentProfile(polity);
  const territories = polityRegions(polity, regions);
  const avgElite = territories.reduce((sum, region) => sum + regionalElitePower(region), 0) / Math.max(1, territories.length);
  const legitimacy = clamp(polity.administration?.legitimacy || 0);
  const institutional = clamp(profile.bureaucratic * 0.32 + profile.militaryHousehold * 0.15 + profile.civic * 0.15);
  const hereditaryOrder = clamp(profile.decentralised * 0.12 + (s.institutions.has('formal_succession_law') ? 0.2 : 0));
  return clamp(0.24 + legitimacy * 0.34 + institutional + hereditaryOrder - avgElite * 0.18 - Math.max(0, territories.length - 3) * 0.012);
}

function claimantCandidates(polity, regions) {
  const territories = polityRegions(polity, regions);
  const capital = territories.find((region) => region.id === polity.capitalRegionId) || territories[0];
  const profile = stateDevelopmentProfile(polity);
  const candidates = [{
    id: `${polity.id}:successor`, kind: 'designated_successor', anchorRegionId: capital?.id,
    claim: clamp(0.48 + (polity.administration?.legitimacy || 0) * 0.3 + profile.bureaucratic * 0.16),
  }];
  const provincial = territories.filter((region) => region.id !== capital?.id)
    .map((region) => ({ region, power: regionalElitePower(region) + clamp(region.governance?.autonomy || 0) * 0.3 }))
    .sort((a, b) => b.power - a.power);
  if (provincial[0]?.power > 0.34) candidates.push({
    id: `${polity.id}:provincial:${provincial[0].region.id}`, kind: 'provincial_claimant', anchorRegionId: provincial[0].region.id,
    claim: clamp(0.28 + provincial[0].power * 0.48 + profile.decentralised * 0.15),
  });
  if (profile.militaryHousehold > 0.36 || territories.some((r) => professionalMilitary(r) > 0.5)) {
    const anchor = territories.slice().sort((a, b) => professionalMilitary(b) - professionalMilitary(a))[0];
    if (anchor && anchor.id !== capital?.id) candidates.push({
      id: `${polity.id}:military:${anchor.id}`, kind: 'military_claimant', anchorRegionId: anchor.id,
      claim: clamp(0.3 + professionalMilitary(anchor) * 0.4 + profile.militaryHousehold * 0.2),
    });
  }
  return candidates.sort((a, b) => b.claim - a.claim);
}

function supportScore(region, candidate, polity, regions) {
  const isAnchor = region.id === candidate.anchorRegionId ? 0.45 : 0;
  const local = regionalElitePower(region) * (candidate.kind === 'provincial_claimant' ? 0.34 : candidate.kind === 'military_claimant' ? 0.2 : -0.08);
  const capitalLoyalty = region.id === polity.capitalRegionId && candidate.kind === 'designated_successor' ? 0.4 : 0;
  const admin = clamp(region.governance?.administrativeControl || 0);
  const successorAdmin = candidate.kind === 'designated_successor' ? admin * 0.24 : (1 - admin) * 0.16;
  return candidate.claim + isAnchor + local + capitalLoyalty + successorAdmin;
}

function startSuccessionCrisis(polity, regions, currentTick) {
  const s = ensureStateDevelopment(polity);
  const succession = s.succession;
  const candidates = claimantCandidates(polity, regions);
  const security = successionSecurity(polity, regions);
  succession.security = security;
  succession.rulerGeneration += 1;
  succession.rulerTenureYears = 0;
  succession.lastSuccessionTick = currentTick;
  if (candidates.length < 2 || security >= 0.68 || candidates[0].claim - candidates[1].claim > 0.3) {
    succession.crisis = null;
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.01 - (1 - security) * 0.025);
    return { type: 'orderly_succession', polityId: polity.id, claimant: candidates[0], security };
  }
  const factions = candidates.slice(0, 3).map((candidate) => ({ ...candidate, regionIds: [], polityId: null }));
  const territories = polityRegions(polity, regions);
  for (const region of territories) {
    const chosen = factions.slice().sort((a, b) => supportScore(region, b, polity, regions) - supportScore(region, a, polity, regions))[0];
    chosen.regionIds.push(region.id);
  }
  // The designated successor retains the existing polity. Challengers revive their anchor region's local polity where possible.
  for (const faction of factions) {
    if (faction.kind === 'designated_successor') { faction.polityId = polity.id; continue; }
    const anchor = regions.find((region) => region.id === faction.anchorRegionId);
    const challengerId = anchor?.governance?.localPolityId || anchor?.polityId;
    if (!challengerId || challengerId === polity.id) continue;
    faction.polityId = challengerId;
    const challenger = arguments[4]?.find?.((p) => p.id === challengerId);
    if (challenger) {
      challenger.subjectToPolityId = null;
      challenger.capitalRegionId = anchor.id;
      challenger.rulerRegionId = anchor.id;
      challenger.claimantForPolityId = polity.id;
      challenger.administration ||= { legitimacy: 0.2 };
      challenger.administration.legitimacy = clamp(Math.max(challenger.administration.legitimacy || 0, faction.claim * 0.7));
    }
  }
  succession.crisis = { startedTick: currentTick, originalPolityId: polity.id, factions, active: true };
  return { type: 'succession_crisis', polityId: polity.id, factions, security };
}

function applyCrisisTerritories(polity, polities, regions) {
  const crisis = ensureStateDevelopment(polity).succession.crisis;
  if (!crisis?.active) return;
  for (const faction of crisis.factions) {
    if (!faction.polityId || faction.polityId === polity.id) continue;
    for (const regionId of faction.regionIds) {
      const region = regions.find((item) => item.id === regionId);
      if (!region || region.id === polity.capitalRegionId) continue;
      region.governance.sovereignPolityId = faction.polityId;
      region.governance.relationship = region.governance.localPolityId === faction.polityId ? 'core' : 'delegated';
      region.governance.administrativeControl = Math.min(region.governance.administrativeControl || 0.4, 0.55);
    }
  }
}

export function tickStateDevelopment(polities, regions, currentTick, elapsedDays = 30, rng = Math.random) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const events = [];
  for (const polity of polities) {
    const territories = polityRegions(polity, regions);
    if (!territories.length || polity.subjectToPolityId) continue;
    updateStatePaths(polity, regions, years);
    const succession = ensureStateDevelopment(polity).succession;
    if (succession.crisis?.active) continue;
    succession.rulerTenureYears += years;
    succession.security = successionSecurity(polity, regions);
    if (rng() < chanceForYears(successionHazard(succession), years)) {
      const event = startSuccessionCrisis(polity, regions, currentTick, polities);
      events.push(event);
      if (event.type === 'succession_crisis') applyCrisisTerritories(polity, polities, regions);
    }
  }
  return events;
}
