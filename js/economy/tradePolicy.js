import { localPrice } from './prices.js?v=20260905-goods1';
import { TRADE_GOODS, defaultExportAllowed } from './tradeGoods.js?v=20260905-goods2';
import { changeAttitude } from '../diplomacy/relations.js?v=20260904-save1';

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
  if (!Number.isFinite(policy.nextRuleId)) policy.nextRuleId = nextTradeRuleId++;
  return policy;
}

function ruleMatches(rule, direction, resource, counterpartActorId) {
  if (rule.direction !== 'trade' && rule.direction !== direction) return false;
  if (Array.isArray(rule.goods) && rule.goods.length > 0 && !rule.goods.includes(resource)) return false;
  if (Array.isArray(rule.counterparties) && rule.counterparties.length > 0 && !rule.counterparties.includes(counterpartActorId)) return false;
  return true;
}

export function tradePolicyDecision(region, direction, resource, counterpart) {
  // Almost every region has the Bronze Age defaults almost all the time. Keep
  // that hot path allocation-free; explicit policy objects are created only
  // when a ruler actually changes something.
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
  let tariffRate = 0; // Reserved for later-period tariff policy.
  let matchedRule = null;
  for (const rule of policy.rules) {
    if (!ruleMatches(rule, direction, resource, counterpartActorId)) continue;
    allowed = rule.allowed !== false;
    tariffRate = Math.max(0, Number(rule.tariffRate) || 0);
    matchedRule = rule;
  }
  return { allowed, tariffRate, matchedRule };
}

export function tradeAllowed(exporter, importer, resource) {
  if (!exporter.tradePolicy && !importer.tradePolicy) return defaultExportAllowed(resource);
  return tradePolicyDecision(exporter, 'export', resource, importer).allowed &&
    tradePolicyDecision(importer, 'import', resource, exporter).allowed;
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
  allowed = false, tariffRate = 0 } = {}, regions = [], currentTick = null) {
  const policy = ensureTradePolicy(region);
  const cleanGoods = goods === null ? null : unique(goods).filter((id) => TRADE_GOODS[id]);
  const cleanCounterparties = counterparties === null ? null : unique(counterparties);
  const key = JSON.stringify([direction, cleanGoods?.slice().sort() || null, cleanCounterparties?.slice().sort() || null]);
  const existingIndex = policy.rules.findIndex((rule) => rule.key === key);
  const oldRule = existingIndex >= 0 ? policy.rules[existingIndex] : null;
  const tightening = allowed === false && oldRule?.allowed !== false;
  const loosening = allowed !== false && oldRule?.allowed === false;
  const affected = regions.filter((other) => other.id !== region.id &&
    (cleanCounterparties === null || cleanCounterparties.includes(tradeActorId(other))));
  const harmByActor = {};
  for (const other of affected) {
    const actor = tradeActorId(other);
    const harm = estimateRestrictionHarm(region, other, direction, cleanGoods);
    harmByActor[actor] = Math.max(harmByActor[actor] || 0, harm);
    if (tightening) changeAttitude(other, region.id, -diplomaticMagnitude(harm, other), 'trade_restriction', currentTick);
    else if (loosening) {
      const remembered = Math.max(harm, oldRule?.harmByActor?.[actor] || 0);
      changeAttitude(other, region.id, diplomaticMagnitude(remembered, other) * 0.8, 'trade_liberalisation', currentTick);
    }
  }
  const rule = {
    id: oldRule?.id || `trade-rule-${policy.nextRuleId++}`,
    key, direction,
    goods: cleanGoods,
    counterparties: cleanCounterparties,
    allowed: allowed !== false,
    tariffRate: Math.max(0, Number(tariffRate) || 0),
    changedTick: currentTick,
    harmByActor,
  };
  if (existingIndex >= 0) policy.rules[existingIndex] = rule;
  else policy.rules.push(rule);
  return rule;
}

export function removeTradeRestriction(region, ruleId, regions = [], currentTick = null) {
  const policy = ensureTradePolicy(region);
  const index = policy.rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) return false;
  const rule = policy.rules[index];
  policy.rules.splice(index, 1);
  if (rule.allowed === false) {
    const affected = regions.filter((other) => other.id !== region.id &&
      (rule.counterparties === null || rule.counterparties.includes(tradeActorId(other))));
    for (const other of affected) {
      const actor = tradeActorId(other);
      const harm = Math.max(estimateRestrictionHarm(region, other, rule.direction, rule.goods), rule.harmByActor?.[actor] || 0);
      changeAttitude(other, region.id, diplomaticMagnitude(harm, other) * 0.8, 'trade_liberalisation', currentTick);
    }
  }
  return true;
}

export function activeTradeRestrictions(region) {
  return ensureTradePolicy(region).rules.filter((rule) => rule.allowed === false);
}
