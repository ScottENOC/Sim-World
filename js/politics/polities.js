import { centroidDistanceKm } from '../world/distance.js?v=20260904-kingdom1';
import { effectivePower } from '../military/army.js?v=20260904-kingdom1';
import { attitudeToward, changeAttitude } from '../diplomacy/relations.js?v=20260904-kingdom1';
import { learnAbout } from '../core/knowledge.js?v=20260904-kingdom1';

const EXPERIENCE_SCALE = {
  recordKeeping: 1200,
  accounting: 1000,
  communications: 1300,
  officialdom: 700,
  delegation: 650,
};
const BASE_TRIBUTE_PER_PERSON = 0.00035;
const CONTROL_ADJUSTMENT_RATE = 1 / 52;
const THREAT_MEMORY_WEEKS = 52;

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function capability(experience, scale) {
  return clamp(1 - Math.exp(-Math.max(0, experience) / scale));
}

function stableFraction(text) {
  let hash = 2166136261;
  for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

export function initialisePolities(regions) {
  const polities = [];
  for (const region of regions) {
    const polity = {
      id: `polity_${region.id}`,
      name: `${region.name} polity`,
      capitalRegionId: region.id,
      rulerRegionId: region.id,
      subjectToPolityId: null,
      formedTick: 0,
      kingdomSinceTick: null,
      administration: {
        experience: { recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0 },
        recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0,
        legitimacy: 0.2,
        breakthroughs: new Set(),
      },
      report: { tributeReceived: 0, subjectCount: 0, administrativeLoad: 0, administrativeCapacity: 0 },
    };
    polities.push(polity);
    region.polityId = polity.id;
    region.governance = {
      sovereignPolityId: polity.id,
      localPolityId: polity.id,
      localRulerId: region.id,
      governorId: null,
      governor: null,
      delegatedPowers: { collectTaxes: false, commandArmy: false, appointOfficials: false, judgeDisputes: false },
      relationship: 'core',
      autonomy: 0,
      administrativeControl: 1,
      tributeRate: 0,
      militaryObligation: 0,
      militaryPassage: true,
      reportDelayWeeks: 0,
      corruption: 0,
      startTick: 0,
      tributeDelivered: 0,
      levyHistory: { sent: 0, returned: 0, campaigns: 0 },
    };
    region.militaryThreat = { lastRaidedTick: null, recentRaids: 0 };
  }
  return polities;
}

export function polityById(polities, id) {
  return polities.find((polity) => polity.id === id) || null;
}

export function sovereignPolity(region, polities) {
  return polityById(polities, region?.governance?.sovereignPolityId || region?.polityId);
}

export function polityTerritories(polity, regions) {
  return regions.filter((region) => region.governance?.sovereignPolityId === polity.id);
}

export function subjectRegionsFor(overlordRegion, regions, polities) {
  const polity = sovereignPolity(overlordRegion, polities);
  if (!polity || polity.capitalRegionId !== overlordRegion.id) return [];
  return polityTerritories(polity, regions).filter((region) => region.id !== polity.capitalRegionId);
}

export function governanceLabel(region) {
  const relationship = region.governance?.relationship || 'independent';
  return ({ core: 'capital', tributary: 'tributary', vassal: 'subordinate ruler', delegated: 'delegated province', integrated: 'integrated province' })[relationship] || relationship;
}

export function canDemandVassalage(overlord, target, polities, toolTypes) {
  if (!overlord || !target || overlord.id === target.id) return { possible: false, reason: 'same_region' };
  if (target.governance?.relationship !== 'core') return { possible: false, reason: 'already_subject' };
  const overlordPolity = sovereignPolity(overlord, polities);
  if (!overlordPolity || overlordPolity.capitalRegionId !== overlord.id) return { possible: false, reason: 'not_capital' };
  const ownPower = effectivePower(overlord, toolTypes) + overlord.population * 0.001 + 1;
  const targetPower = effectivePower(target, toolTypes) + target.population * 0.001 + 1;
  const ratio = ownPower / targetPower;
  if (ratio < 1.8) return { possible: false, reason: 'insufficient_power', ratio };
  return { possible: true, ratio };
}

export function demandVassalage(overlord, target, polities, toolTypes, currentTick, regions = []) {
  const check = canDemandVassalage(overlord, target, polities, toolTypes);
  if (!check.possible) return { accepted: false, ...check };
  const overlordPolity = sovereignPolity(overlord, polities);
  const targetPolity = sovereignPolity(target, polities);
  const attitude = attitudeToward(target, overlord.id);
  const acceptanceThreshold = 1.8 + Math.max(0, -attitude) * 0.6;
  if (check.ratio < acceptanceThreshold) {
    changeAttitude(target, overlord.id, -0.15, 'refused_vassalage', currentTick);
    return { accepted: false, reason: 'refused', ratio: check.ratio };
  }

  target.governance = {
    ...target.governance,
    sovereignPolityId: overlordPolity.id,
    localPolityId: targetPolity?.id || target.polityId,
    localRulerId: target.id,
    governorId: `local_ruler_${target.id}`,
    governor: {
      id: `local_ruler_${target.id}`,
      type: 'local_ruler',
      competence: 0.35 + stableFraction(target.id) * 0.4,
      loyalty: clamp(0.45 + attitude * 0.3),
      localLegitimacy: 0.8,
    },
    delegatedPowers: { collectTaxes: true, commandArmy: true, appointOfficials: true, judgeDisputes: true },
    relationship: 'vassal',
    autonomy: 0.88,
    administrativeControl: 0.12,
    tributeRate: 0.08,
    militaryObligation: 0.5,
    militaryPassage: true,
    reportDelayWeeks: 12,
    corruption: 0.7,
    startTick: currentTick,
    nextReportTick: currentTick + 12,
    lastReport: null,
    tributeDelivered: 0,
    levyHistory: target.governance?.levyHistory || { sent: 0, returned: 0, campaigns: 0 },
  };
  target.controllingActorId = overlordPolity.capitalRegionId;
  if (targetPolity) targetPolity.subjectToPolityId = overlordPolity.id;
  const byId = new Map(regions.map((region) => [region.id, region]));
  for (const neighbourId of target.neighbors || []) {
    const neighbour = byId.get(neighbourId);
    if (neighbour) learnAbout(overlord, neighbour, 0.4, currentTick);
  }
  changeAttitude(target, overlord.id, -0.25, 'submitted_to_overlord', currentTick);
  return { accepted: true, ratio: check.ratio, polity: overlordPolity, region: target };
}

export function setGovernancePolicy(region, policy, value) {
  if (!region?.governance || region.governance.relationship === 'core') return false;
  if (policy === 'tributeRate') region.governance.tributeRate = clamp(Number(value), 0, 0.25);
  else if (policy === 'militaryObligation') region.governance.militaryObligation = clamp(Number(value), 0, 0.8);
  else if (policy === 'autonomy') region.governance.autonomy = clamp(Number(value), 0.1, 0.98);
  else return false;
  return true;
}

export function governanceFormAvailability(region, polity) {
  const admin = polity?.administration;
  return {
    vassal: true,
    delegated: Boolean(admin && admin.officialdom >= 0.25 && admin.delegation >= 0.2),
    integrated: Boolean(admin && admin.breakthroughs.has('palace_archives') &&
      admin.officialdom >= 0.5 && region.governance.administrativeControl >= 0.5),
  };
}

export function changeGovernanceForm(region, form, polity) {
  if (!region?.governance || region.governance.relationship === 'core') return { changed: false, reason: 'not_subject' };
  const available = governanceFormAvailability(region, polity);
  if (!available[form]) return { changed: false, reason: 'insufficient_administration' };
  region.governance.relationship = form;
  if (form === 'vassal') {
    region.governance.autonomy = Math.max(region.governance.autonomy, 0.75);
    region.governance.governor.type = 'local_ruler';
  } else if (form === 'delegated') {
    region.governance.autonomy = Math.min(region.governance.autonomy, 0.65);
    region.governance.governorId = `royal_governor_${region.id}`;
    region.governance.governor = {
      id: region.governance.governorId,
      type: 'royal_governor',
      competence: 0.45 + polity.administration.officialdom * 0.35,
      loyalty: 0.65 + polity.administration.legitimacy * 0.25,
      localLegitimacy: 0.35,
    };
  } else if (form === 'integrated') {
    region.governance.autonomy = Math.min(region.governance.autonomy, 0.35);
    region.governance.governor.type = 'royal_governor';
  }
  return { changed: true };
}

export function setDelegatedPower(region, power, enabled) {
  if (!region?.governance?.delegatedPowers || !(power in region.governance.delegatedPowers)) return false;
  region.governance.delegatedPowers[power] = Boolean(enabled);
  return true;
}

function updateCapabilities(polity, capital, subjects) {
  const admin = polity.administration;
  const exp = admin.experience;
  const trade = Math.max(0, capital.tradeEconomy?.weeklyExports || 0);
  const revenue = Math.max(0, capital.militaryFinance?.weeklyTaxRevenue || 0) +
    Math.max(0, polity.report.tributeReceived || 0);
  exp.recordKeeping += 0.2 + Math.log1p(trade + revenue) * 0.06 + subjects.length * 0.08;
  exp.accounting += 0.12 + Math.log1p(revenue) * 0.08 + subjects.length * 0.05;
  exp.communications += 0.1 + Math.log1p(capital.tradeEconomy?.weeklyImports || 0) * 0.04 + subjects.length * 0.1;
  exp.officialdom += 0.05 + subjects.length * 0.18 +
    subjects.reduce((sum, region) => sum + region.governance.administrativeControl, 0) * 0.12;
  exp.delegation += subjects.reduce((sum, region) => sum + region.governance.autonomy, 0) * 0.25;

  for (const key of Object.keys(EXPERIENCE_SCALE)) admin[key] = capability(exp[key], EXPERIENCE_SCALE[key]);
  admin.legitimacy = clamp(admin.legitimacy * 0.995 + capital.stability * 0.003 +
    Math.min(0.002, subjects.length * 0.0003));

  if (admin.accounting >= 0.2) admin.breakthroughs.add('standard_measures');
  if (admin.communications >= 0.25) admin.breakthroughs.add('regular_messengers');
  // Administrative writing is an emergent breakthrough, not a guaranteed
  // level-up. Different polities cross a stable but varied readiness threshold;
  // intensive trade, accounts and official practice all have to coexist.
  const writingThreshold = 0.48 + stableFraction(polity.id) * 0.22;
  if (admin.recordKeeping >= writingThreshold && admin.accounting >= 0.38 &&
    admin.officialdom >= 0.08 && trade > 250) admin.breakthroughs.add('writing');
  if (admin.breakthroughs.has('writing') && admin.officialdom >= 0.35) admin.breakthroughs.add('palace_archives');
  if (admin.delegation >= 0.35 && admin.officialdom >= 0.3) admin.breakthroughs.add('provincial_governorship');
  if (subjects.length > 0 && admin.legitimacy >= 0.45) admin.breakthroughs.add('royal_ideology');
}

function desiredAdministrativeControl(region, capital, admin, subjectCount) {
  const distance = centroidDistanceKm(capital, region) || 100;
  const writingBonus = admin.breakthroughs.has('writing') ? 0.2 : 0;
  const archiveBonus = admin.breakthroughs.has('palace_archives') ? 0.15 : 0;
  const institutional = admin.recordKeeping * 0.2 + admin.accounting * 0.18 +
    admin.communications * 0.2 + admin.officialdom * 0.18 + admin.delegation * 0.12 +
    admin.legitimacy * 0.12 + writingBonus + archiveBonus;
  const distanceBurden = 1 + distance / (220 + admin.communications * 700);
  const scaleBurden = 1 + Math.max(0, subjectCount - 1) * (0.25 - admin.delegation * 0.15);
  const resistance = 1 + Math.max(0, -attitudeToward(region, capital.id)) * 0.8;
  const autonomyLimit = 1 - region.governance.autonomy * 0.55;
  const governor = region.governance.governor;
  const governorFactor = governor ? 0.65 + governor.competence * 0.2 + governor.loyalty * 0.15 : 0.65;
  const delegatedCount = Object.values(region.governance.delegatedPowers || {}).filter(Boolean).length;
  const delegationBonus = 1 + delegatedCount * admin.delegation * 0.04;
  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus /
    (distanceBurden * scaleBurden * resistance), 0.05, 0.95);
}

function transferTribute(subject, capital, amount) {
  const fromTreasury = Math.min(subject.treasury, amount);
  subject.treasury -= fromTreasury;
  const fromWallet = Math.min(subject.wallet, amount - fromTreasury);
  subject.wallet -= fromWallet;
  const delivered = fromTreasury + fromWallet;
  capital.treasury += delivered;
  return delivered;
}

export function tickPolities(polities, regions, currentTick) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const polity of polities) {
    if (polity.subjectToPolityId) continue;
    const capital = regionsById.get(polity.capitalRegionId);
    if (!capital) continue;
    const subjects = polityTerritories(polity, regions).filter((region) => region.id !== capital.id);
    polity.report = { tributeReceived: 0, subjectCount: subjects.length, administrativeLoad: 0, administrativeCapacity: 0 };
    updateCapabilities(polity, capital, subjects);
    const admin = polity.administration;

    for (const subject of subjects) {
      const governance = subject.governance;
      const desiredControl = desiredAdministrativeControl(subject, capital, admin, subjects.length);
      governance.administrativeControl += (desiredControl - governance.administrativeControl) * CONTROL_ADJUSTMENT_RATE;
      const writing = admin.breakthroughs.has('writing');
      governance.reportDelayWeeks = Math.max(1, Math.round((centroidDistanceKm(capital, subject) || 100) /
        (35 + admin.communications * 100) * (writing ? 0.65 : 1)));
      if (!governance.lastReport || currentTick >= (governance.nextReportTick || 0)) {
        governance.lastReport = {
          asOfTick: currentTick,
          population: subject.population,
          stability: subject.stability,
          safetyRating: subject.safetyRating,
          armyPersonnel: subject.army.personnel,
          banditPopulation: subject.banditPopulation,
          treasury: subject.treasury,
          tributeDelivered: governance.tributeDelivered,
        };
        governance.nextReportTick = currentTick + governance.reportDelayWeeks;
      }
      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -
        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +
        (1 - (governance.governor?.loyalty || 0.5)) * 0.08, 0.08, 0.85);
      const nominal = subject.population * BASE_TRIBUTE_PER_PERSON * governance.tributeRate * 10;
      const demand = nominal * (0.25 + governance.administrativeControl * 0.75);
      const collectionFactor = governance.delegatedPowers?.collectTaxes
        ? 0.75 + (governance.governor?.competence || 0) * 0.25
        : 0.4 + governance.administrativeControl * 0.6;
      const delivered = transferTribute(subject, capital, demand * (1 - governance.corruption) * collectionFactor);
      governance.tributeDelivered += delivered;
      polity.report.tributeReceived += delivered;
      polity.report.administrativeLoad += subject.population / 10000 * (1 + governance.autonomy);
      polity.report.administrativeCapacity += governance.administrativeControl;
      subject.diplomacyReport.received = subject.diplomacyReport.received || 0;
      capital.diplomacyReport.received = (capital.diplomacyReport.received || 0) + delivered;
      const protectionBenefit = (subject.safetyRating ?? 1) > 0.85 ? governance.administrativeControl * 0.00035 : 0;
      const extractionResentment = governance.tributeRate * 0.0015 +
        Math.max(0, 0.55 - governance.autonomy) * 0.0005;
      changeAttitude(subject, capital.id, protectionBenefit - extractionResentment,
        protectionBenefit >= extractionResentment ? 'protected_subject' : 'royal_extraction', currentTick);
      if (governance.governor) {
        const attitudeLoyalty = clamp((attitudeToward(subject, capital.id) + 1) / 2);
        governance.governor.loyalty = clamp(governance.governor.loyalty * 0.998 +
          attitudeLoyalty * 0.001 + admin.legitimacy * 0.001);
      }
      if (governance.delegatedPowers?.judgeDisputes) {
        subject.stability = clamp(subject.stability + ((governance.governor?.competence || 0.5) - 0.45) * 0.0002);
      }
    }

    if (subjects.length > 0 && polity.kingdomSinceTick === null) {
      const durable = subjects.some((region) => currentTick - region.governance.startTick >= 156 && region.governance.tributeDelivered > 10);
      if (durable && admin.legitimacy >= 0.35) {
        polity.kingdomSinceTick = currentTick;
        polity.name = `Kingdom of ${capital.name}`;
        events.push({ type: 'kingdom_formed', polityId: polity.id, polityName: polity.name, regionId: capital.id });
      }
    }
  }

  for (const region of regions) {
    if (!region.militaryThreat) region.militaryThreat = { lastRaidedTick: null, recentRaids: 0 };
    const weeks = region.militaryThreat.lastRaidedTick === null ? Infinity : currentTick - region.militaryThreat.lastRaidedTick;
    region.militaryThreat.recentRaids = weeks > THREAT_MEMORY_WEEKS
      ? region.militaryThreat.recentRaids * 0.96
      : region.militaryThreat.recentRaids * 0.985;
  }
  return events;
}

export function vassalLevyOffer(vassal, overlord, currentTick) {
  const governance = vassal.governance;
  if (!governance || !['vassal', 'delegated', 'integrated'].includes(governance.relationship)) {
    return { available: 0, fraction: 0, reason: 'not_a_vassal' };
  }
  const army = Math.floor(vassal.army.personnel || 0);
  if (army <= 0) return { available: 0, fraction: 0, reason: 'no_army' };
  const threatAge = vassal.militaryThreat?.lastRaidedTick === null ? Infinity :
    currentTick - vassal.militaryThreat.lastRaidedTick;
  const recentRaidRisk = threatAge >= THREAT_MEMORY_WEEKS ? 0 : 1 - threatAge / THREAT_MEMORY_WEEKS;
  const banditRisk = clamp((vassal.banditPopulation || 0) / Math.max(1, vassal.population) * 20);
  const insecurity = clamp((1 - (vassal.safetyRating ?? 1)) * 0.65 + recentRaidRisk * 0.55 + banditRisk * 0.7);
  const reserveNeeded = Math.ceil(Math.max(
    vassal.targetArmySize * (0.45 + insecurity * 0.9),
    vassal.banditPopulation * (0.5 + insecurity)
  ));
  const spare = Math.max(0, army - reserveNeeded);
  const history = governance.levyHistory || { sent: 0, returned: 0, campaigns: 0 };
  const survivalConfidence = (history.returned + 100) / (history.sent + 125);
  const attitudeFactor = clamp((attitudeToward(vassal, overlord.id) + 1) / 2, 0.08, 1);
  const confidence = clamp(survivalConfidence * 0.65 + attitudeFactor * 0.2 +
    governance.administrativeControl * 0.15);
  const commandFactor = governance.delegatedPowers?.commandArmy
    ? 1 : 0.45 + governance.administrativeControl * 0.55;
  const willingness = clamp(governance.militaryObligation * confidence * commandFactor *
    Math.pow(1 - insecurity, 1.5), 0, 0.7);
  const available = Math.floor(Math.min(spare, army * willingness));
  let reason = 'available';
  if (spare <= 0) reason = insecurity > 0.4 ? 'needed_for_local_defence' : 'no_spare_troops';
  else if (available <= 0) reason = survivalConfidence < 0.25 ? 'previous_contingents_destroyed' : 'unwilling';
  return { available, fraction: army > 0 ? available / army : 0, reason, insecurity,
    survivalConfidence, reserveNeeded };
}

export function availableVassalLevies(overlord, regions, polities, currentTick) {
  return subjectRegionsFor(overlord, regions, polities).map((region) => ({
    region,
    ...vassalLevyOffer(region, overlord, currentTick),
  }));
}

export function musterVassalLevies(overlord, regions, polities, currentTick) {
  const contingents = [];
  for (const offer of availableVassalLevies(overlord, regions, polities, currentTick)) {
    if (offer.available <= 0) continue;
    offer.region.army.personnel -= offer.available;
    offer.region.army.away = (offer.region.army.away || 0) + offer.available;
    offer.region.governance.levyHistory.sent += offer.available;
    offer.region.governance.levyHistory.campaigns += 1;
    contingents.push({ regionId: offer.region.id, personnel: offer.available });
  }
  return contingents;
}

export function recordContingentReturns(region, sent, returned) {
  if (!region?.governance?.levyHistory) return;
  region.governance.levyHistory.returned += Math.max(0, returned);
  if (sent > 0) {
    const survival = returned / sent;
    changeAttitude(region, region.governance.localRulerId === region.id ? region.controllingActorId : region.governance.localRulerId,
      survival >= 0.8 ? 0.04 : survival <= 0.35 ? -0.18 : -0.03, 'levy_survival', null);
  }
}

export function findLandStagingRegion(attacker, defender, regions, polities) {
  if (attacker.neighbors.includes(defender.id)) return attacker;
  const polity = sovereignPolity(attacker, polities);
  if (!polity || polity.capitalRegionId !== attacker.id) return null;
  return polityTerritories(polity, regions).find((region) =>
    region.governance?.militaryPassage && region.neighbors.includes(defender.id)) || null;
}
