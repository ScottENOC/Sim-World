import { ensureMedievalPoliticalState } from './medievalInstitutions.js?v=20260912-medieval-politics1';
import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260908-subregion1';
import { linkSuccessionClaimant, reconcileSuccessionContinuity } from './successionContinuityBridge.js?v=20260913-succession-continuity1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function stableFraction(text) {
  let hash = 2166136261;
  for (const c of String(text)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function commerce(region) {
  return clamp(Math.log1p((region.tradeEconomy?.weeklyExports || 0) + (region.tradeEconomy?.weeklyImports || 0)) / 10);
}

function urbanShare(region) {
  const urban = Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation ?? 0);
  return clamp(urban / Math.max(1, region.population || 1));
}

function horseDepth(region) {
  return clamp(((region.horseEconomy?.horses || region.stockpile?.horses || 0) / Math.max(50, (region.population || 1) * 0.01)));
}

function hasTech(region, id) {
  return Boolean(region.unlockedTechIds?.has?.(id) || region.breakthroughs?.has?.(id) || region.technology?.breakthroughs?.has?.(id) || region.technology?.known?.has?.(id));
}

export function ensureMedievalSociety(region) {
  region.medievalSociety ||= {};
  const s = region.medievalSociety;
  s.paths ||= { bureaucraticService: 0, landedRetinues: 0, revenueAssignments: 0, clanRetinues: 0, urbanCivic: 0 };
  s.urban ||= { guilds: 0, council: 0, militia: 0, charterAutonomy: 0, industrialSpecialisation: 0 };
  s.estates ||= { eliteLandShare: 0, taxExemption: 0, hereditaryPower: 0, privateRetinues: 0 };
  s.education ||= { religiousSchools: 0, courtSchools: 0, examinationService: 0, urbanAcademies: 0, technicalSchools: 0, knowledgeCapacity: 0 };
  s.demographic ||= { labourScarcity: 0, wagePressure: 0, bargainingPower: 0, lastPopulation: Math.max(1, region.population || 1) };
  return s;
}

export function ensureSuccessionState(polity) {
  polity.succession ||= {};
  const s = polity.succession;
  if (!Number.isFinite(s.rulerGeneration)) s.rulerGeneration = 1;
  if (!Number.isFinite(s.rulerAge)) s.rulerAge = 18 + stableFraction(`${polity.id}:founder-age`) * 30;
  if (!Number.isFinite(s.rulerTenureYears)) s.rulerTenureYears = 0;
  if (!Number.isFinite(s.lastSuccessionTick)) s.lastSuccessionTick = 0;
  if (!Array.isArray(s.claimants)) s.claimants = [];
  if (!s.crisis) s.crisis = null;
  return s;
}

function polityTerritories(polity, regions) {
  return regions.filter((r) => r.governance?.sovereignPolityId === polity.id);
}

function average(values) { return values.length ? values.reduce((a,b) => a+b,0) / values.length : 0; }

export function institutionalPathways(polity, territories) {
  const admin = polity.administration || {};
  const regions = territories.length ? territories : [];
  const local = regions.map(ensureMedievalPoliticalState);
  const societies = regions.map(ensureMedievalSociety);
  const elite = average(local.map(s => s.eliteOrganisation || 0));
  const localDefence = average(local.map(s => s.localDefence || 0));
  const fiscal = average(local.map(s => s.localFiscalCapacity || 0));
  const identity = average(local.map(s => s.localIdentity || 0));
  const horses = average(regions.map(horseDepth));
  const urban = average(regions.map(urbanShare));
  const trade = average(regions.map(commerce));
  const bureaucracy = clamp((admin.officialdom || 0) * 0.4 + (admin.accounting || 0) * 0.25 + (admin.communications || 0) * 0.2 + (admin.recordKeeping || 0) * 0.15);
  const delegation = clamp(admin.delegation || 0);
  return {
    bureaucraticService: bureaucracy,
    landedRetinues: clamp(elite * 0.38 + localDefence * 0.25 + horses * 0.22 + (1 - bureaucracy) * 0.15),
    revenueAssignments: clamp(fiscal * 0.34 + delegation * 0.28 + localDefence * 0.18 + (1 - (admin.accounting || 0)) * 0.12 + elite * 0.08),
    clanRetinues: clamp(identity * 0.34 + horses * 0.25 + localDefence * 0.24 + (1 - bureaucracy) * 0.17),
    urbanCivic: clamp(urban * 0.34 + trade * 0.34 + average(societies.map(s => s.urban.council || 0)) * 0.18 + (admin.accounting || 0) * 0.14),
  };
}

function updatePathways(polity, territories, years) {
  const targets = institutionalPathways(polity, territories);
  polity.institutionalPaths ||= { ...targets };
  for (const [key, target] of Object.entries(targets)) {
    polity.institutionalPaths[key] = clamp((polity.institutionalPaths[key] || 0) + (target - (polity.institutionalPaths[key] || 0)) * clamp(years * 0.22));
  }
  return polity.institutionalPaths;
}

function updateRegionInstitutions(region, polity, years) {
  const s = ensureMedievalSociety(region);
  const p = polity.institutionalPaths || {};
  s.paths = { ...p };
  region._institutionalPaths = s.paths;
  const c = commerce(region); const u = urbanShare(region);
  const local = ensureMedievalPoliticalState(region);

  // Parallel solutions: none of these is a prerequisite for the others.
  const estateTarget = clamp((p.landedRetinues || 0) * 0.55 + (p.revenueAssignments || 0) * 0.18 + local.eliteOrganisation * 0.27);
  s.estates.eliteLandShare += (estateTarget - s.estates.eliteLandShare) * clamp(years * 0.14);
  s.estates.taxExemption += (s.estates.eliteLandShare * 0.55 - s.estates.taxExemption) * clamp(years * 0.12);
  s.estates.hereditaryPower += ((s.estates.eliteLandShare * 0.5 + local.eliteOrganisation * 0.35) - s.estates.hereditaryPower) * clamp(years * 0.1);
  s.estates.privateRetinues += (((p.landedRetinues || 0) * 0.55 + (p.clanRetinues || 0) * 0.4) - s.estates.privateRetinues) * clamp(years * 0.18);

  const guildTarget = clamp(c * 0.55 + u * 0.45);
  s.urban.guilds += (guildTarget - s.urban.guilds) * clamp(years * 0.18);
  s.urban.council += (clamp(guildTarget * 0.45 + (region.governance?.autonomy || 0) * 0.3 + (p.urbanCivic || 0) * 0.25) - s.urban.council) * clamp(years * 0.15);
  s.urban.militia += (clamp(s.urban.council * 0.35 + u * 0.3 + local.localDefence * 0.35) - s.urban.militia) * clamp(years * 0.2);
  s.urban.industrialSpecialisation += (clamp(s.urban.guilds * 0.55 + c * 0.25 + (polity.administration?.accounting || 0) * 0.2) - s.urban.industrialSpecialisation) * clamp(years * 0.16);
  s.urban.charterAutonomy = clamp(Math.max(s.urban.charterAutonomy, s.urban.council * 0.45));

  const writing = polity.administration?.breakthroughs?.has?.('writing') || hasTech(region, 'writing');
  const organisedReligion = Boolean(region.religion?.stateReligionId) || Object.values(region.religion?.shares || {}).some(v => v > 0.45);
  const courtTarget = writing ? clamp((polity.administration?.officialdom || 0) * 0.6 + (polity.administration?.recordKeeping || 0) * 0.4) : 0;
  const religiousTarget = organisedReligion ? clamp((region.religiousSeatInfluence || 0) * 0.25 + (region.religion?.unrest ? 0.05 : 0) + 0.22) : 0;
  const examinationTarget = writing ? clamp((p.bureaucraticService || 0) * 0.72 + (polity.administration?.officialdom || 0) * 0.28 - s.estates.hereditaryPower * 0.15) : 0;
  const academyTarget = writing ? clamp(c * 0.34 + u * 0.25 + s.urban.guilds * 0.2 + (polity.administration?.accounting || 0) * 0.21) : 0;
  const technicalTarget = clamp((s.urban.industrialSpecialisation || 0) * 0.42 + (hasTech(region, 'steelmaking') ? 0.22 : 0) + (hasTech(region, 'gunpowder') ? 0.18 : 0) + (hasTech(region, 'ocean_going_sailing') ? 0.18 : 0));
  for (const [key,target] of Object.entries({ religiousSchools: religiousTarget, courtSchools: courtTarget, examinationService: examinationTarget, urbanAcademies: academyTarget, technicalSchools: technicalTarget })) {
    s.education[key] += (target - s.education[key]) * clamp(years * 0.13);
  }
  s.education.knowledgeCapacity = clamp(Math.max(s.education.religiousSchools, s.education.courtSchools, s.education.examinationService, s.education.urbanAcademies) * 0.55 + s.education.technicalSchools * 0.2 + (polity.administration?.recordKeeping || 0) * 0.25);

  // Education can reproduce capable officials without requiring a European university path.
  const admin = polity.administration;
  if (admin?.experience) {
    admin.experience.recordKeeping += s.education.knowledgeCapacity * years * 7;
    admin.experience.accounting += (s.education.examinationService + s.education.urbanAcademies) * years * 4;
    admin.experience.officialdom += (s.education.examinationService + s.education.courtSchools) * years * 5;
  }
  return s;
}

function ensureUrbanPlaces(region) {
  const s = ensureMedievalSociety(region);
  if (s.urban.council < 0.35 && s.urban.guilds < 0.4) return;
  const control = ensureSubregionalControl(region);
  if (s.urban.guilds >= 0.4 && !control.places.some(p => p.kind === 'guild_quarter')) {
    control.places.push({ id: `${region.id}:guild-quarter`, name: `${region.name} guild quarter`, kind: 'guild_quarter', population: Math.round((region.population || 0) * 0.025), strategicValue: 0.5, nativeControllerActorId: control.sovereignActorId, controllerActorId: control.sovereignActorId, occupationMode: 'civil', garrisonActorId: null, garrisonPersonnel: 0, contested: false, capturedTick: null });
  }
  if (s.urban.council >= 0.4 && !control.places.some(p => p.kind === 'civic_hall')) {
    control.places.push({ id: `${region.id}:civic-hall`, name: `${region.name} civic hall`, kind: 'civic_hall', population: 0, strategicValue: 0.68, nativeControllerActorId: control.sovereignActorId, controllerActorId: control.sovereignActorId, occupationMode: 'civil', garrisonActorId: null, garrisonPersonnel: 0, contested: false, capturedTick: null });
  }
}

function successionDeathChance(age, years) {
  const annual = age < 40 ? 0.008 : age < 55 ? 0.018 : age < 65 ? 0.045 : age < 75 ? 0.09 : 0.18;
  return 1 - Math.pow(1 - annual, years);
}

function claimantSupport(region, polity, claimant) {
  const local = ensureMedievalPoliticalState(region); const s = ensureMedievalSociety(region);
  const admin = polity.administration || {};
  if (claimant.kind === 'designated_heir') return clamp((admin.legitimacy || 0) * 0.42 + (admin.officialdom || 0) * 0.24 + (region.governance?.administrativeControl || 0) * 0.22 + (1 - local.grievance) * 0.12);
  if (claimant.kind === 'military_elite') return clamp(s.estates.privateRetinues * 0.34 + local.eliteOrganisation * 0.28 + local.localDefence * 0.2 + (1 - (admin.officialdom || 0)) * 0.18);
  return clamp(local.localIdentity * 0.34 + local.grievance * 0.3 + (region.governance?.autonomy || 0) * 0.2 + s.urban.council * 0.16);
}

function startSuccession(polity, regions, currentTick, rng) {
  const succession = ensureSuccessionState(polity);
  const territories = polityTerritories(polity, regions);
  if (!territories.length) return null;
  const claimants = [
    { id: `${polity.id}:heir:${succession.rulerGeneration+1}`, kind: 'designated_heir', legitimacy: clamp((polity.administration?.legitimacy || 0) + 0.12) },
    { id: `${polity.id}:military:${succession.rulerGeneration+1}`, kind: 'military_elite', legitimacy: clamp(0.25 + average(territories.map(r => ensureMedievalSociety(r).estates.privateRetinues)) * 0.45) },
    { id: `${polity.id}:provincial:${succession.rulerGeneration+1}`, kind: 'provincial_claimant', legitimacy: clamp(0.2 + average(territories.map(r => ensureMedievalPoliticalState(r).localIdentity)) * 0.4) },
  ];
  const support = new Map(claimants.map(c => [c.id, []]));
  for (const region of territories) {
    const scores = claimants.map(c => ({ c, score: claimantSupport(region, polity, c) * (0.92 + rng() * 0.16) })).sort((a,b)=>b.score-a.score);
    support.get(scores[0].c.id).push(region.id);
    region.successionAlignment = scores[0].c.id;
  }
  for (const c of claimants) c.supportRegionIds = support.get(c.id);
  claimants.sort((a,b)=>b.supportRegionIds.length-a.supportRegionIds.length);
  succession.claimants = claimants;
  // The designated heir inherits the existing court/state machinery by default.
  // Rival military or provincial blocs therefore have to break away from that
  // incumbent state rather than accidentally becoming the parent polity simply
  // because they hold more provinces at the instant the ruler dies.
  const incumbent = claimants.find(c => c.kind === 'designated_heir') || claimants[0];
  const viableRivals = claimants.filter(c => c.kind !== 'designated_heir' && c.supportRegionIds.length > 0)
    .sort((a,b) => b.supportRegionIds.length - a.supportRegionIds.length);
  const rivalSupport = viableRivals.reduce((sum, c) => sum + c.supportRegionIds.length, 0);
  const weakLegitimacyContest = (polity.administration?.legitimacy || 0) < 0.45 && territories.length >= 2 && rivalSupport >= 1;
  const contested = rivalSupport >= Math.max(1, territories.length * 0.22) || weakLegitimacyContest;
  succession.crisis = { startedTick: currentTick, leadingClaimantId: incumbent.id, contested, resolved: false };
  succession.lastSuccessionTick = currentTick;
  return { type: 'succession_crisis', polityId: polity.id, polityName: polity.name, claimants, contested: succession.crisis.contested };
}

function escalateCivilWar(polity, regions, polities, currentTick) {
  const crisis = polity.succession?.crisis;
  const claimants = polity.succession?.claimants || [];
  if (!crisis?.contested || crisis.escalated) return null;
  const rival = claimants.filter(c => c.kind !== 'designated_heir' && c.supportRegionIds?.length)
    .sort((a,b) => b.supportRegionIds.length - a.supportRegionIds.length)[0];
  if (!rival?.supportRegionIds?.length) return null;
  const capitalId = rival.supportRegionIds.find(id => id !== polity.capitalRegionId) || rival.supportRegionIds[0];
  const capital = regions.find(r => r.id === capitalId);
  if (!capital) return null;
  const localId = capital.governance?.localPolityId || capital.polityId;
  const claimantPolity = polities.find(p => p.id === localId);
  if (!claimantPolity || claimantPolity.id === polity.id) return null;
  claimantPolity.subjectToPolityId = null;
  claimantPolity.capitalRegionId = capital.id;
  claimantPolity.rulerRegionId = capital.id;
  claimantPolity.claimantOfPolityId = polity.id;
  claimantPolity.claimantId = rival.id;
  claimantPolity.administration ||= { legitimacy: 0.25, experience: {}, breakthroughs: new Set() };
  claimantPolity.administration.legitimacy = clamp(Math.max(claimantPolity.administration.legitimacy || 0, rival.legitimacy));
  for (const id of rival.supportRegionIds) {
    const region = regions.find(r => r.id === id);
    if (!region || region.id === polity.capitalRegionId) continue;
    region.governance.sovereignPolityId = claimantPolity.id;
    region.governance.relationship = region.id === capital.id ? 'core' : 'delegated';
    region.governance.administrativeControl = Math.min(region.governance.administrativeControl || 0.4, 0.55);
    region.controllingActorId = claimantPolity.id;
  }
  crisis.escalated = true;
  crisis.claimantPolityId = claimantPolity.id;
  linkSuccessionClaimant(polity, claimantPolity, rival, rival.supportRegionIds, regions, polities, currentTick);
  return { type: 'succession_civil_war', polityId: polity.id, claimantPolityId: claimantPolity.id, claimantId: rival.id, regionId: capital.id, regionName: capital.name };
}

export function tickMedievalStateSystems(polities, regions, currentTick, elapsedDays = 30, rng = Math.random) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR); const events = [];
  for (const polity of polities) {
    const territories = polityTerritories(polity, regions);
    if (!territories.length) continue;
    updatePathways(polity, territories, years);
    for (const region of territories) { updateRegionInstitutions(region, polity, years); ensureUrbanPlaces(region); }
    const succession = ensureSuccessionState(polity);
    succession.rulerAge += years; succession.rulerTenureYears += years;
    if (!succession.crisis && rng() < successionDeathChance(succession.rulerAge, years)) {
      const event = startSuccession(polity, regions, currentTick, rng); if (event) events.push(event);
    }
    if (succession.crisis?.contested && !succession.crisis.escalated && currentTick - succession.crisis.startedTick >= 8) {
      const event = escalateCivilWar(polity, regions, polities, currentTick); if (event) events.push(event);
    }
    if (succession.crisis?.escalated) {
      const continuityEvent = reconcileSuccessionContinuity(polity, polities, regions, currentTick);
      if (continuityEvent) events.push(continuityEvent);
    }
    if (succession.crisis && !succession.crisis.contested && currentTick - succession.crisis.startedTick >= 4) {
      succession.rulerGeneration += 1; succession.rulerAge = 18 + stableFraction(`${polity.id}:${succession.rulerGeneration}`) * 24; succession.rulerTenureYears = 0; succession.crisis.resolved = true; succession.crisis = null;
      polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) * 0.92 + 0.06);
      events.push({ type: 'succession_resolved', polityId: polity.id, polityName: polity.name });
    }
  }
  return events;
}
