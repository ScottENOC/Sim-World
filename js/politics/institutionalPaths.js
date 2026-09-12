const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const STATE_PATHS = Object.freeze({
  BUREAUCRATIC: 'bureaucratic_officialdom',
  EXAMINATION: 'examination_bureaucracy',
  LANDED_MILITARY: 'landed_military_elites',
  COMMERCIAL_CIVIC: 'commercial_civic_state',
  MILITARY_HOUSEHOLD: 'military_household_state',
  CONFEDERATED_MILITARY: 'confederated_military_network',
});

function ensureSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }

export function ensureInstitutionalPaths(polity) {
  polity.institutionalPaths ||= { experience: {}, strength: {}, institutions: new Set() };
  const state = polity.institutionalPaths;
  state.experience ||= {};
  state.strength ||= {};
  state.institutions = ensureSet(state.institutions);
  for (const id of Object.values(STATE_PATHS)) {
    if (!Number.isFinite(state.experience[id])) state.experience[id] = 0;
    if (!Number.isFinite(state.strength[id])) state.strength[id] = 0;
  }
  return state;
}

function polityTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

function localElitePower(region) {
  const p = region.medievalPolitics || {};
  return clamp((p.eliteOrganisation || 0) * 0.5 + (p.localDefence || 0) * 0.25 + (p.localFiscalCapacity || 0) * 0.25);
}

function commerce(region) {
  const flows = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0) + Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const traders = Math.max(0, Number(region.occupations?.trader) || 0);
  return clamp(Math.log1p(flows) / 9 + Math.log1p(traders) / 24);
}

function professionalMilitary(region) {
  const army = Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.army?.away) || 0);
  const population = Math.max(1, Number(region.population) || 1);
  const permanence = clamp(region.militaryPolicy?.armyPermanence ?? region.policies?.armyPermanence ?? 0);
  return clamp(army / Math.max(300, population * 0.025) * 0.55 + permanence * 0.45);
}

function mountedMilitary(region) {
  const horses = Math.max(0, Number(region.horseEconomy?.war) || 0);
  const army = Math.max(1, Number(region.army?.personnel) || 1);
  return clamp(horses / Math.max(30, army * 0.15));
}

function pathTargets(polity, capital, territories) {
  const admin = polity.administration || {};
  const n = Math.max(1, territories.length);
  const avgElite = territories.reduce((sum, region) => sum + localElitePower(region), 0) / n;
  const avgCommerce = territories.reduce((sum, region) => sum + commerce(region), 0) / n;
  const avgMilitary = territories.reduce((sum, region) => sum + professionalMilitary(region), 0) / n;
  const avgMounted = territories.reduce((sum, region) => sum + mountedMilitary(region), 0) / n;
  const avgAutonomy = territories.reduce((sum, region) => sum + clamp(region.governance?.autonomy || 0), 0) / n;
  const literacy = clamp(capital?.education?.literacy ?? capital?.knowledge?.literacy ?? admin.recordKeeping ?? 0);
  const merit = clamp(polity.governancePreferences?.meritAppointment ?? admin.meritSelection ?? 0);
  const delegation = clamp(admin.delegation || 0);

  return {
    [STATE_PATHS.BUREAUCRATIC]: clamp((admin.officialdom || 0) * 0.34 + (admin.recordKeeping || 0) * 0.2 + (admin.communications || 0) * 0.2 + (1 - avgElite) * 0.16 + (1 - avgAutonomy) * 0.1),
    [STATE_PATHS.EXAMINATION]: clamp(literacy * 0.25 + (admin.officialdom || 0) * 0.28 + (admin.recordKeeping || 0) * 0.2 + merit * 0.27),
    [STATE_PATHS.LANDED_MILITARY]: clamp(avgElite * 0.44 + avgAutonomy * 0.25 + avgMilitary * 0.21 + delegation * 0.1),
    [STATE_PATHS.COMMERCIAL_CIVIC]: clamp(avgCommerce * 0.5 + (admin.accounting || 0) * 0.24 + (admin.communications || 0) * 0.16 + (1 - avgElite) * 0.1),
    [STATE_PATHS.MILITARY_HOUSEHOLD]: clamp(avgMilitary * 0.43 + (admin.officialdom || 0) * 0.18 + (admin.legitimacy || 0) * 0.12 + (1 - avgElite) * 0.17 + (1 - avgAutonomy) * 0.1),
    [STATE_PATHS.CONFEDERATED_MILITARY]: clamp(avgMounted * 0.4 + avgElite * 0.18 + avgAutonomy * 0.22 + delegation * 0.2),
  };
}

export function institutionalPathProfile(polity) {
  const state = ensureInstitutionalPaths(polity);
  const ranked = Object.entries(state.strength).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0] || [STATE_PATHS.BUREAUCRATIC, 0];
  const bureaucratic = Math.max(state.strength[STATE_PATHS.BUREAUCRATIC], state.strength[STATE_PATHS.EXAMINATION]);
  const civic = state.strength[STATE_PATHS.COMMERCIAL_CIVIC];
  const household = state.strength[STATE_PATHS.MILITARY_HOUSEHOLD];
  const landed = state.strength[STATE_PATHS.LANDED_MILITARY];
  const confederated = state.strength[STATE_PATHS.CONFEDERATED_MILITARY];
  return {
    primaryPath: primary[0], primaryStrength: primary[1], bureaucratic, civic, household, landed, confederated,
    centralisation: clamp(bureaucratic * 0.55 + household * 0.24 + civic * 0.16 - landed * 0.22 - confederated * 0.12),
    delegatedMilitaryCapacity: clamp(Math.max(landed, confederated, household * 0.55)),
    successionStability: clamp(bureaucratic * 0.28 + household * 0.16 + civic * 0.14 + landed * 0.12 + confederated * 0.06),
    fiscalCapacity: clamp(Math.max(bureaucratic, civic * 0.92, household * 0.64, landed * 0.48, confederated * 0.4)),
  };
}

function updateInstitutions(polity, regions, years) {
  const state = ensureInstitutionalPaths(polity);
  const territories = polityTerritories(polity, regions);
  const capital = regions.find((region) => region.id === polity.capitalRegionId) || territories[0];
  if (!capital || !territories.length) return;
  const targets = pathTargets(polity, capital, territories);
  for (const [id, target] of Object.entries(targets)) {
    state.experience[id] += target * years * 9;
    const learned = clamp(1 - Math.exp(-state.experience[id] / 32));
    state.strength[id] += (learned * target - state.strength[id]) * clamp(years * 0.28);
  }

  const profile = institutionalPathProfile(polity);
  if (profile.bureaucratic > 0.46) state.institutions.add('professional_civil_service');
  if (state.strength[STATE_PATHS.EXAMINATION] > 0.5) state.institutions.add('competitive_official_selection');
  if (profile.civic > 0.48) state.institutions.add('chartered_urban_government');
  if (profile.landed > 0.48) state.institutions.add('revenue_land_grants');
  if (profile.household > 0.48) state.institutions.add('salaried_military_households');
  if (profile.confederated > 0.5) state.institutions.add('confederated_command');

  const admin = polity.administration || {};
  const adminRoute = Math.max(profile.bureaucratic, profile.civic * 0.72, profile.household * 0.64);
  admin.officialdom = clamp((admin.officialdom || 0) + adminRoute * years * 0.0025);
  admin.communications = clamp((admin.communications || 0) + Math.max(profile.bureaucratic, profile.civic) * years * 0.0018);

  for (const region of territories) {
    if (region.id === polity.capitalRegionId || region.governance?.relationship === 'core') continue;
    if (profile.centralisation > 0.42) {
      region.governance.administrativeControl = clamp((region.governance.administrativeControl || 0) + profile.centralisation * years * 0.014);
      region.governance.autonomy = clamp((region.governance.autonomy || 0) - profile.centralisation * years * 0.005, 0, 0.98);
    }
    if (profile.landed > 0.42 || profile.confederated > 0.45) {
      region.medievalPolitics ||= {};
      region.medievalPolitics.eliteOrganisation = clamp((region.medievalPolitics.eliteOrganisation || 0) + Math.max(profile.landed, profile.confederated) * years * 0.007);
      region.medievalPolitics.localDefence = clamp((region.medievalPolitics.localDefence || 0) + profile.delegatedMilitaryCapacity * years * 0.005);
    }
  }
}

export function tickInstitutionalPaths(polities, regions, elapsedDays = 30) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  for (const polity of polities) {
    if (polity.subjectToPolityId) continue;
    if (!polityTerritories(polity, regions).length) continue;
    updateInstitutions(polity, regions, years);
  }
  return [];
}
