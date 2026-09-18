import { ensureInstitutionalGovernment, establishParliament } from './institutionalPowers.js?v=20260916-institutions1';
import { polityPopularWellbeing } from './popularWellbeing.js?v=20260918-wellbeing1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

export const FRANCHISE_LEVELS = Object.freeze({
  closed: { id: 'closed', label: 'No mass franchise', legalShare: 0.02 },
  restricted: { id: 'restricted', label: 'Restricted franchise', legalShare: 0.12 },
  qualified: { id: 'qualified', label: 'Qualified franchise', legalShare: 0.30 },
  broad: { id: 'broad', label: 'Broad franchise', legalShare: 0.60 },
  universal: { id: 'universal', label: 'Universal adult franchise', legalShare: 0.92 },
});

export const ASSOCIATION_LAWS = Object.freeze({
  banned: { id: 'banned', label: 'Political associations banned', organisation: 0.08, repression: 0.24 },
  restricted: { id: 'restricted', label: 'Political associations restricted', organisation: 0.42, repression: 0.09 },
  legal: { id: 'legal', label: 'Political associations legal', organisation: 1, repression: 0 },
});

const FRANCHISE_ORDER = ['closed', 'restricted', 'qualified', 'broad', 'universal'];
const ASSOCIATION_ORDER = ['banned', 'restricted', 'legal'];

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || null;
}

function territoriesFor(polity, regions) {
  return (regions || []).filter((region) => polityId(region) === polity.id);
}

function weightedAverage(regions, fn) {
  let weighted = 0;
  let population = 0;
  for (const region of regions) {
    const weight = Math.max(1, Number(region.population) || 1);
    weighted += clamp(fn(region)) * weight;
    population += weight;
  }
  return population ? weighted / population : 0;
}

function literacy(region) {
  return clamp(region.massEducation?.literacy ?? region.publicEducation?.literacy ?? region.education?.literacy ?? region.educationLevel ?? 0);
}

function urbanisation(region) {
  return clamp(region.settlements?.urbanisation ?? region.structuralTransformation?.urbanShare ?? region.urbanisation ?? 0);
}

function formalLabour(region) {
  return clamp(region.employment?.formalLabourShare ?? region.structuralTransformation?.wageLabourShare ?? region.labour?.formalShare ?? 0);
}

function unionDensity(region) {
  return clamp(region.labourRelations?.unionDensity ?? region.laborRelations?.unionDensity ?? 0);
}

function communicationReach(region) {
  const telegraph = region.unlockedTechIds?.has?.('electrical_telegraphy') ? 0.18 : 0;
  const telephone = region.unlockedTechIds?.has?.('telephone_networks') ? 0.12 : 0;
  const printing = region.unlockedTechIds?.has?.('printing_press') ? 0.18 : 0;
  const messenger = clamp((region.communicationState?.messengerExperience || 0) / 120) * 0.12;
  return clamp(telegraph + telephone + printing + messenger);
}

function mobilisationBurden(region) {
  const workingAge = Math.max(1, Number(region.demographics?.workingAge) || Number(region.population) * 0.55 || 1);
  const underArms = Math.max(0, Number(region.army?.personnel) || 0) + Math.max(0, Number(region.navy?.personnel) || 0);
  const manpower = clamp(underArms / workingAge * 4);
  const conflict = clamp(region.report?.conflict?.pressure ?? region.conflictPressure ?? 0);
  const warEconomy = clamp(region.industrialWarEconomy?.mobilisation ?? region.warEconomy?.mobilisation ?? 0);
  return clamp(manpower * 0.45 + conflict * 0.35 + warEconomy * 0.20);
}

function fiscalBurden(region) {
  const tax = clamp((region.governance?.tributeRate || 0) / 0.25);
  const hardship = clamp(region.employmentHardship?.hardship ?? region.hardship?.level ?? region.popularWellbeing?.grievance ?? 0);
  return clamp(tax * 0.35 + hardship * 0.65);
}

function administrativeCapacity(polity, territories) {
  const admin = polity.administration || {};
  const state = polity.stateAdministration || {};
  const localControl = weightedAverage(territories, (region) => region.governance?.administrativeControl ?? 0.2);
  const record = clamp(admin.recordKeeping || 0);
  const officialdom = clamp(admin.officialdom || 0);
  const accounting = clamp(admin.accounting || 0);
  const communications = clamp(admin.communications || 0);
  const merit = clamp(state.court?.meritShare ?? 0.35);
  return clamp(localControl * 0.22 + record * 0.22 + officialdom * 0.23 + accounting * 0.13 + communications * 0.12 + merit * 0.08);
}

function smooth(current, target, elapsedDays, annualRate = 1) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const weight = 1 - Math.exp(-annualRate * years);
  return clamp((Number(current) || 0) + (target - (Number(current) || 0)) * weight);
}

export function ensureMassPolitics(polity) {
  polity.massPolitics ||= {};
  const state = polity.massPolitics;
  state.version = 1;
  state.policy ||= {};
  if (!FRANCHISE_LEVELS[state.policy.franchise]) state.policy.franchise = 'closed';
  if (!ASSOCIATION_LAWS[state.policy.associations]) state.policy.associations = 'restricted';
  if (typeof state.policy.playerLocked !== 'boolean') state.policy.playerLocked = false;
  const defaults = {
    readiness: 0,
    politicalAwareness: 0,
    organisation: 0,
    effectiveElectorateShare: 0,
    representationGap: 0,
    reformPressure: 0,
    radicalisation: 0,
    repressionMemory: 0,
    mobilisationMemory: 0,
    administrativeCapacity: 0,
    peacefulParticipation: 0,
  };
  for (const [key, value] of Object.entries(defaults)) if (!Number.isFinite(state[key])) state[key] = value;
  if (!Number.isFinite(state.lastPressureEventTick)) state.lastPressureEventTick = -Infinity;
  if (!Number.isFinite(state.lastReformTick)) state.lastReformTick = -Infinity;
  return state;
}

export function assessMassPolitics(polity, regions) {
  ensureInstitutionalGovernment(polity);
  const state = ensureMassPolitics(polity);
  const territories = territoriesFor(polity, regions);
  if (!territories.length) return { readiness: 0, awareness: 0, organisationTarget: 0, effectiveElectorateShare: 0, representationGap: 0, reformPressure: 0, radicalisationTarget: 0, mobilisationBurden: 0, administrativeCapacity: 0, peacefulParticipation: 0 };

  const lit = weightedAverage(territories, literacy);
  const urban = weightedAverage(territories, urbanisation);
  const wage = weightedAverage(territories, formalLabour);
  const unions = weightedAverage(territories, unionDensity);
  const communications = weightedAverage(territories, communicationReach);
  const mobilisation = weightedAverage(territories, mobilisationBurden);
  const fiscal = weightedAverage(territories, fiscalBurden);
  const adminCapacity = administrativeCapacity(polity, territories);
  const wellbeing = polityPopularWellbeing(polity.id, regions);
  const grievance = clamp(wellbeing.grievance || 0);

  // Mass politics is not unlocked by a date. Literacy, cities, wage work,
  // organised labour and fast communications make large-scale participation
  // practical and make people aware that remote government decisions affect them.
  const readiness = clamp(lit * 0.26 + urban * 0.18 + wage * 0.16 + communications * 0.18 + adminCapacity * 0.14 + unions * 0.08);
  const awareness = clamp(readiness * 0.72 + mobilisation * 0.13 + fiscal * 0.08 + grievance * 0.07);

  const associationLaw = ASSOCIATION_LAWS[state.policy.associations];
  const organisationTarget = clamp(awareness * (0.28 + associationLaw.organisation * 0.72) + unions * 0.18);
  const parliament = polity.institutions.parliament;
  const legalElectorate = FRANCHISE_LEVELS[state.policy.franchise].legalShare;
  const institutionFactor = parliament.established ? clamp(0.25 + parliament.strength * 0.35 + parliament.independence * 0.20 + adminCapacity * 0.20) : 0;
  // A legal franchise larger than the state's ability to identify voters,
  // communicate rules and count results exists on paper but cannot be fully
  // realised. This gives census/administration/communications real value.
  const administrationCeiling = clamp(0.08 + adminCapacity * 0.72 + communications * 0.20);
  const effectiveElectorateShare = clamp(legalElectorate * Math.min(1, administrationCeiling * 1.35) * institutionFactor);
  const representationGap = clamp(awareness * (1 - effectiveElectorateShare * 0.88) * (0.62 + organisationTarget * 0.38));
  const burdenPressure = clamp(mobilisation * 0.45 + fiscal * 0.24 + grievance * 0.31);
  const reformPressure = clamp(representationGap * 0.68 + burdenPressure * 0.32);
  const repression = associationLaw.repression;
  const radicalisationTarget = clamp(
    Math.max(0, reformPressure - 0.32) * 0.95 +
    state.repressionMemory * 0.45 + repression * awareness * 0.35 -
    effectiveElectorateShare * 0.32
  );
  const peacefulParticipation = clamp(effectiveElectorateShare * 0.58 + organisationTarget * (associationLaw.id === 'legal' ? 0.24 : 0.08) + (parliament.established ? parliament.independence * 0.18 : 0));
  return { readiness, awareness, organisationTarget, effectiveElectorateShare, representationGap, reformPressure, radicalisationTarget, mobilisationBurden: mobilisation, administrativeCapacity: adminCapacity, peacefulParticipation };
}

function nextFranchise(current) {
  const index = FRANCHISE_ORDER.indexOf(current);
  return FRANCHISE_ORDER[Math.min(FRANCHISE_ORDER.length - 1, Math.max(0, index) + 1)];
}

function nextAssociation(current) {
  const index = ASSOCIATION_ORDER.indexOf(current);
  return ASSOCIATION_ORDER[Math.min(ASSOCIATION_ORDER.length - 1, Math.max(0, index) + 1)];
}

export function setMassPoliticsPolicy(polity, patch = {}, options = {}) {
  const state = ensureMassPolitics(polity);
  ensureInstitutionalGovernment(polity);
  const changes = [];
  if (patch.franchise && FRANCHISE_LEVELS[patch.franchise] && patch.franchise !== state.policy.franchise) {
    if (patch.franchise !== 'closed' && !polity.institutions.parliament.established) return { changed: false, reason: 'no_representative_institution' };
    changes.push({ policy: 'franchise', previous: state.policy.franchise, value: patch.franchise });
    state.policy.franchise = patch.franchise;
  }
  if (patch.associations && ASSOCIATION_LAWS[patch.associations] && patch.associations !== state.policy.associations) {
    changes.push({ policy: 'associations', previous: state.policy.associations, value: patch.associations });
    state.policy.associations = patch.associations;
  }
  if (options.playerIssued) state.policy.playerLocked = true;
  return { changed: changes.length > 0, changes, policy: { ...state.policy } };
}

function npcPolicyResponse(polity, state, assessment, currentTick) {
  if (state.policy.playerLocked) return [];
  const events = [];
  ensureInstitutionalGovernment(polity);
  const parliament = polity.institutions.parliament;
  if (!parliament.established && assessment.readiness >= 0.42 && assessment.reformPressure >= 0.48 && assessment.administrativeCapacity >= 0.30) {
    establishParliament(polity, { strength: 0.22, independence: 0.18, representation: 0.08, appointment: 'mixed_selection' });
    state.policy.franchise = 'restricted';
    state.policy.associations = state.policy.associations === 'banned' ? 'restricted' : state.policy.associations;
    state.lastReformTick = currentTick;
    events.push({ type: 'representative_institution_established', polityId: polity.id, franchise: state.policy.franchise });
    return events;
  }
  if (!parliament.established || currentTick - state.lastReformTick < 26) return events;

  if (assessment.reformPressure >= 0.62 && assessment.administrativeCapacity >= 0.32) {
    const next = nextFranchise(state.policy.franchise);
    if (next !== state.policy.franchise) {
      const previous = state.policy.franchise;
      state.policy.franchise = next;
      state.lastReformTick = currentTick;
      events.push({ type: 'franchise_reformed', polityId: polity.id, previous, franchise: next });
    }
  }
  if (assessment.radicalisationTarget >= 0.42 && assessment.reformPressure >= 0.50) {
    const next = nextAssociation(state.policy.associations);
    if (next !== state.policy.associations) {
      const previous = state.policy.associations;
      state.policy.associations = next;
      state.lastReformTick = currentTick;
      events.push({ type: 'political_association_law_reformed', polityId: polity.id, previous, associations: next });
    }
  }
  return events;
}

export function tickMassPolitics(polities, regions, currentTick = 0, elapsedDays = 7, options = {}) {
  const events = [];
  for (const polity of polities || []) {
    const state = ensureMassPolitics(polity);
    const assessment = assessMassPolitics(polity, regions);
    const previousPressure = state.reformPressure;
    state.readiness = smooth(state.readiness, assessment.readiness, elapsedDays, 0.9);
    state.politicalAwareness = smooth(state.politicalAwareness, assessment.awareness, elapsedDays, 1.2);
    state.organisation = smooth(state.organisation, assessment.organisationTarget, elapsedDays, 1.0);
    state.effectiveElectorateShare = smooth(state.effectiveElectorateShare, assessment.effectiveElectorateShare, elapsedDays, 1.5);
    state.representationGap = smooth(state.representationGap, assessment.representationGap, elapsedDays, 1.15);
    state.reformPressure = smooth(state.reformPressure, assessment.reformPressure, elapsedDays, 1.2);
    state.radicalisation = smooth(state.radicalisation, assessment.radicalisationTarget, elapsedDays, 0.9);
    state.administrativeCapacity = smooth(state.administrativeCapacity, assessment.administrativeCapacity, elapsedDays, 0.8);
    state.peacefulParticipation = smooth(state.peacefulParticipation, assessment.peacefulParticipation, elapsedDays, 1.4);
    state.mobilisationMemory = smooth(state.mobilisationMemory, assessment.mobilisationBurden, elapsedDays, assessment.mobilisationBurden > state.mobilisationMemory ? 0.85 : 0.18);

    const repression = ASSOCIATION_LAWS[state.policy.associations].repression;
    const repressionTarget = clamp(repression * state.politicalAwareness + (state.policy.associations === 'banned' ? state.reformPressure * 0.2 : 0));
    state.repressionMemory = smooth(state.repressionMemory, repressionTarget, elapsedDays, repressionTarget > state.repressionMemory ? 0.8 : 0.16);

    // Existing popular-wellbeing logic already treats parliamentary political
    // voice as a peaceful outlet. Feed the real, administered electorate into
    // that institution rather than creating a second legitimacy shortcut.
    ensureInstitutionalGovernment(polity);
    const parliament = polity.institutions.parliament;
    if (parliament.established) {
      const representationTarget = clamp(0.05 + state.effectiveElectorateShare * 0.78 + state.organisation * 0.17);
      parliament.representation = smooth(parliament.representation || 0, representationTarget, elapsedDays, 1.2);
    }

    if (previousPressure < 0.45 && state.reformPressure >= 0.45 && currentTick - state.lastPressureEventTick >= 26) {
      state.lastPressureEventTick = currentTick;
      events.push({ type: 'mass_politics_reform_pressure', polityId: polity.id, pressure: state.reformPressure, representationGap: state.representationGap, playerRelevant: polity.id === options.playerPolityId });
    }
    events.push(...npcPolicyResponse(polity, state, assessment, currentTick).map((event) => ({ ...event, playerRelevant: polity.id === options.playerPolityId })));
  }
  return events;
}

export function massPoliticsSummary(polity) {
  const state = ensureMassPolitics(polity);
  return {
    franchise: state.policy.franchise,
    franchiseLabel: FRANCHISE_LEVELS[state.policy.franchise].label,
    associations: state.policy.associations,
    associationLabel: ASSOCIATION_LAWS[state.policy.associations].label,
    readiness: state.readiness,
    politicalAwareness: state.politicalAwareness,
    organisation: state.organisation,
    effectiveElectorateShare: state.effectiveElectorateShare,
    representationGap: state.representationGap,
    reformPressure: state.reformPressure,
    radicalisation: state.radicalisation,
    repressionMemory: state.repressionMemory,
    mobilisationMemory: state.mobilisationMemory,
    administrativeCapacity: state.administrativeCapacity,
    peacefulParticipation: state.peacefulParticipation,
  };
}
