import { hasDirectContact } from '../core/knowledge.js?v=20260904-diplomacy1';
import { effectivePower } from '../military/army.js?v=20260904-diplomacy1';

const ATTITUDE_DECAY_PER_WEEK = 0.0015;
const TRADE_WARMING_PER_VALUE = 0.000002;
const MAX_TRADE_WARMING_PER_WEEK = 0.025;
const TRIBUTE_RATE = 0.00035;
const RESOURCE_ACCESS_RATE = 0.0025;
const SUPPORT_UPKEEP_PER_SOLDIER = 0.015;

let nextAgreementId = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function ensureDiplomacy(region) {
  if (!(region.relations instanceof Map)) region.relations = new Map();
  if (!region.diplomacyReport) region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };
  return region.relations;
}

export function relationToward(region, otherId) {
  const relations = ensureDiplomacy(region);
  if (!relations.has(otherId)) relations.set(otherId, { attitude: 0, lastCause: null, lastChangedTick: null });
  return relations.get(otherId);
}

export function attitudeToward(region, otherId) {
  return relationToward(region, otherId).attitude;
}

export function changeAttitude(region, otherId, amount, cause, currentTick = null) {
  const relation = relationToward(region, otherId);
  relation.attitude = clamp(relation.attitude + amount, -1, 1);
  relation.lastCause = cause;
  relation.lastChangedTick = currentTick;
  return relation.attitude;
}

export function attitudeLabel(value) {
  if (value <= -0.65) return 'hostile';
  if (value <= -0.25) return 'resentful';
  if (value < 0.25) return 'wary';
  if (value < 0.65) return 'friendly';
  return 'devoted';
}

export function canDiplomaticallyReach(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (!hasDirectContact(a, b) || !hasDirectContact(b, a)) return false;
  if (a.neighbors.includes(b.id)) return true;
  return a.adjacentSeaIds.some((id) => b.adjacentSeaIds.includes(id));
}

export function powerRatio(demander, target, toolTypes) {
  const demanderPower = effectivePower(demander, toolTypes) + demander.population * 0.001 + 1;
  const targetPower = effectivePower(target, toolTypes) + target.population * 0.001 + 1;
  return demanderPower / targetPower;
}

export function tradeRelationMultiplier(a, b) {
  const mutual = (attitudeToward(a, b.id) + attitudeToward(b, a.id)) / 2;
  return clamp(1 + mutual * 0.45, 0.45, 1.35);
}

export function recordDiplomaticTrade(a, b, value, currentTick) {
  const warming = Math.min(MAX_TRADE_WARMING_PER_WEEK, Math.max(0, value) * TRADE_WARMING_PER_VALUE);
  if (warming <= 0) return;
  changeAttitude(a, b.id, warming, 'trade', currentTick);
  changeAttitude(b, a.id, warming, 'trade', currentTick);
}

export function activeAgreementBetween(agreements, aId, bId, type = null) {
  return agreements.find((agreement) => agreement.active &&
    ((agreement.fromId === aId && agreement.toId === bId) ||
      (agreement.fromId === bId && agreement.toId === aId)) &&
    (!type || agreement.type === type));
}

export function proposeAgreement(type, proposer, target, agreements, toolTypes, currentTick, options = {}) {
  if (!canDiplomaticallyReach(proposer, target)) return { accepted: false, reason: 'no_contact' };
  if (activeAgreementBetween(agreements, proposer.id, target.id, type)) {
    return { accepted: false, reason: 'already_active' };
  }

  const ratio = powerRatio(proposer, target, toolTypes);
  const targetAttitude = attitudeToward(target, proposer.id);
  let accepted = false;
  let personnel = 0;

  if (type === 'military_support') {
    personnel = Math.floor(clamp(Number(options.personnel) || 0, 0, proposer.army.personnel * 0.5));
    accepted = personnel >= 10 && targetAttitude > -0.55;
  } else if (type === 'tribute') {
    accepted = ratio >= 1.6 && targetAttitude > -0.95;
  } else if (type === 'resource_access') {
    accepted = ratio >= 1.35 && targetAttitude > -0.9;
  } else {
    return { accepted: false, reason: 'unknown_type' };
  }

  if (!accepted) {
    changeAttitude(target, proposer.id, type === 'military_support' ? -0.03 : -0.12, `refused_${type}`, currentTick);
    return { accepted: false, reason: type === 'military_support' ? 'too_few_troops_or_hostile' : 'target_not_weak_enough' };
  }

  if (type === 'military_support') {
    proposer.army.personnel -= personnel;
    proposer.army.away = (proposer.army.away || 0) + personnel;
    changeAttitude(target, proposer.id, 0.18, 'military_support', currentTick);
    changeAttitude(proposer, target.id, 0.04, 'military_support', currentTick);
  } else {
    changeAttitude(target, proposer.id, type === 'tribute' ? -0.3 : -0.18, type, currentTick);
    changeAttitude(proposer, target.id, -0.04, type, currentTick);
  }

  const agreement = {
    id: nextAgreementId++, type, fromId: proposer.id, toId: target.id,
    personnel, startTick: currentTick, active: true, endedTick: null,
  };
  agreements.push(agreement);
  return { accepted: true, agreement };
}

export function endAgreement(agreement, regionsById, currentTick) {
  if (!agreement?.active) return false;
  agreement.active = false;
  agreement.endedTick = currentTick;
  if (agreement.type === 'military_support' && agreement.personnel > 0) {
    const provider = regionsById.get(agreement.fromId);
    if (provider) {
      provider.army.personnel += agreement.personnel;
      provider.army.away = Math.max(0, (provider.army.away || 0) - agreement.personnel);
    }
  }
  return true;
}

export function protectionPowerFor(regionId, agreements) {
  return agreements
    .filter((agreement) => agreement.active && agreement.type === 'military_support' && agreement.toId === regionId)
    .reduce((sum, agreement) => sum + agreement.personnel, 0);
}

function transferFunds(payer, receiver, amount) {
  const fromTreasury = Math.min(payer.treasury, amount);
  payer.treasury -= fromTreasury;
  const fromWallet = Math.min(payer.wallet, amount - fromTreasury);
  payer.wallet -= fromWallet;
  receiver.treasury += fromTreasury + fromWallet;
  return fromTreasury + fromWallet;
}

export function tickDiplomacy(regions, agreements, toolTypes, currentTick) {
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    ensureDiplomacy(region);
    region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };
    for (const relation of region.relations.values()) {
      relation.attitude *= (1 - ATTITUDE_DECAY_PER_WEEK);
    }
  }

  const events = [];
  for (const agreement of agreements) {
    if (!agreement.active) continue;
    const from = regionsById.get(agreement.fromId);
    const to = regionsById.get(agreement.toId);
    if (!from || !to) continue;

    if (agreement.type === 'military_support') {
      const affordable = Math.floor(Math.max(0, from.treasury) / SUPPORT_UPKEEP_PER_SOLDIER);
      if (affordable < agreement.personnel * 0.5 || attitudeToward(from, to.id) < -0.7) {
        endAgreement(agreement, regionsById, currentTick);
        events.push({ type: 'agreement_ended', agreement, fromName: from.name, toName: to.name });
        continue;
      }
      const upkeep = Math.min(from.treasury, agreement.personnel * SUPPORT_UPKEEP_PER_SOLDIER);
      from.treasury -= upkeep;
      to.diplomacyReport.support += agreement.personnel;
      changeAttitude(to, from.id, 0.002, 'continued_support', currentTick);
    }

    if (agreement.type === 'tribute') {
      const demand = Math.max(0.5, to.population * TRIBUTE_RATE);
      const paid = transferFunds(to, from, demand);
      to.diplomacyReport.paid += paid;
      from.diplomacyReport.received += paid;
      changeAttitude(to, from.id, -0.0015, 'tribute', currentTick);
      if (paid < demand * 0.25 || powerRatio(from, to, toolTypes) < 1.15) {
        endAgreement(agreement, regionsById, currentTick);
        events.push({ type: 'agreement_ended', agreement, fromName: from.name, toName: to.name });
      }
    }

    if (agreement.type === 'resource_access') {
      const available = Math.max(0, to.stockpile.wood || 0);
      const taken = Math.min(available, Math.max(1, to.population * RESOURCE_ACCESS_RATE));
      to.stockpile.wood = available - taken;
      from.stockpile.wood = (from.stockpile.wood || 0) + taken;
      to.diplomacyReport.woodTaken += taken;
      changeAttitude(to, from.id, -0.001, 'resource_access', currentTick);
      if (powerRatio(from, to, toolTypes) < 1.05) {
        endAgreement(agreement, regionsById, currentTick);
        events.push({ type: 'agreement_ended', agreement, fromName: from.name, toName: to.name });
      }
    }
  }
  return events;
}
