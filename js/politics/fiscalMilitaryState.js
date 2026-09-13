import { operationalInfrastructure } from '../economy/construction.js?v=20260914-fiscal-military1';
import { ensurePolityCapitalFinance } from '../economy/corporateCapital.js?v=20260914-fiscal-military1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const average = (values) => values.length ? values.reduce((s, v) => s + (Number(v) || 0), 0) / values.length : 0;
const polityIdFor = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id;

export function ensureFiscalMilitaryPolity(polity) {
  polity.fiscalMilitaryState ||= {};
  const s = polity.fiscalMilitaryState;
  for (const [key, value] of Object.entries({
    fiscalCadastre: 0,
    excisePractice: 0,
    customsAdministration: 0,
    extraordinaryWarLevy: 0,
    centralTreasuryPractice: 0,
    magazineNetwork: 0,
    arsenalCoordination: 0,
    standingForceInstitution: 0,
    bastionPractice: 0,
    artilleryFortificationPressure: 0,
    privilegeBargaining: 0,
    taxResistance: 0,
    debtBurden: 0,
    militarySupplyEfficiency: 0,
    extractionCapacity: 0,
  })) if (!Number.isFinite(s[key])) s[key] = value;
  s.elapsedDays = Math.max(0, Number(s.elapsedDays) || 0);
  return s;
}

export function ensureFiscalMilitaryRegion(region) {
  region.fiscalMilitary ||= {};
  const s = region.fiscalMilitary;
  for (const [key, value] of Object.entries({
    bastionCoverage: 0,
    magazineCapacity: 0,
    garrisonInstitution: 0,
    taxResistance: 0,
    warLevyPaid: 0,
    excisePaid: 0,
    supplyReserve: 0,
  })) if (!Number.isFinite(s[key])) s[key] = value;
  return s;
}

function hasGunpowder(region) {
  return Boolean(region?.unlockedTechIds?.has?.('gunpowder')) || (region.firearms?.readiness || 0) > 0.08;
}

function artilleryPressure(region) {
  const state = region.earlyModernMilitary?.artillery;
  const guns = (state?.inventory?.length || 0) + (state?.away?.length || 0);
  return clamp((state?.readiness || 0) * 0.6 + Math.log1p(guns) / 4 * 0.4);
}

function administrativeSignal(polity, territories) {
  const admin = polity.administration || {};
  const finance = territories.map((r) => r.militaryFinance || {});
  return clamp(
    (admin.accounting || 0) * 0.24 +
    (admin.recordKeeping || 0) * 0.22 +
    (admin.officialdom || 0) * 0.22 +
    average(finance.map((f) => f.stateCapacity ?? 0.5)) * 0.22 +
    average(territories.map((r) => operationalInfrastructure(r, 'administrative_centre') ? 1 : 0)) * 0.1
  );
}

function warPressure(polity, activeWars) {
  if (!Array.isArray(activeWars) || !activeWars.length) return 0;
  const id = polity.id;
  let pressure = 0;
  for (const war of activeWars) {
    const attackers = new Set([war.attackerPolityId, ...(war.attackerPolityIds || []), ...(war.attackers || [])].filter(Boolean));
    const defenders = new Set([war.defenderPolityId, ...(war.defenderPolityIds || []), ...(war.defenders || [])].filter(Boolean));
    if (attackers.has(id) || defenders.has(id)) pressure += 0.45;
  }
  return clamp(pressure);
}

function updateInstitutions(polity, territories, state, years, war) {
  const admin = administrativeSignal(polity, territories);
  const customs = average(territories.map((r) => operationalInfrastructure(r, 'market_customs') ? 1 : 0));
  const arsenals = average(territories.map((r) => operationalInfrastructure(r, 'royal_arsenal') ? 1 : 0));
  const drill = average(territories.map((r) => operationalInfrastructure(r, 'drill_ground') ? 1 : 0));
  const walls = average(territories.map((r) =>
    operationalInfrastructure(r, 'settlement_walls') || operationalInfrastructure(r, 'coastal_fortifications') ? 1 : 0));
  const gunpowder = average(territories.map((r) => hasGunpowder(r) ? 1 : 0));
  const artillery = average(territories.map(artilleryPressure));
  const capitalFinance = ensurePolityCapitalFinance(polity);
  const annualRevenue = territories.reduce((sum, r) => sum + Math.max(0, r.militaryFinance?.revenueEma || 0) * 52, 0);
  state.debtBurden = clamp(capitalFinance.publicDebt / Math.max(0.2, annualRevenue * 3));

  const step = (key, target, rate) => {
    state[key] += (clamp(target) - state[key]) * clamp(years * rate);
    state[key] = clamp(state[key]);
  };
  step('fiscalCadastre', admin * 0.62 + state.centralTreasuryPractice * 0.2 + customs * 0.18, 0.08);
  step('customsAdministration', customs * 0.46 + admin * 0.32 + state.fiscalCadastre * 0.22, 0.1);
  step('excisePractice', state.customsAdministration * 0.42 + admin * 0.26 + war * 0.2 + state.debtBurden * 0.12, 0.07);
  step('centralTreasuryPractice', admin * 0.42 + state.fiscalCadastre * 0.25 + state.customsAdministration * 0.18 + state.debtBurden * 0.15, 0.07);
  step('arsenalCoordination', arsenals * 0.42 + admin * 0.22 + artillery * 0.2 + war * 0.16, 0.12);
  step('magazineNetwork', arsenals * 0.25 + state.arsenalCoordination * 0.28 + admin * 0.2 + war * 0.17 + drill * 0.1, 0.09);
  step('standingForceInstitution', drill * 0.32 + state.centralTreasuryPractice * 0.25 + state.magazineNetwork * 0.2 + war * 0.16 + admin * 0.07, 0.07);
  step('artilleryFortificationPressure', artillery * 0.52 + gunpowder * 0.22 + war * 0.18 + walls * 0.08, 0.13);
  step('bastionPractice', walls * 0.25 + state.artilleryFortificationPressure * 0.36 + state.arsenalCoordination * 0.14 + admin * 0.15 + state.centralTreasuryPractice * 0.1, 0.055);
  step('privilegeBargaining', state.excisePractice * 0.18 + state.debtBurden * 0.22 + war * 0.2 + (1 - admin) * 0.22 + state.taxResistance * 0.18, 0.06);
  state.extractionCapacity = clamp(admin * 0.28 + state.fiscalCadastre * 0.24 + state.customsAdministration * 0.18 + state.excisePractice * 0.18 + state.centralTreasuryPractice * 0.12);
  state.militarySupplyEfficiency = clamp(state.magazineNetwork * 0.42 + state.arsenalCoordination * 0.28 + state.standingForceInstitution * 0.18 + admin * 0.12);
}

function applyExtraction(polity, territories, state, years, war, events) {
  const levyTarget = clamp(war * 0.62 + state.debtBurden * 0.22 + state.standingForceInstitution * 0.08 - state.taxResistance * 0.2);
  state.extraordinaryWarLevy += (levyTarget - state.extraordinaryWarLevy) * clamp(years * 0.5);
  let totalExtracted = 0;
  let totalResistance = 0;

  for (const region of territories) {
    const local = ensureFiscalMilitaryRegion(region);
    const wealth = Math.max(0, region.wallet || 0);
    const trade = Math.max(0, region.tradeEconomy?.weeklyExports || 0) + Math.max(0, region.tradeEconomy?.weeklyImports || 0);
    const localAdmin = clamp(region.militaryFinance?.stateCapacity ?? 0.5);
    const exemptions = clamp(region.medievalSociety?.estates?.taxExemption || 0);
    const autonomy = clamp(region.governance?.autonomy || 0);
    const resistance = clamp((1 - localAdmin) * 0.24 + exemptions * 0.28 + autonomy * 0.22 + state.extraordinaryWarLevy * 0.2 + state.debtBurden * 0.12);
    local.taxResistance += (resistance - local.taxResistance) * clamp(years * 0.55);
    const compliance = clamp(1 - local.taxResistance * 0.65);

    const excise = Math.min(wealth, trade * 0.004 * 52 * years * state.excisePractice * state.extractionCapacity * compliance);
    const remaining = Math.max(0, wealth - excise);
    const levy = Math.min(remaining, remaining * 0.0018 * years * state.extraordinaryWarLevy * state.extractionCapacity * compliance);
    const extracted = excise + levy;
    if (extracted > 0) {
      region.wallet -= extracted;
      region.treasury = (region.treasury || 0) + extracted;
      local.excisePaid = excise;
      local.warLevyPaid = levy;
      totalExtracted += extracted;
    }
    if (state.extraordinaryWarLevy > 0.18) {
      region.stability = clamp((region.stability ?? 0.7) - years * local.taxResistance * state.extraordinaryWarLevy * 0.006);
    }
    totalResistance += local.taxResistance;
  }

  state.taxResistance += ((territories.length ? totalResistance / territories.length : 0) - state.taxResistance) * clamp(years * 0.4);
  const factions = polity.stateAdministration?.factions;
  if (factions?.provincial) factions.provincial.satisfaction = clamp(factions.provincial.satisfaction - years * state.extraordinaryWarLevy * state.taxResistance * 0.015);
  if (factions?.urban) factions.urban.satisfaction = clamp(factions.urban.satisfaction - years * state.excisePractice * state.taxResistance * 0.008);
  if (totalExtracted > 0.05 && war > 0) events.push({ type: 'wartime_fiscal_extraction', polityId: polity.id, amount: totalExtracted, resistance: state.taxResistance });
}

function updateRegionalMilitaryState(territories, state, years) {
  for (const region of territories) {
    const local = ensureFiscalMilitaryRegion(region);
    const walls = operationalInfrastructure(region, 'settlement_walls') || operationalInfrastructure(region, 'coastal_fortifications');
    const arsenal = operationalInfrastructure(region, 'royal_arsenal');
    const drill = operationalInfrastructure(region, 'drill_ground');
    const artillery = artilleryPressure(region);
    const fortTarget = walls && hasGunpowder(region)
      ? clamp(state.bastionPractice * 0.52 + state.artilleryFortificationPressure * 0.3 + artillery * 0.18)
      : 0;
    local.bastionCoverage += (fortTarget - local.bastionCoverage) * clamp(years * 0.09);
    const magazineTarget = arsenal
      ? clamp(state.magazineNetwork * 0.55 + state.arsenalCoordination * 0.25 + (drill ? 0.2 : 0))
      : 0;
    local.magazineCapacity += (magazineTarget - local.magazineCapacity) * clamp(years * 0.12);
    local.garrisonInstitution += (clamp((drill ? 0.35 : 0) + local.bastionCoverage * 0.3 + state.standingForceInstitution * 0.35) - local.garrisonInstitution) * clamp(years * 0.09);
    local.supplyReserve += (clamp(local.magazineCapacity * 0.55 + state.militarySupplyEfficiency * 0.45) - local.supplyReserve) * clamp(years * 0.18);
  }
}

export function fortificationResistanceMultiplier(region) {
  const local = ensureFiscalMilitaryRegion(region);
  return 1 + local.bastionCoverage * 0.95 + local.garrisonInstitution * 0.18;
}

export function fiscalMilitarySupplyMultiplier(region, polities = []) {
  const polityId = polityIdFor(region);
  const polity = polities.find?.((p) => p.id === polityId);
  const state = polity ? ensureFiscalMilitaryPolity(polity) : null;
  const local = ensureFiscalMilitaryRegion(region);
  return 1 + local.supplyReserve * 0.22 + (state?.militarySupplyEfficiency || 0) * 0.18;
}

export function tickFiscalMilitaryState(regions, polities, activeWars = [], currentTick = 0, elapsedDays = 30, options = {}) {
  if (!regions?.length || !polities?.length) return [];
  const territories = new Map();
  for (const region of regions) {
    ensureFiscalMilitaryRegion(region);
    const id = polityIdFor(region);
    if (!territories.has(id)) territories.set(id, []);
    territories.get(id).push(region);
  }
  const events = [];
  for (const polity of polities) {
    const state = ensureFiscalMilitaryPolity(polity);
    state.elapsedDays += Math.max(0, Number(elapsedDays) || 0);
    if (state.elapsedDays < DAYS_PER_YEAR) continue;
    const years = state.elapsedDays / DAYS_PER_YEAR;
    state.elapsedDays = 0;
    const owned = territories.get(polity.id) || [];
    if (!owned.length) continue;
    const war = warPressure(polity, activeWars);
    updateInstitutions(polity, owned, state, years, war);
    applyExtraction(polity, owned, state, years, war, events);
    updateRegionalMilitaryState(owned, state, years);
    if (state.bastionPractice > 0.35 && state.artilleryFortificationPressure > 0.4 && !state.bastionMilestoneTick) {
      state.bastionMilestoneTick = currentTick;
      events.push({ type: 'bastioned_fortification_emerges', polityId: polity.id, bastionPractice: state.bastionPractice });
    }
  }
  return events.filter((event) => !options.playerPolityId || event.polityId === options.playerPolityId || event.type === 'bastioned_fortification_emerges');
}
