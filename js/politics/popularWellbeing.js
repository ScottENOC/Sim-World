import { enterpriseRegionalConsequences } from '../economy/enterpriseBehaviour.js';
import { householdEnergyWellbeing } from '../economy/householdEnergy.js?v=20260917-oil1';
import { electricityWellbeing } from '../economy/electricity.js?v=20260917-electric1';
import { institutionalPoliticalVoice } from './institutionalPowers.js?v=20260916-institutions1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || null;
}

function smooth(current, target, elapsedDays, annualRate = 1.2) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const weight = 1 - Math.exp(-annualRate * years);
  return clamp((Number(current) || 0) + (target - (Number(current) || 0)) * weight);
}

function violencePressure(region) {
  const conflict = region?.report?.conflict || {};
  const campaign = clamp(conflict.pressure || region?.conflictPressure || 0);
  const raids = clamp(region?.raidPressure || region?.banditry?.pressure || region?.banditryPressure || 0);
  const disease = clamp(region?.disease?.burden || region?.diseaseBurden || 0);
  return clamp(campaign * 0.55 + raids * 0.3 + disease * 0.15);
}

function materialProsperity(region) {
  const pop = Math.max(1, Number(region?.population) || 1);
  const wealthPerCapita = Math.max(0, Number(region?.wallet) || 0) / pop;
  const wealth = clamp(Math.log1p(wealthPerCapita * 500) / 5);
  const food = clamp(region?.foodSecurity ?? region?.foodSufficiency ?? (region?.famine ? 0.1 : 0.65));
  const housing = region?.housing ? clamp(region.housing.capacity / Math.max(1, pop)) : 0.65;
  const employment = clamp(1 - (region?.labor?.unemploymentRate ?? region?.unemploymentRate ?? 0.08));
  const enterprise = enterpriseRegionalConsequences(region);
  const energy = householdEnergyWellbeing(region);
  const electricity = electricityWellbeing(region);
  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 + energy.prosperity + electricity.prosperity - enterprise.prosperityPenalty);
}

function culturalAccess(region) {
  const arts = region?.arts || region?.culture?.arts || region?.culturalMemory?.arts || {};
  const urban = region?.medievalSociety?.urban || {};
  const settlements = region?.settlements || {};
  const artistic = clamp(arts.access ?? arts.activity ?? arts.patronage ?? region?.artsAccess ?? 0);
  const gathering = clamp((urban.guilds || 0) * 0.25 + (urban.council || 0) * 0.2 + (settlements.urbanisation || region?.urbanisation || 0) * 0.25);
  const energy = householdEnergyWellbeing(region);
  const electricity = electricityWellbeing(region);
  return clamp(0.18 + artistic * 0.58 + gathering + energy.culturalAccess + electricity.culturalAccess);
}

function politicalVoice(polity) {
  if (!polity) return 0.12;
  return clamp(0.08 + institutionalPoliticalVoice(polity) * 0.92);
}

function stateLegitimacy(polity) {
  return clamp(polity?.continuity?.legitimacy ?? polity?.administration?.legitimacy ?? 0.3);
}

export function ensurePopularWellbeing(region) {
  region.popularWellbeing ||= {};
  const s = region.popularWellbeing;
  const defaults = {
    prosperity: 0.5,
    safety: 0.7,
    culturalAccess: 0.25,
    politicalVoice: 0.12,
    satisfaction: 0.5,
    grievance: 0.2,
    peacefulOutlet: 0.1,
    revolutionaryPressure: 0,
    mobilisationPotential: 0,
  };
  for (const [key, value] of Object.entries(defaults)) if (!Number.isFinite(s[key])) s[key] = value;
  return s;
}

export function assessPopularWellbeing(region, polity) {
  const prosperity = materialProsperity(region);
  const enterprise = enterpriseRegionalConsequences(region);
  const energy = householdEnergyWellbeing(region);
  const electricity = electricityWellbeing(region);
  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty + energy.safety + electricity.safety);
  const culture = culturalAccess(region);
  const voice = politicalVoice(polity);
  const legitimacy = stateLegitimacy(polity);
  const stability = clamp(region?.stability ?? 0.55);
  const satisfaction = clamp(prosperity * 0.34 + safety * 0.3 + culture * 0.14 + legitimacy * 0.13 + stability * 0.09);
  const grievance = clamp((1 - prosperity) * 0.31 + (1 - safety) * 0.31 + (1 - culture) * 0.1 + (1 - legitimacy) * 0.16 + (1 - stability) * 0.12);
  // Political voice is primarily an outlet for grievances rather than a generic
  // happiness bonus. Content people can tolerate concentrated power; unhappy
  // people are less likely to turn revolutionary when peaceful remedies exist.
  const peacefulOutlet = clamp(voice * 0.72 + legitimacy * 0.16 + stability * 0.12);
  const revolutionaryPressure = clamp(Math.max(0, grievance - 0.38) * 1.35 * (1 - peacefulOutlet * 0.72));
  const mobilisationPotential = clamp(revolutionaryPressure * (0.45 + culture * 0.18 + Math.max(0, voice - 0.2) * 0.2));
  return { prosperity, safety, culturalAccess: culture, politicalVoice: voice, satisfaction, grievance, peacefulOutlet, revolutionaryPressure, mobilisationPotential };
}

export function tickPopularWellbeing(regions, polities, elapsedDays, options = {}) {
  const polityMap = new Map((polities || []).map((p) => [p.id, p]));
  const events = [];
  for (const region of regions || []) {
    const state = ensurePopularWellbeing(region);
    const assessment = assessPopularWellbeing(region, polityMap.get(polityId(region)));
    const previousPressure = state.revolutionaryPressure;
    for (const [key, target] of Object.entries(assessment)) state[key] = smooth(state[key], target, elapsedDays, key === 'revolutionaryPressure' ? 2.2 : 1.25);
    if (previousPressure < 0.45 && state.revolutionaryPressure >= 0.45) {
      events.push({ type: 'popular_unrest_rising', regionId: region.id, polityId: polityId(region), pressure: state.revolutionaryPressure, playerRelevant: polityId(region) === options.playerPolityId });
    }
  }
  return events;
}

export function polityPopularWellbeing(polityIdValue, regions) {
  const territories = (regions || []).filter((region) => polityId(region) === polityIdValue);
  let population = 0;
  const totals = { satisfaction: 0, grievance: 0, revolutionaryPressure: 0, politicalVoice: 0 };
  for (const region of territories) {
    const weight = Math.max(1, Number(region.population) || 1);
    const s = ensurePopularWellbeing(region);
    population += weight;
    for (const key of Object.keys(totals)) totals[key] += s[key] * weight;
  }
  if (!population) return { ...totals, population: 0 };
  for (const key of Object.keys(totals)) totals[key] /= population;
  return { ...totals, population };
}
