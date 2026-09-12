import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260912-medieval-politics1';
import { ORGANISATION_TYPES, ensureOrganisationWorld } from './nonStateOrganisations.js?v=20260912-organisations1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const DAYS_PER_YEAR = 365.2425;

function ensureSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

function ensureInteractionState(organisation) {
  organisation.recognisedByPolityIds = ensureSet(organisation.recognisedByPolityIds);
  organisation.toleratedByPolityIds = ensureSet(organisation.toleratedByPolityIds);
  organisation.charterPrivileges ||= {};
  organisation.mercenaryContracts ||= [];
  organisation.memberContributions ||= {};
  organisation.votes ||= [];
  organisation.relations ||= {};
  return organisation;
}

function polityById(polities, id) {
  return polities.find((polity) => polity.id === id) || null;
}

function capitalFor(polity, regions) {
  return polity ? regions.find((region) => region.id === polity.capitalRegionId) || null : null;
}

function organisationById(world, id) {
  ensureOrganisationWorld(world);
  const organisation = world.nonStateOrganisations.find((item) => item.id === id && item.active);
  return organisation ? ensureInteractionState(organisation) : null;
}

function localSovereign(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || null;
}

function organisationHostRegion(organisation, regions) {
  for (const id of organisation.hostRegionIds || []) {
    const region = regions.find((item) => item.id === id);
    if (region) return region;
  }
  return null;
}

function restoreOrganisationPlaces(organisation, regions) {
  for (const regionId of organisation.hostRegionIds || []) {
    const region = regions.find((item) => item.id === regionId);
    if (!region) continue;
    const control = ensureSubregionalControl(region);
    for (const place of control.places) {
      if (place.controllerActorId !== organisation.actorId) continue;
      const sovereign = control.sovereignActorId || localSovereign(region) || region.id;
      place.controllerActorId = sovereign;
      place.nativeControllerActorId ||= sovereign;
      place.occupationMode = 'sovereign';
      place.garrisonActorId = null;
      place.garrisonPersonnel = 0;
    }
  }
}

export function contractedMercenaryPersonnel(region) {
  return Math.max(0, Number(region?.nonStateSupport?.mercenaryPersonnel) || 0);
}

function rebuildMercenarySupport(regions, world) {
  for (const region of regions) {
    region.nonStateSupport ||= {};
    region.nonStateSupport.mercenaryPersonnel = 0;
  }
  for (const organisation of world.nonStateOrganisations || []) {
    if (!organisation.active || organisation.type !== ORGANISATION_TYPES.MERCENARY_COMPANY) continue;
    ensureInteractionState(organisation);
    for (const contract of organisation.mercenaryContracts) {
      if (!contract.active) continue;
      const region = regions.find((item) => item.id === contract.regionId);
      if (!region) continue;
      region.nonStateSupport ||= {};
      region.nonStateSupport.mercenaryPersonnel += Math.max(0, Number(contract.personnel) || 0);
    }
  }
}

export function hireMercenaryCompany(world, organisationId, polityId, regionId, regions, polities, personnel, currentTick) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  const region = regions.find((item) => item.id === regionId);
  if (!organisation || organisation.type !== ORGANISATION_TYPES.MERCENARY_COMPANY || !polity || !region) return { changed: false, reason: 'invalid_contract' };
  if (localSovereign(region) !== polity.id) return { changed: false, reason: 'not_your_region' };
  const already = organisation.mercenaryContracts.find((contract) => contract.active && contract.polityId === polityId);
  if (already) return { changed: false, reason: 'already_hired' };
  const available = Math.floor(Math.max(0, organisation.militaryCapacity || 0) * 0.8);
  const amount = Math.min(available, Math.max(50, Math.floor(Number(personnel) || 0)));
  if (amount < 50) return { changed: false, reason: 'insufficient_company_strength' };
  const signingCost = Math.max(8, amount * 0.018);
  const monthlyCost = Math.max(3, amount * 0.0075);
  const capital = capitalFor(polity, regions);
  if (!capital || (capital.treasury || 0) < signingCost) return { changed: false, reason: 'insufficient_treasury', cost: signingCost };
  capital.treasury -= signingCost;
  organisation.treasury += signingCost;
  const contract = { polityId, regionId, personnel: amount, monthlyCost, active: true, signedTick: currentTick, arrears: 0 };
  organisation.mercenaryContracts.push(contract);
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) + 0.08, -1, 1);
  rebuildMercenarySupport(regions, world);
  return { changed: true, contract, signingCost, monthlyCost };
}

export function dismissMercenaryCompany(world, organisationId, polityId, regions) {
  const organisation = organisationById(world, organisationId);
  const contract = organisation?.mercenaryContracts?.find((item) => item.active && item.polityId === polityId);
  if (!contract) return { changed: false, reason: 'no_contract' };
  contract.active = false;
  contract.endedReason = 'dismissed';
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) - 0.04, -1, 1);
  rebuildMercenarySupport(regions, world);
  return { changed: true };
}

export function grantCompanyCharter(world, organisationId, polityId, regions, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || organisation.type !== ORGANISATION_TYPES.CHARTERED_COMPANY || !polity) return { changed: false, reason: 'invalid_company' };
  if (organisation.charteringPolityId && organisation.charteringPolityId !== polityId) return { changed: false, reason: 'already_chartered_elsewhere' };
  const capital = capitalFor(polity, regions);
  if (!capital || (capital.treasury || 0) < 40) return { changed: false, reason: 'insufficient_treasury' };
  capital.treasury -= 40;
  organisation.treasury += 40;
  organisation.charteringPolityId = polityId;
  organisation.memberPolityIds.add(polityId);
  organisation.charterPrivileges[polityId] = { tradeMonopoly: true, treatyAuthority: true, fortificationRights: true, granted: true };
  organisation.authority = clamp(organisation.authority + 0.12);
  organisation.autonomy = clamp(organisation.autonomy + 0.08);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.015);
  return { changed: true };
}

export function revokeCompanyCharter(world, organisationId, polityId, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || organisation.charteringPolityId !== polityId || !polity) return { changed: false, reason: 'not_charterer' };
  organisation.charteringPolityId = null;
  delete organisation.charterPrivileges[polityId];
  organisation.authority = clamp(organisation.authority - 0.10);
  organisation.autonomy = clamp(organisation.autonomy - 0.06);
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) - 0.25, -1, 1);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.01);
  return { changed: true };
}

export function recogniseFreeCity(world, organisationId, polityId, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || organisation.type !== ORGANISATION_TYPES.FREE_CITY || !polity) return { changed: false, reason: 'invalid_free_city' };
  if (organisation.recognisedByPolityIds.has(polityId)) return { changed: false, reason: 'already_recognised' };
  organisation.recognisedByPolityIds.add(polityId);
  organisation.autonomy = clamp(organisation.autonomy + 0.05);
  organisation.influence += 0.03;
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) + 0.18, -1, 1);
  if (organisation.memberPolityIds.has(polityId)) polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.01);
  return { changed: true };
}

export function toleratePirateHaven(world, organisationId, polityId, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || organisation.type !== ORGANISATION_TYPES.PIRATE_HAVEN || !polity) return { changed: false, reason: 'invalid_pirate_haven' };
  organisation.toleratedByPolityIds.add(polityId);
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) + 0.15, -1, 1);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.025);
  return { changed: true };
}

export function suppressPirateHaven(world, organisationId, polityId, regions, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || organisation.type !== ORGANISATION_TYPES.PIRATE_HAVEN || !polity) return { changed: false, reason: 'invalid_pirate_haven' };
  const host = organisationHostRegion(organisation, regions);
  if (!host || localSovereign(host) !== polityId) return { changed: false, reason: 'not_host_sovereign' };
  const stateForces = Math.max(0, Number(host.army?.personnel) || 0) + Math.max(0, Number(host.navy?.personnel) || 0) * 0.6;
  const piratePower = Math.max(50, Number(organisation.militaryCapacity) || 0);
  const cost = Math.max(8, piratePower * 0.025);
  if ((host.treasury || 0) < cost) return { changed: false, reason: 'insufficient_treasury', cost };
  host.treasury -= cost;
  const ratio = stateForces / piratePower;
  if (ratio < 1.25) {
    organisation.militaryCapacity *= 0.9;
    host.stability = clamp((host.stability ?? 0.7) - 0.035);
    organisation.relations[polityId] = -0.8;
    return { changed: true, suppressed: false, ratio };
  }
  organisation.active = false;
  organisation.endedReason = 'suppressed';
  restoreOrganisationPlaces(organisation, regions);
  host.stability = clamp((host.stability ?? 0.7) + 0.025);
  return { changed: true, suppressed: true, ratio };
}

export function joinOrganisation(world, organisationId, polityId, polities) {
  const organisation = organisationById(world, organisationId);
  const polity = polityById(polities, polityId);
  if (!organisation || !polity || ![ORGANISATION_TYPES.MERCHANT_LEAGUE, ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type)) return { changed: false, reason: 'not_joinable' };
  if (organisation.memberPolityIds.has(polityId)) return { changed: false, reason: 'already_member' };
  if (organisation.type !== ORGANISATION_TYPES.MERCHANT_LEAGUE) {
    const admin = polity.administration || {};
    if ((admin.legitimacy || 0) < 0.55 || (admin.communications || 0) < 0.45) return { changed: false, reason: 'institutions_too_weak' };
  }
  organisation.memberPolityIds.add(polityId);
  organisation.influence += 0.02;
  organisation.relations[polityId] = 0.2;
  return { changed: true };
}

export function leaveOrganisation(world, organisationId, polityId) {
  const organisation = organisationById(world, organisationId);
  if (!organisation?.memberPolityIds?.has(polityId)) return { changed: false, reason: 'not_member' };
  if (organisation.type === ORGANISATION_TYPES.SUPRANATIONAL_UNION && organisation.pooledSovereignty > 0.55) {
    organisation.notes ||= {};
    organisation.notes.exitCrises ||= {};
    organisation.notes.exitCrises[polityId] = true;
    organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) - 0.4, -1, 1);
    return { changed: false, reason: 'exit_requires_negotiation', crisis: true };
  }
  organisation.memberPolityIds.delete(polityId);
  organisation.relations[polityId] = clamp((organisation.relations[polityId] || 0) - 0.16, -1, 1);
  organisation.authority = clamp(organisation.authority - 0.025);
  return { changed: true };
}

export function votePooledAuthority(world, organisationId, polityId, support, polities, rng = Math.random) {
  const organisation = organisationById(world, organisationId);
  if (!organisation || ![ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type) || !organisation.memberPolityIds.has(polityId)) return { changed: false, reason: 'not_voting_member' };
  const members = [...organisation.memberPolityIds].map((id) => polityById(polities, id)).filter(Boolean);
  if (members.length < 3) return { changed: false, reason: 'too_few_members' };
  let yes = support ? 1 : 0;
  let total = 1;
  for (const member of members) {
    if (member.id === polityId) continue;
    const admin = member.administration || {};
    const institutionalConfidence = clamp((admin.legitimacy || 0) * 0.35 + (admin.officialdom || 0) * 0.3 + (admin.communications || 0) * 0.2 + organisation.authority * 0.15);
    const reluctance = organisation.pooledSovereignty * 0.35;
    if (rng() < clamp(0.18 + institutionalConfidence * 0.65 - reluctance)) yes += 1;
    total += 1;
  }
  const passed = yes / total >= 0.6;
  const delta = organisation.type === ORGANISATION_TYPES.SUPRANATIONAL_UNION ? 0.035 : 0.02;
  if (passed) {
    organisation.pooledSovereignty = clamp(organisation.pooledSovereignty + delta);
    organisation.authority = clamp(organisation.authority + delta * 0.65);
  } else {
    organisation.authority = clamp(organisation.authority - 0.01);
  }
  const vote = { polityId, support: Boolean(support), yes, total, passed, pooledSovereignty: organisation.pooledSovereignty };
  organisation.votes.push(vote);
  if (organisation.votes.length > 20) organisation.votes.shift();
  return { changed: true, ...vote };
}

export function organisationActions(world, polityId, regions, polities) {
  ensureOrganisationWorld(world);
  return world.nonStateOrganisations.filter((organisation) => organisation.active).map((organisation) => {
    ensureInteractionState(organisation);
    const host = organisationHostRegion(organisation, regions);
    const isHostSovereign = host && localSovereign(host) === polityId;
    const isMember = organisation.memberPolityIds.has(polityId);
    const contract = organisation.mercenaryContracts.find((item) => item.active && item.polityId === polityId);
    return {
      organisation,
      host,
      isHostSovereign,
      isMember,
      contract,
      canHire: organisation.type === ORGANISATION_TYPES.MERCENARY_COMPANY && !contract,
      canDismiss: Boolean(contract),
      canRecognise: organisation.type === ORGANISATION_TYPES.FREE_CITY && !organisation.recognisedByPolityIds.has(polityId),
      canTolerate: organisation.type === ORGANISATION_TYPES.PIRATE_HAVEN && isHostSovereign && !organisation.toleratedByPolityIds.has(polityId),
      canSuppress: organisation.type === ORGANISATION_TYPES.PIRATE_HAVEN && isHostSovereign,
      canGrantCharter: organisation.type === ORGANISATION_TYPES.CHARTERED_COMPANY && (!organisation.charteringPolityId || organisation.charteringPolityId === polityId),
      canRevokeCharter: organisation.type === ORGANISATION_TYPES.CHARTERED_COMPANY && organisation.charteringPolityId === polityId,
      canJoin: [ORGANISATION_TYPES.MERCHANT_LEAGUE, ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type) && !isMember,
      canLeave: [ORGANISATION_TYPES.MERCHANT_LEAGUE, ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type) && isMember,
      canVote: [ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type) && isMember,
    };
  });
}

export function tickOrganisationInteractions(regions, polities, world, elapsedDays = 30) {
  ensureOrganisationWorld(world);
  const events = [];
  const monthScale = Math.max(0, elapsedDays) / 30;
  for (const organisation of world.nonStateOrganisations) {
    if (!organisation.active) continue;
    ensureInteractionState(organisation);
    for (const contract of organisation.mercenaryContracts) {
      if (!contract.active) continue;
      const polity = polityById(polities, contract.polityId);
      const capital = capitalFor(polity, regions);
      const due = contract.monthlyCost * monthScale;
      if (capital && (capital.treasury || 0) >= due) {
        capital.treasury -= due;
        organisation.treasury += due;
        contract.arrears = Math.max(0, contract.arrears - elapsedDays);
      } else {
        contract.arrears += elapsedDays;
        if (contract.arrears >= 60) {
          contract.active = false;
          contract.endedReason = 'unpaid';
          organisation.relations[contract.polityId] = clamp((organisation.relations[contract.polityId] || 0) - 0.25, -1, 1);
          events.push({ type: 'mercenary_contract_ended', organisation, polityId: contract.polityId, regionId: contract.regionId, reason: 'unpaid' });
        }
      }
    }

    if ([ORGANISATION_TYPES.MERCHANT_LEAGUE, ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type)) {
      for (const polityId of organisation.memberPolityIds) {
        const polity = polityById(polities, polityId);
        const capital = capitalFor(polity, regions);
        if (!capital) continue;
        const due = Math.max(0.15, organisation.authority * 1.5) * monthScale;
        if ((capital.treasury || 0) >= due) {
          capital.treasury -= due;
          organisation.treasury += due;
          organisation.memberContributions[polityId] = (organisation.memberContributions[polityId] || 0) + due;
          if (organisation.type === ORGANISATION_TYPES.MERCHANT_LEAGUE) capital.wallet = Math.max(0, Number(capital.wallet) || 0) + organisation.commercialCapacity * 0.04 * monthScale;
        }
      }
    }

    if (organisation.type === ORGANISATION_TYPES.PIRATE_HAVEN) {
      for (const polityId of organisation.toleratedByPolityIds) {
        const polity = polityById(polities, polityId);
        const capital = capitalFor(polity, regions);
        if (!capital) continue;
        const tribute = Math.min(organisation.treasury * 0.004 * monthScale, 2 * monthScale);
        organisation.treasury -= tribute;
        capital.treasury = Math.max(0, Number(capital.treasury) || 0) + tribute;
      }
    }
  }
  rebuildMercenarySupport(regions, world);
  return events;
}
