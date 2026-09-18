import { localPrice } from './prices.js?v=20260905-goods1';
import { TRADE_GOODS, defaultExportAllowed } from './tradeGoods.js?v=20260905-goods2';
import { changeAttitude } from '../diplomacy/relations.js?v=20260904-save1';
import { messageRouteBetween, messageRouteDeliveryTicks } from '../diplomacy/messageRouting.js?v=20260917-message-routing1';

let nextTradeRuleId = 1;
const MAX_POLICY_ATTITUDE_CHANGE = 0.22;

function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function tradeActorId(region) {
  return region?.controllingActorId || region?.governance?.sovereignPolityId || region?.id || null;
}

export function ensureTradePolicy(region) {
  if (!region.tradePolicy || typeof region.tradePolicy !== 'object') region.tradePolicy = {};
  const policy = region.tradePolicy;
  if (policy.defaultImportAllowed !== false) policy.defaultImportAllowed = true;
  if (policy.defaultExportAllowed !== false) policy.defaultExportAllowed = true;
  if (!Array.isArray(policy.rules)) policy.rules = [];
  if (!Array.isArray(policy.pendingNotices)) policy.pendingNotices = [];
  if (!Number.isFinite(policy.nextRuleId)) policy.nextRuleId = nextTradeRuleId++;
  return policy;
}

function ruleMatches(rule, direction, resource, counterpartActorId) {
  if (rule.direction !== 'trade' && rule.direction !== direction) return false;
  if (Array.isArray(rule.goods) && rule.goods.length > 0 && !rule.goods.includes(resource)) return false;
  if (Array.isArray(rule.counterparties) && rule.counterparties.length > 0 && !rule.counterparties.includes(counterpartActorId)) return false;
  return true;
}

export function tradePolicyDecision(region, direction, resource, counterpart, context = {}) {
  const existing = region.tradePolicy;
  if (!existing) return {
    allowed: direction === 'export' ? defaultExportAllowed(resource) : true,
    tariffRate: 0, matchedRule: null,
  };
  const policy = ensureTradePolicy(region);
  const counterpartActorId = typeof counterpart === 'string' ? counterpart : tradeActorId(counterpart);
  let allowed = direction === 'export'
    ? policy.defaultExportAllowed && defaultExportAllowed(resource)
    : policy.defaultImportAllowed;
  let tariffRate = 0;
  let matchedRule = null;
  for (const rule of policy.rules) {
    if (!ruleMatches(rule, direction, resource, counterpartActorId)) continue;
    let ruleAllowed = rule.allowed !== false;
    let ruleTariff = Math.max(0, Number(rule.tariffRate) || 0);
    if (direction === 'import' && rule.enforcement !== 'immediate') {
      const noticeTick = rule.notificationTickByActor?.[counterpartActorId];
      const referenceTick = Number.isFinite(context.departureTick) ? context.departureTick : context.currentTick;
      if (Number.isFinite(noticeTick) && Number.isFinite(referenceTick) && referenceTick < noticeTick) {
        ruleAllowed = rule.previousAllowed !== false;
        ruleTariff = Math.max(0, Number(rule.previousTariffRate) || 0);
      }
    }
    allowed = ruleAllowed;
    tariffRate = ruleTariff;
    matchedRule = rule;
  }
  return { allowed, tariffRate, matchedRule };
}

export function borderTariffQuote(exporter, importer, resource, goodsValue = 0, context = {}) {
  const exportDecision = tradePolicyDecision(exporter, 'export', resource, importer, context);
  const importDecision = tradePolicyDecision(importer, 'import', resource, exporter, context);
  const value = Math.max(0, Number(goodsValue) || 0);
  const exportRate = Math.max(0, Number(exportDecision.tariffRate) || 0);
  const importRate = Math.max(0, Number(importDecision.tariffRate) || 0);
  return {
    allowed: exportDecision.allowed && importDecision.allowed,
    exportRate,
    importRate,
    exportTariff: value * exportRate,
    importTariff: value * importRate,
    totalTariff: value * (exportRate + importRate),
    exportRule: exportDecision.matchedRule,
    importRule: importDecision.matchedRule,
  };
}

export function tradeAllowed(exporter, importer, resource, context = {}) {
  if (!exporter.tradePolicy && !importer.tradePolicy) return defaultExportAllowed(resource);
  return borderTariffQuote(exporter, importer, resource, 0, context).allowed;
}

function needPressure(region, resource) {
  const demand = Math.max(0, region.marketDemand?.[resource] || 0);
  const stock = Math.max(0, region.stockpile?.[resource] || 0);
  const reference = Math.max(1, TRADE_GOODS[resource]?.referenceStock || 1);
  let pressure = demand / Math.max(1, demand + stock + reference * 0.02);
  if (resource === 'food') {
    const weeklyNeed = Math.max(1, region._foodNeeded || region.population * 0.014);
    const weeks = stock / weeklyNeed;
    pressure += clamp((4 - weeks) / 4, 0, 1) * 2;
  }
  return pressure;
}

function recentRouteValue(exporter, importer, resource) {
  const habit = exporter.tradeEconomy?.routeHabits?.[`${importer.id}|${resource}`];
  const habitValue = Math.max(0, Number(habit?.score) || 0);
  const recent = Math.max(0, Number(exporter.tradeEconomy?.weeklyExportsByResource?.[resource]) || 0);
  return Math.max(recent, habitValue * 0.05);
}

export function estimateRestrictionHarm(policyOwner, other, direction, goods = null) {
  const resources = Array.isArray(goods) && goods.length ? goods : Object.keys(TRADE_GOODS);
  let harm = 0;
  for (const resource of resources) {
    if (!TRADE_GOODS[resource]) continue;
    if (direction === 'export' || direction === 'trade') {
      const price = localPrice(other, resource);
      const need = needPressure(other, resource);
      const established = recentRouteValue(policyOwner, other, resource);
      harm += price * need * Math.max(1, other.marketDemand?.[resource] || 0) + established;
    }
    if (direction === 'import' || direction === 'trade') {
      const price = localPrice(policyOwner, resource);
      const sellerDependence = recentRouteValue(other, policyOwner, resource);
      const surplusSignal = Math.max(0, (other.stockpile?.[resource] || 0) - (other.marketDemand?.[resource] || 0) * 8);
      harm += sellerDependence + price * Math.min(surplusSignal, TRADE_GOODS[resource].referenceStock * 0.05) * 0.05;
    }
  }
  return harm;
}

function diplomaticMagnitude(harm, other) {
  const scale = Math.max(20, (other.population || 0) * 0.002);
  return clamp(Math.log1p(Math.max(0, harm) / scale) * 0.035, 0.002, MAX_POLICY_ATTITUDE_CHANGE);
}

export function setTradeRestriction(region, { direction = 'trade', goods = null, counterparties = null,
  allowed = false, tariffRate = 0, enforcement = 'communicated' } = {}, regions = [], currentTick = null) {
  const policy = ensureTradePolicy(region);
  const cleanGoods = goods === null ? null : unique(goods).filter((id) => TRADE_GOODS[id]);
  const cleanCounterparties = counterparties === null ? null : unique(counterparties);
  const key = JSON.stringify([direction, cleanGoods?.slice().sort() || null, cleanCounterparties?.slice().sort() || null]);
  const existingIndex = policy.rules.findIndex((rule) => rule.key === key);
  const oldRule = existingIndex >= 0 ? policy.rules[existingIndex] : null;
  const cleanTariffRate = Math.max(0, Number(tariffRate) || 0);
  const oldTariffRate = Math.max(0, Number(oldRule?.tariffRate) || 0);
  const previousAllowed = oldRule ? oldRule.allowed !== false :
    (direction === 'export' && cleanGoods?.length === 1 ? defaultExportAllowed(cleanGoods[0]) : true);
  const previousTariffRate = oldTariffRate;
  const cleanEnforcement = enforcement === 'immediate' ? 'immediate' : 'communicated';
  const tightening = allowed === false && oldRule?.allowed !== false;
  const loosening = allowed !== false && oldRule?.allowed === false;
  const tariffTightening = allowed !== false && oldRule?.allowed !== false && cleanTariffRate > oldTariffRate + 0.0001;
  const tariffLoosening = allowed !== false && oldRule?.allowed !== false && cleanTariffRate + 0.0001 < oldTariffRate;
  const affected = regions.filter((other) => other.id !== region.id &&
    (cleanCounterparties === null || cleanCounterparties.includes(tradeActorId(other))));
  const harmByActor = {};
  const notificationTickByActor = {};
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  for (const other of affected) {
    const actor = tradeActorId(other);
    const route = messageRouteBetween(region, other, regionsById);
    const deliveryTicks = cleanEnforcement === 'immediate' ? 0 : messageRouteDeliveryTicks(route);
    const noticeTick = Number.isFinite(currentTick) && Number.isFinite(deliveryTicks) ? currentTick + deliveryTicks : currentTick;
    notificationTickByActor[actor] = noticeTick;
    const harm = estimateRestrictionHarm(region, other, direction, cleanGoods);
    harmByActor[actor] = Math.max(harmByActor[actor] || 0, harm);
    let attitudeDelta = 0, reason = null;
    if (tightening) { attitudeDelta = -diplomaticMagnitude(harm, other); reason = 'trade_restriction'; }
    else if (loosening) {
      const remembered = Math.max(harm, oldRule?.harmByActor?.[actor] || 0);
      attitudeDelta = diplomaticMagnitude(remembered, other) * 0.8; reason = 'trade_liberalisation';
    } else if (tariffTightening) {
      const delta = clamp(cleanTariffRate - oldTariffRate, 0, 2);
      attitudeDelta = -diplomaticMagnitude(harm, other) * Math.min(0.8, 0.18 + delta * 0.55); reason = 'tariff_increase';
    } else if (tariffLoosening) {
      const delta = clamp(oldTariffRate - cleanTariffRate, 0, 2);
      attitudeDelta = diplomaticMagnitude(Math.max(harm, oldRule?.harmByActor?.[actor] || 0), other) * Math.min(0.65, 0.12 + delta * 0.45); reason = 'tariff_reduction';
    }
    if (reason && Math.abs(attitudeDelta) > 0) policy.pendingNotices.push({
      targetRegionId: other.id, actorId: actor, effectiveTick: noticeTick,
      attitudeDelta, reason, sourceRegionId: region.id,
    });
  }
  const rule = {
    id: oldRule?.id || `trade-rule-${policy.nextRuleId++}`,
    key, direction,
    goods: cleanGoods,
    counterparties: cleanCounterparties,
    allowed: allowed !== false,
    tariffRate: cleanTariffRate,
    enforcement: cleanEnforcement,
    previousAllowed, previousTariffRate,
    notificationTickByActor,
    changedTick: currentTick,
    harmByActor,
  };
  if (existingIndex >= 0) policy.rules[existingIndex] = rule;
  else policy.rules.push(rule);
  return rule;
}

export function removeTradeRestriction(region, ruleId, regions = [], currentTick = null, { enforcement = 'communicated' } = {}) {
  const policy = ensureTradePolicy(region);
  const rule = policy.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return false;
  if (rule.allowed !== false && !(Number(rule.tariffRate) > 0)) {
    policy.rules = policy.rules.filter((candidate) => candidate.id !== ruleId); return true;
  }
  setTradeRestriction(region, { direction: rule.direction, goods: rule.goods,
    counterparties: rule.counterparties, allowed: true, tariffRate: 0, enforcement }, regions, currentTick);
  return true;
}

export function tickTradePolicyCommunications(regions = [], currentTick = 0) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  for (const owner of regions) {
    const policy = owner.tradePolicy;
    if (!policy?.pendingNotices?.length) continue;
    const remaining = [];
    for (const notice of policy.pendingNotices) {
      if (!Number.isFinite(notice.effectiveTick) || currentTick < notice.effectiveTick) { remaining.push(notice); continue; }
      const target = byId.get(notice.targetRegionId);
      if (target) changeAttitude(target, owner.id, notice.attitudeDelta, notice.reason, currentTick);
    }
    policy.pendingNotices = remaining;
  }
}

export function activeTradeRestrictions(region) {
  return (region.tradePolicy?.rules || []).filter((rule) => rule.allowed === false);
}

export function activeTariffs(region) {
  return (region.tradePolicy?.rules || []).filter((rule) => rule.allowed !== false && Math.max(0, Number(rule.tariffRate) || 0) > 0);
}
