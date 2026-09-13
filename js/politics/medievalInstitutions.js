import { centroidDistanceKm } from '../world/distance.js?v=20260904-kingdom1';
import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260908-subregion1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function dominantCulture(region) {
  const groups = Array.isArray(region?.cultureGroups) ? region.cultureGroups : [];
  const total = groups.reduce((sum, group) => sum + Math.max(0, Number(group.population) || 0), 0) || 1;
  let id = null; let share = 0;
  for (const group of groups) {
    const value = Math.max(0, Number(group.population) || 0) / total;
    if (value > share) { share = value; id = group.id || group.cultureId || group.name || null; }
  }
  return { id, share };
}

function dominantReligion(region) {
  let id = null; let share = 0;
  for (const [religionId, value] of Object.entries(region?.religion?.shares || {})) {
    if (value > share) { id = religionId; share = value; }
  }
  return { id, share };
}

export function ensureMedievalPoliticalState(region) {
  region.medievalPolitics ||= {};
  const state = region.medievalPolitics;
  for (const [key, initial] of Object.entries({
    localIdentity: 0.15, eliteOrganisation: 0.05, localDefence: 0, localFiscalCapacity: 0.05,
    grievance: 0, independencePressure: 0, centralProtection: 1, yearsUnderOwnDefence: 0,
    fortification: 0, garrisonPersonnel: 0,
  })) if (!Number.isFinite(state[key])) state[key] = initial;
  if (!Number.isFinite(state.lastAutonomyDemandTick)) state.lastAutonomyDemandTick = -Infinity;
  if (!Number.isFinite(state.lastRevoltTick)) state.lastRevoltTick = -Infinity;
  return state;
}

function polityMap(polities) { return new Map((polities || []).map((p) => [p.id, p])); }
function regionMap(regions) { return new Map((regions || []).map((r) => [r.id, r])); }

function culturalDivergence(region, capital) {
  const a = dominantCulture(region); const b = dominantCulture(capital);
  if (!a.id || !b.id) return 0.15;
  return a.id === b.id ? Math.max(0, 1 - Math.min(a.share, b.share)) * 0.25 : 0.75 + Math.min(0.2, a.share * 0.2);
}

function religiousDivergence(region, capital) {
  const a = dominantReligion(region); const b = dominantReligion(capital);
  if (!a.id || !b.id) return 0;
  return a.id === b.id ? Math.max(0, 1 - Math.min(a.share, b.share)) * 0.2 : 0.7 * a.share;
}

function protectionScore(region, capital, polity) {
  if (!capital || !polity) return 0.15;
  const admin = clamp(region.governance?.administrativeControl ?? 0.2);
  const capitalArmy = Math.max(0, capital.army?.personnel || 0);
  const population = Math.max(1, region.population || 1);
  const force = clamp(capitalArmy / Math.max(300, population * 0.012));
  const legitimacy = clamp(polity.administration?.legitimacy ?? 0.3);
  const distance = centroidDistanceKm(region, capital) ?? 500;
  const communications = clamp(polity.administration?.communications ?? 0.1);
  const reach = 1 / (1 + distance / (350 + communications * 2200));
  return clamp(0.18 + admin * 0.24 + force * 0.2 + legitimacy * 0.18 + reach * 0.2);
}

function insecurity(region) {
  const raids = Math.min(1, Math.max(0, region.militaryThreat?.recentRaids || 0) / 4);
  const stability = 1 - clamp(region.stability ?? 0.7);
  const bandits = clamp((region.banditPopulation || 0) / Math.max(1, (region.population || 1) * 0.03));
  return clamp(raids * 0.45 + stability * 0.3 + bandits * 0.25);
}

function delegatedPowerCount(region) {
  return Object.values(region.governance?.delegatedPowers || {}).filter(Boolean).length;
}

function addLocalFortPlace(region, state) {
  if (state.fortification < 0.35) return;
  const control = ensureSubregionalControl(region);
  if (control.places.some((place) => place.kind === 'local_fort')) return;
  const actor = region.governance?.localPolityId || region.polityId || region.id;
  control.places.push({
    id: `${region.id}:local-fort`, name: `${region.name} local stronghold`, kind: 'local_fort', population: 0,
    strategicValue: 0.76, nativeControllerActorId: actor, controllerActorId: actor,
    occupationMode: 'local_autonomy', garrisonActorId: actor, garrisonPersonnel: Math.round(state.garrisonPersonnel),
    contested: false, capturedTick: null,
  });
}

export function medievalPoliticalAssessment(region, capital, polity) {
  const state = ensureMedievalPoliticalState(region);
  const protection = protectionScore(region, capital, polity);
  const insecure = insecurity(region);
  const culture = culturalDivergence(region, capital);
  const religion = religiousDivergence(region, capital);
  const autonomy = clamp(region.governance?.autonomy ?? 0);
  const tribute = clamp((region.governance?.tributeRate || 0) / 0.25);
  const delegated = delegatedPowerCount(region) / 4;
  const centralWeakness = 1 - clamp(polity?.administration?.legitimacy ?? 0.3);
  const identity = clamp(0.15 + culture * 0.46 + religion * 0.22 + autonomy * 0.12 + state.yearsUnderOwnDefence / 80 * 0.12);
  const grievance = clamp(insecure * (1 - protection) * 0.38 + tribute * 0.18 + religion * 0.18 +
    (1 - clamp(region.governance?.administrativeControl ?? 0.3)) * 0.12 + (1 - clamp(region.stability ?? 0.7)) * 0.14 +
    clamp(region.governance?.elitePoliticsGrievance || 0) * 0.7);
  const organisation = clamp(state.eliteOrganisation * 0.55 + state.localFiscalCapacity * 0.2 + state.localDefence * 0.25);
  const pressure = clamp(identity * grievance * (0.35 + organisation * 0.9) * (0.6 + centralWeakness * 0.8) * 2.2);
  return { protection, insecurity: insecure, culturalDivergence: culture, religiousDivergence: religion,
    localIdentity: identity, grievance, organisation, independencePressure: pressure, delegated };
}

function updateLocalInstitutions(region, capital, polity, elapsedYears) {
  const state = ensureMedievalPoliticalState(region);
  const a = medievalPoliticalAssessment(region, capital, polity);
  state.centralProtection += (a.protection - state.centralProtection) * clamp(elapsedYears * 0.8);
  state.localIdentity += (a.localIdentity - state.localIdentity) * clamp(elapsedYears * 0.35);
  state.grievance += (a.grievance - state.grievance) * clamp(elapsedYears * 0.7);
  const delegated = delegatedPowerCount(region) / 4;
  const defenceNeed = clamp(a.insecurity * (1 - a.protection) + delegated * 0.18 + (region.governance?.autonomy || 0) * 0.12);
  state.localDefence += (defenceNeed - state.localDefence) * clamp(elapsedYears * 0.55);
  if (state.localDefence > 0.2) state.yearsUnderOwnDefence += elapsedYears;
  else state.yearsUnderOwnDefence = Math.max(0, state.yearsUnderOwnDefence - elapsedYears * 0.4);
  const commerce = clamp(Math.log1p((region.tradeEconomy?.weeklyExports || 0) + (region.tradeEconomy?.weeklyImports || 0)) / 12);
  const fiscalTarget = clamp((region.governance?.delegatedPowers?.collectTaxes ? 0.35 : 0.08) +
    (region.governance?.autonomy || 0) * 0.32 + commerce * 0.22);
  state.localFiscalCapacity += (fiscalTarget - state.localFiscalCapacity) * clamp(elapsedYears * 0.35);
  const eliteTarget = clamp(delegated * 0.26 + state.localDefence * 0.28 + state.localFiscalCapacity * 0.24 +
    (region.governance?.autonomy || 0) * 0.18 + state.yearsUnderOwnDefence / 120 * 0.18);
  state.eliteOrganisation += (eliteTarget - state.eliteOrganisation) * clamp(elapsedYears * 0.28);
  state.fortification += (state.localDefence * 0.7 - state.fortification) * clamp(elapsedYears * 0.16);
  const desiredGarrison = Math.max(0, (region.population || 0) * 0.006 * state.localDefence * (0.5 + state.eliteOrganisation));
  state.garrisonPersonnel += (desiredGarrison - state.garrisonPersonnel) * clamp(elapsedYears * 0.45);
  const after = medievalPoliticalAssessment(region, capital, polity);
  state.independencePressure += (after.independencePressure - state.independencePressure) * clamp(elapsedYears * 0.6);
  addLocalFortPlace(region, state);
  return state;
}

export function grantMedievalAutonomy(region) {
  if (!region?.governance || region.governance.relationship === 'core') return false;
  region.governance.autonomy = clamp((region.governance.autonomy || 0) + 0.14, 0.1, 0.98);
  region.governance.tributeRate = clamp((region.governance.tributeRate || 0) * 0.82, 0, 0.25);
  region.governance.delegatedPowers.commandArmy = true;
  region.governance.delegatedPowers.collectTaxes = true;
  const state = ensureMedievalPoliticalState(region);
  state.grievance *= 0.72;
  state.independencePressure *= 0.78;
  return true;
}

export function declareMedievalSecession(region, polities, regions, currentTick) {
  const byPolity = polityMap(polities);
  const oldSovereign = region.governance?.sovereignPolityId;
  const localId = region.governance?.localPolityId || region.polityId;
  const local = byPolity.get(localId);
  if (!local || localId === oldSovereign) return null;
  local.subjectToPolityId = null;
  local.capitalRegionId = region.id;
  local.rulerRegionId = region.id;
  region.governance.sovereignPolityId = localId;
  region.governance.localPolityId = localId;
  region.governance.relationship = 'core';
  region.governance.autonomy = 0;
  region.governance.administrativeControl = 1;
  region.governance.tributeRate = 0;
  region.governance.militaryObligation = 0;
  region.controllingActorId = region.id;
  const state = ensureMedievalPoliticalState(region);
  region.army ||= { personnel: 0, away: 0 };
  region.army.personnel = Math.max(region.army.personnel || 0, Math.round(state.garrisonPersonnel));
  state.lastRevoltTick = currentTick;
  state.grievance *= 0.35;
  state.independencePressure *= 0.35;
  const control = ensureSubregionalControl(region);
  control.sovereignActorId = localId;
  control.operationalControllerActorId = localId;
  control.ruralControl = { [localId]: 1 };
  for (const place of control.places) {
    if (place.kind === 'religious_capital') continue;
    place.nativeControllerActorId = localId;
    place.controllerActorId = localId;
    if (place.kind === 'local_fort') { place.garrisonActorId = localId; place.garrisonPersonnel = Math.round(state.garrisonPersonnel); }
  }
  return { type: 'medieval_civil_war', regionId: region.id, regionName: region.name,
    polityId: oldSovereign, rebelPolityId: localId, formerSovereignPolityId: oldSovereign };
}

export function tickMedievalInstitutions(polities, regions, currentTick, elapsedDays = 30, options = {}) {
  const elapsedYears = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const pMap = polityMap(polities); const rMap = regionMap(regions); const events = [];
  for (const region of regions) {
    const sovereignId = region.governance?.sovereignPolityId;
    const polity = pMap.get(sovereignId);
    if (!polity || region.id === polity.capitalRegionId || region.governance?.relationship === 'core') continue;
    const capital = rMap.get(polity.capitalRegionId);
    const state = updateLocalInstitutions(region, capital, polity, elapsedYears);
    if (state.independencePressure >= 0.42 && currentTick - state.lastAutonomyDemandTick >= 156) {
      state.lastAutonomyDemandTick = currentTick;
      const event = { type: 'medieval_autonomy_demand', regionId: region.id, regionName: region.name, polityId: sovereignId,
        pressure: state.independencePressure, requestedAutonomy: clamp((region.governance.autonomy || 0) + 0.14, 0.1, 0.98) };
      if (sovereignId === options.playerPolityId) {
        event.resolveDecision = (choice) => {
          if (choice === 'grant') return { granted: grantMedievalAutonomy(region) };
          state.grievance = clamp(state.grievance + 0.1); state.independencePressure = clamp(state.independencePressure + 0.08);
          return { granted: false };
        };
      } else if ((polity.administration?.legitimacy || 0) < 0.55 || state.independencePressure < 0.62) {
        grantMedievalAutonomy(region);
        event.npcResolution = 'granted';
      } else {
        state.grievance = clamp(state.grievance + 0.08); state.independencePressure = clamp(state.independencePressure + 0.06);
        event.npcResolution = 'refused';
      }
      events.push(event);
    }
    if (state.independencePressure >= 0.74 && state.localDefence >= 0.38 && state.eliteOrganisation >= 0.34 &&
        currentTick - state.lastRevoltTick >= 260) {
      const event = declareMedievalSecession(region, polities, regions, currentTick);
      if (event) events.push(event);
    }
  }
  return events;
}
