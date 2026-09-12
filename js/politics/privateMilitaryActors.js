import { ORGANISATION_TYPES, ensureOrganisationWorld } from './nonStateOrganisations.js?v=20260912-organisations1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const DAYS_PER_YEAR = 365.2425;

export const PMC_MISSIONS = Object.freeze({
  campaign_support: { label: 'Campaign support', deniability: 0.22, costFactor: 1.0 },
  training: { label: 'Train local forces', deniability: 0.72, costFactor: 0.55 },
  resource_security: { label: 'Guard strategic resources', deniability: 0.82, costFactor: 0.5 },
  infrastructure_security: { label: 'Guard infrastructure', deniability: 0.78, costFactor: 0.48 },
  foreign_support: { label: 'Support aligned foreign government', deniability: 0.48, costFactor: 0.9 },
});

function ensureSet(v) { return v instanceof Set ? v : new Set(Array.isArray(v) ? v : []); }
function polityById(polities, id) { return polities.find((p) => p.id === id) || null; }
function capitalFor(polity, regions) { return polity ? regions.find((r) => r.id === polity.capitalRegionId) || null : null; }
function sovereignId(region) { return region?.governance?.sovereignPolityId || region?.polityId || null; }
function hasTech(region, id) {
  return Boolean(region?.breakthroughs?.has?.(id) || region?.technology?.breakthroughs?.has?.(id) ||
    region?.technology?.known?.has?.(id) || region?.technology?.[id] || region?.[id]);
}

function ensureActorState(org) {
  org.mercenaryContracts ||= [];
  org.pmcMissions ||= [];
  org.relations ||= {};
  org.memberPolityIds = ensureSet(org.memberPolityIds);
  if (org.type === 'private_military_company') {
    org.sponsorPolityId ||= org.notes?.sponsorPolityId || null;
    org.sponsorDependence = clamp(org.sponsorDependence ?? 0.75);
    org.equipmentAccess = clamp(org.equipmentAccess ?? 0.5);
    org.deniability = clamp(org.deniability ?? 0.6);
    org.authorisedClients = ensureSet(org.authorisedClients);
  }
  return org;
}

function chanceForDays(annual, days) {
  const a = clamp(annual);
  return 1 - Math.pow(1 - a, Math.max(0, days) / DAYS_PER_YEAR);
}

function sponsorCapability(polity, capital) {
  const admin = polity?.administration || {};
  const firearms = hasTech(capital, 'gunpowder') || hasTech(capital, 'firearms');
  const steel = hasTech(capital, 'steelmaking') || (capital?.stockpile?.steel || 0) > 0;
  const finance = clamp(Math.log1p(Math.max(0, capital?.treasury || 0)) / 7);
  return clamp((admin.officialdom || 0) * 0.28 + (admin.accounting || 0) * 0.22 +
    (admin.communications || 0) * 0.15 + finance * 0.18 + (firearms ? 0.12 : 0) + (steel ? 0.05 : 0));
}

export function maybeFoundPrivateMilitaryCompanies(regions, polities, world, currentTick, elapsedDays = 30, rng = Math.random) {
  ensureOrganisationWorld(world);
  const events = [];
  for (const polity of polities) {
    const capital = capitalFor(polity, regions);
    if (!capital) continue;
    const admin = polity.administration || {};
    const capability = sponsorCapability(polity, capital);
    if (capability < 0.66 || (admin.officialdom || 0) < 0.58 || (admin.accounting || 0) < 0.55 ||
        (capital.treasury || 0) < 220 || !(hasTech(capital, 'gunpowder') || hasTech(capital, 'firearms'))) continue;
    if (world.nonStateOrganisations.some((o) => o.active && o.type === 'private_military_company' && o.sponsorPolityId === polity.id)) continue;
    // Intentionally rare and institutionally late. Medieval states should almost never qualify.
    if (rng() >= chanceForDays(0.00022 * capability, elapsedDays)) continue;
    const id = `organisation_${world.nextOrganisationId++}`;
    const org = ensureActorState({
      id, actorId: `org:${id}`, type: 'private_military_company', name: `${capital.name} Security Group`,
      foundedTick: currentTick, active: true, treasury: 80, influence: 0.08, autonomy: 0.78, authority: 0.18,
      militaryCapacity: Math.max(140, (capital.army?.personnel || 0) * 0.035), commercialCapacity: 0.35,
      territorialShare: 0, memberRegionIds: new Set([capital.id]), memberPolityIds: new Set([polity.id]),
      hostRegionIds: new Set([capital.id]), sponsorPolityId: polity.id, sponsorDependence: 0.82,
      equipmentAccess: clamp(0.45 + capability * 0.45), deniability: 0.62, authorisedClients: new Set([polity.id]),
      pmcMissions: [], mercenaryContracts: [], relations: { [polity.id]: 0.65 }, notes: { sponsorPolityId: polity.id },
    });
    world.nonStateOrganisations.push(org);
    events.push({ type: 'pmc_founded', organisation: org, polityId: polity.id, regionId: capital.id });
  }
  return events;
}

export function assignMercenaryContractToCampaign(world, organisationId, polityId, campaignId) {
  const org = world?.nonStateOrganisations?.find((o) => o.id === organisationId && o.active);
  if (!org || org.type !== ORGANISATION_TYPES.MERCENARY_COMPANY) return { changed: false, reason: 'invalid_company' };
  ensureActorState(org);
  const contract = org.mercenaryContracts.find((c) => c.active && c.polityId === polityId);
  if (!contract) return { changed: false, reason: 'no_contract' };
  contract.assignedCampaignId = campaignId == null ? null : Number(campaignId);
  return { changed: true, contract };
}

export function assignPmcMission(world, organisationId, sponsorPolityId, missionType, targetId, options = {}) {
  const org = world?.nonStateOrganisations?.find((o) => o.id === organisationId && o.active);
  if (!org || org.type !== 'private_military_company') return { changed: false, reason: 'invalid_pmc' };
  ensureActorState(org);
  if (org.sponsorPolityId !== sponsorPolityId) return { changed: false, reason: 'not_sponsor' };
  if (!PMC_MISSIONS[missionType]) return { changed: false, reason: 'invalid_mission' };
  const personnel = Math.max(40, Math.min(Math.floor(org.militaryCapacity * 0.7), Math.floor(options.personnel || org.militaryCapacity * 0.35)));
  const mission = {
    id: `${org.id}:mission:${(org.pmcMissions.length + 1)}`,
    type: missionType, targetId, personnel, active: true, startedTick: options.currentTick || 0,
    exposure: 0, monthlyCost: Math.max(2, personnel * 0.006 * PMC_MISSIONS[missionType].costFactor),
  };
  org.pmcMissions.push(mission);
  return { changed: true, mission };
}

export function endPmcMission(world, organisationId, missionId) {
  const org = world?.nonStateOrganisations?.find((o) => o.id === organisationId && o.active);
  const mission = org?.pmcMissions?.find((m) => m.id === missionId && m.active);
  if (!mission) return { changed: false, reason: 'mission_not_found' };
  mission.active = false;
  mission.endedReason = 'recalled';
  return { changed: true };
}

export function revokePmcSponsorship(world, organisationId, polityId) {
  const org = world?.nonStateOrganisations?.find((o) => o.id === organisationId && o.active);
  if (!org || org.type !== 'private_military_company' || org.sponsorPolityId !== polityId) return { changed: false, reason: 'not_sponsor' };
  org.sponsorPolityId = null;
  org.sponsorDependence = clamp(org.sponsorDependence + 0.08);
  org.equipmentAccess *= 0.45;
  org.relations[polityId] = -0.35;
  for (const mission of org.pmcMissions || []) mission.active = false;
  return { changed: true };
}

export function authorisePmcClient(world, organisationId, sponsorPolityId, clientPolityId, allowed = true) {
  const org = world?.nonStateOrganisations?.find((o) => o.id === organisationId && o.active);
  if (!org || org.type !== 'private_military_company' || org.sponsorPolityId !== sponsorPolityId) return { changed: false, reason: 'not_sponsor' };
  ensureActorState(org);
  if (allowed) org.authorisedClients.add(clientPolityId); else org.authorisedClients.delete(clientPolityId);
  return { changed: true };
}

export function campaignExternalSupport(campaign, world) {
  if (!campaign || !world?.nonStateOrganisations) return { personnel: 0, mercenaryPersonnel: 0, pmcPersonnel: 0, quality: 1 };
  let mercenaryPersonnel = 0;
  let pmcPersonnel = 0;
  let qualityWeighted = 0;
  for (const org of world.nonStateOrganisations) {
    if (!org.active) continue;
    ensureActorState(org);
    if (org.type === ORGANISATION_TYPES.MERCENARY_COMPANY) {
      for (const c of org.mercenaryContracts) {
        if (c.active && Number(c.assignedCampaignId) === Number(campaign.id)) {
          const p = Math.max(0, Math.min(c.personnel || 0, org.militaryCapacity || 0));
          mercenaryPersonnel += p; qualityWeighted += p;
        }
      }
    } else if (org.type === 'private_military_company') {
      for (const m of org.pmcMissions) {
        if (m.active && m.type === 'campaign_support' && Number(m.targetId) === Number(campaign.id)) {
          const p = Math.max(0, Math.min(m.personnel || 0, org.militaryCapacity || 0));
          pmcPersonnel += p; qualityWeighted += p * (0.9 + org.equipmentAccess * 0.35);
        }
      }
    }
  }
  const personnel = mercenaryPersonnel + pmcPersonnel;
  return { personnel, mercenaryPersonnel, pmcPersonnel, quality: personnel ? qualityWeighted / personnel : 1 };
}

export function applyExternalCampaignLosses(campaign, world, lossRate) {
  if (!world?.nonStateOrganisations || lossRate <= 0) return 0;
  let losses = 0;
  for (const org of world.nonStateOrganisations) {
    if (!org.active) continue;
    ensureActorState(org);
    let committed = 0;
    for (const c of org.mercenaryContracts || []) if (c.active && Number(c.assignedCampaignId) === Number(campaign.id)) committed += c.personnel || 0;
    for (const m of org.pmcMissions || []) if (m.active && m.type === 'campaign_support' && Number(m.targetId) === Number(campaign.id)) committed += m.personnel || 0;
    if (!committed) continue;
    const lost = Math.min(committed, Math.round(committed * clamp(lossRate, 0, 0.35)));
    losses += lost;
    org.militaryCapacity = Math.max(0, (org.militaryCapacity || 0) - lost);
    let remaining = lost;
    for (const c of org.mercenaryContracts || []) {
      if (remaining <= 0 || !c.active || Number(c.assignedCampaignId) !== Number(campaign.id)) continue;
      const take = Math.min(c.personnel || 0, remaining); c.personnel -= take; remaining -= take;
    }
    for (const m of org.pmcMissions || []) {
      if (remaining <= 0 || !m.active || m.type !== 'campaign_support' || Number(m.targetId) !== Number(campaign.id)) continue;
      const take = Math.min(m.personnel || 0, remaining); m.personnel -= take; remaining -= take;
    }
  }
  campaign.nonStateCasualties = (campaign.nonStateCasualties || 0) + losses;
  return losses;
}

export function tickPrivateMilitaryActors(regions, polities, world, activeCampaigns, currentTick, elapsedDays = 30, rng = Math.random) {
  ensureOrganisationWorld(world);
  const events = maybeFoundPrivateMilitaryCompanies(regions, polities, world, currentTick, elapsedDays, rng);
  const politiesById = new Map(polities.map((p) => [p.id, p]));
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  for (const region of regions) {
    region.nonStateSupport ||= {};
    region.nonStateSupport.pmcPersonnel = 0;
    region.nonStateSupport.trainingBonus = 0;
    region.nonStateSupport.securityBonus = 0;
  }
  for (const org of world.nonStateOrganisations) {
    if (!org.active || org.type !== 'private_military_company') continue;
    ensureActorState(org);
    const sponsor = polityById(polities, org.sponsorPolityId);
    const capital = capitalFor(sponsor, regions);
    if (sponsor && capital) {
      const capability = sponsorCapability(sponsor, capital);
      org.equipmentAccess = clamp(org.equipmentAccess * 0.985 + capability * 0.015);
      const retainer = Math.max(1.5, (org.militaryCapacity || 0) * 0.0015 * elapsedDays / 30);
      if ((capital.treasury || 0) >= retainer) { capital.treasury -= retainer; org.treasury += retainer; }
      else org.equipmentAccess *= Math.pow(0.97, elapsedDays / 30);
    } else {
      org.equipmentAccess *= Math.pow(0.94, elapsedDays / 30);
      org.militaryCapacity *= Math.pow(0.995, elapsedDays / 30);
    }

    for (const mission of org.pmcMissions) {
      if (!mission.active) continue;
      const sponsorCapital = capital;
      const due = mission.monthlyCost * elapsedDays / 30;
      if (sponsorCapital && (sponsorCapital.treasury || 0) >= due) { sponsorCapital.treasury -= due; org.treasury += due; }
      else { mission.active = false; mission.endedReason = 'unfunded'; continue; }
      const profile = PMC_MISSIONS[mission.type];
      mission.exposure = clamp(mission.exposure + (1 - profile.deniability * org.deniability) * 0.002 * elapsedDays / 30);
      if (mission.type === 'campaign_support') {
        if (!activeCampaigns.some((c) => Number(c.id) === Number(mission.targetId) && !c.completed)) { mission.active = false; mission.endedReason = 'campaign_ended'; }
        continue;
      }
      const target = regionsById.get(mission.targetId);
      if (!target) { mission.active = false; mission.endedReason = 'target_lost'; continue; }
      target.nonStateSupport ||= {};
      if (mission.type === 'training') target.nonStateSupport.trainingBonus = Math.max(target.nonStateSupport.trainingBonus || 0, clamp(mission.personnel / 1200) * 0.18);
      if (mission.type === 'resource_security' || mission.type === 'infrastructure_security') {
        target.nonStateSupport.securityBonus = Math.max(target.nonStateSupport.securityBonus || 0, clamp(mission.personnel / 900) * 0.22);
        target.stability = clamp((target.stability ?? 0.7) + 0.00025 * elapsedDays / 30);
      }
      if (mission.type === 'foreign_support') target.nonStateSupport.pmcPersonnel += mission.personnel;
      if (mission.exposure > 0.5 && rng() < 0.002 * elapsedDays / 30) {
        const sponsorAdmin = sponsor?.administration;
        if (sponsorAdmin) sponsorAdmin.legitimacy = clamp((sponsorAdmin.legitimacy || 0) - 0.012);
        events.push({ type: 'pmc_mission_exposed', organisation: org, mission, polityId: org.sponsorPolityId, regionId: target.id });
        mission.exposure *= 0.65;
      }
    }
  }
  return events;
}

export function privateMilitaryActions(world, polityId, activeCampaigns = []) {
  ensureOrganisationWorld(world);
  return world.nonStateOrganisations.filter((o) => o.active && [ORGANISATION_TYPES.MERCENARY_COMPANY, 'private_military_company'].includes(o.type)).map((org) => {
    ensureActorState(org);
    const contract = org.mercenaryContracts?.find((c) => c.active && c.polityId === polityId) || null;
    return {
      organisation: org,
      contract,
      isSponsor: org.type === 'private_military_company' && org.sponsorPolityId === polityId,
      assignableCampaigns: contract ? activeCampaigns.filter((c) => !c.completed) : [],
      activeMissions: org.pmcMissions?.filter((m) => m.active) || [],
    };
  });
}
