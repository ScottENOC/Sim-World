from pathlib import Path


def replace(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'missing snippet in {path}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1))

# tradePolicy: route notices physically, delay foreign import enforcement, and queue diplomatic knowledge.
p='js/economy/tradePolicy.js'
replace(p,
"import { changeAttitude } from '../diplomacy/relations.js?v=20260904-save1';\n",
"import { changeAttitude } from '../diplomacy/relations.js?v=20260904-save1';\nimport { messageRouteBetween, messageRouteDeliveryTicks } from '../diplomacy/messageRouting.js?v=20260917-message-routing1';\n")
replace(p,
"  if (!Array.isArray(policy.rules)) policy.rules = [];\n  if (!Number.isFinite(policy.nextRuleId)) policy.nextRuleId = nextTradeRuleId++;\n",
"  if (!Array.isArray(policy.rules)) policy.rules = [];\n  if (!Array.isArray(policy.pendingNotices)) policy.pendingNotices = [];\n  if (!Number.isFinite(policy.nextRuleId)) policy.nextRuleId = nextTradeRuleId++;\n")
replace(p,
"export function tradePolicyDecision(region, direction, resource, counterpart) {",
"export function tradePolicyDecision(region, direction, resource, counterpart, context = {}) {")
replace(p,
"    allowed = rule.allowed !== false;\n    tariffRate = Math.max(0, Number(rule.tariffRate) || 0);\n    matchedRule = rule;\n",
"    let ruleAllowed = rule.allowed !== false;\n    let ruleTariff = Math.max(0, Number(rule.tariffRate) || 0);\n    // Export controls are domestic orders and bind our own merchants at once.\n    // Import controls normally bind a foreign counterparty only after notice can\n    // physically reach them. Cargo dispatched before that notice is grandfathered.\n    if (direction === 'import' && rule.enforcement !== 'immediate') {\n      const noticeTick = rule.notificationTickByActor?.[counterpartActorId];\n      const referenceTick = Number.isFinite(context.departureTick) ? context.departureTick : context.currentTick;\n      if (Number.isFinite(noticeTick) && Number.isFinite(referenceTick) && referenceTick < noticeTick) {\n        ruleAllowed = rule.previousAllowed !== false;\n        ruleTariff = Math.max(0, Number(rule.previousTariffRate) || 0);\n      }\n    }\n    allowed = ruleAllowed;\n    tariffRate = ruleTariff;\n    matchedRule = rule;\n")
replace(p,
"export function borderTariffQuote(exporter, importer, resource, goodsValue = 0) {\n  const exportDecision = tradePolicyDecision(exporter, 'export', resource, importer);\n  const importDecision = tradePolicyDecision(importer, 'import', resource, exporter);",
"export function borderTariffQuote(exporter, importer, resource, goodsValue = 0, context = {}) {\n  const exportDecision = tradePolicyDecision(exporter, 'export', resource, importer, context);\n  const importDecision = tradePolicyDecision(importer, 'import', resource, exporter, context);")
replace(p,
"export function tradeAllowed(exporter, importer, resource) {\n  if (!exporter.tradePolicy && !importer.tradePolicy) return defaultExportAllowed(resource);\n  return borderTariffQuote(exporter, importer, resource).allowed;\n}",
"export function tradeAllowed(exporter, importer, resource, context = {}) {\n  if (!exporter.tradePolicy && !importer.tradePolicy) return defaultExportAllowed(resource);\n  return borderTariffQuote(exporter, importer, resource, 0, context).allowed;\n}")
replace(p,
"export function setTradeRestriction(region, { direction = 'trade', goods = null, counterparties = null,\n  allowed = false, tariffRate = 0 } = {}, regions = [], currentTick = null) {",
"export function setTradeRestriction(region, { direction = 'trade', goods = null, counterparties = null,\n  allowed = false, tariffRate = 0, enforcement = 'communicated' } = {}, regions = [], currentTick = null) {")
replace(p,
"  const oldTariffRate = Math.max(0, Number(oldRule?.tariffRate) || 0);\n",
"  const oldTariffRate = Math.max(0, Number(oldRule?.tariffRate) || 0);\n  const previousAllowed = oldRule ? oldRule.allowed !== false : (direction === 'export' && cleanGoods?.length === 1 ? defaultExportAllowed(cleanGoods[0]) : true);\n  const previousTariffRate = oldTariffRate;\n  const cleanEnforcement = enforcement === 'immediate' ? 'immediate' : 'communicated';\n")
# replace diplomacy loop with queued notices and compute notification ticks
old="""  const harmByActor = {};
  for (const other of affected) {
    const actor = tradeActorId(other);
    const harm = estimateRestrictionHarm(region, other, direction, cleanGoods);
    harmByActor[actor] = Math.max(harmByActor[actor] || 0, harm);
    if (tightening) changeAttitude(other, region.id, -diplomaticMagnitude(harm, other), 'trade_restriction', currentTick);
    else if (loosening) {
      const remembered = Math.max(harm, oldRule?.harmByActor?.[actor] || 0);
      changeAttitude(other, region.id, diplomaticMagnitude(remembered, other) * 0.8, 'trade_liberalisation', currentTick);
    } else if (tariffTightening) {
      const delta = clamp(cleanTariffRate - oldTariffRate, 0, 2);
      changeAttitude(other, region.id, -diplomaticMagnitude(harm, other) * Math.min(0.8, 0.18 + delta * 0.55), 'tariff_increase', currentTick);
    } else if (tariffLoosening) {
      const delta = clamp(oldTariffRate - cleanTariffRate, 0, 2);
      changeAttitude(other, region.id, diplomaticMagnitude(Math.max(harm, oldRule?.harmByActor?.[actor] || 0), other) * Math.min(0.65, 0.12 + delta * 0.45), 'tariff_reduction', currentTick);
    }
  }
"""
new="""  const harmByActor = {};
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
    if (reason && Math.abs(attitudeDelta) > 0) policy.pendingNotices.push({ targetRegionId: other.id, actorId: actor, effectiveTick: noticeTick, attitudeDelta, reason, sourceRegionId: region.id });
  }
"""
replace(p,old,new)
replace(p,
"    tariffRate: cleanTariffRate,\n    changedTick: currentTick,\n    harmByActor,\n",
"    tariffRate: cleanTariffRate,\n    enforcement: cleanEnforcement,\n    previousAllowed, previousTariffRate,\n    notificationTickByActor,\n    changedTick: currentTick,\n    harmByActor,\n")
# removal also defaults to communicated and must notify before liberalisation; preserve old rule as zero-rate transition rather than delete.
old="""export function removeTradeRestriction(region, ruleId, regions = [], currentTick = null) {
  const policy = ensureTradePolicy(region);
  const index = policy.rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) return false;
  const rule = policy.rules[index];
  policy.rules.splice(index, 1);
  if (rule.allowed === false || Number(rule.tariffRate) > 0) {
    const affected = regions.filter((other) => other.id !== region.id &&
      (rule.counterparties === null || rule.counterparties.includes(tradeActorId(other))));
    for (const other of affected) {
      const actor = tradeActorId(other);
      const harm = Math.max(estimateRestrictionHarm(region, other, rule.direction, rule.goods), rule.harmByActor?.[actor] || 0);
      const relief = rule.allowed === false ? 0.8 : Math.min(0.65, 0.12 + Math.max(0, Number(rule.tariffRate) || 0) * 0.45);
      changeAttitude(other, region.id, diplomaticMagnitude(harm, other) * relief, rule.allowed === false ? 'trade_liberalisation' : 'tariff_removed', currentTick);
    }
  }
  return true;
}
"""
new="""export function removeTradeRestriction(region, ruleId, regions = [], currentTick = null, { enforcement = 'communicated' } = {}) {
  const policy = ensureTradePolicy(region);
  const rule = policy.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return false;
  if (rule.allowed !== false && !(Number(rule.tariffRate) > 0)) { policy.rules = policy.rules.filter((candidate) => candidate.id !== ruleId); return true; }
  setTradeRestriction(region, { direction: rule.direction, goods: rule.goods, counterparties: rule.counterparties,
    allowed: true, tariffRate: 0, enforcement }, regions, currentTick);
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
"""
replace(p,old,new)

# trade engine: tick notices, price departures under information known at departure, and grandfather existing ventures.
p='js/economy/trade.js'
replace(p,
"import { borderTariffQuote, tradeAllowed } from './tradePolicy.js?v=20260905-policy1';",
"import { borderTariffQuote, tradeAllowed, tickTradePolicyCommunications } from './tradePolicy.js?v=20260905-policy1';")
replace(p,
"function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, transitContext = null) {",
"function findOpportunities(region, candidateRegions, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, currentTick, transitContext = null) {")
replace(p,
"      const tariffQuote = borderTariffQuote(region, dest, resource);",
"      const tariffQuote = borderTariffQuote(region, dest, resource, 0, { currentTick, departureTick: currentTick });")
replace(p,
"        const tariffQuote = borderTariffQuote(origin, dest, venture.resource);",
"        const tariffQuote = borderTariffQuote(origin, dest, venture.resource, 0, { currentTick, departureTick: venture.departureTick });")
replace(p,
"          const settledTariff = borderTariffQuote(origin, dest, venture.resource, goodsValue);",
"          const settledTariff = borderTariffQuote(origin, dest, venture.resource, goodsValue, { currentTick, departureTick: venture.departureTick });")
replace(p,
"export function tickTrade(regions, currentTick = null, time = null, agreements = [], profiler = null) {\n",
"export function tickTrade(regions, currentTick = null, time = null, agreements = [], profiler = null) {\n  if (Number.isFinite(currentTick)) tickTradePolicyCommunications(regions, currentTick);\n")
replace(p,
"    const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, transitContext);",
"    const opportunities = findOpportunities(region, candidates, knownIdsByRegion, pricesByRegion, regionsById, regions, agreements, currentTick, transitContext);")

# Advisor: default to communicated, offer emergency immediate enforcement, and explain in-flight treatment.
p='js/ui/advisors.js'
replace(p,
"        <label class=\"advisor-field\"><span>Country</span><select id=\"trade-rule-country\"><option value=\"*\">All countries</option>${actors.map((region) => `<option value=\"${tradeActorId(region)}\">${region.name}</option>`).join('')}</select></label>\n        <button id=\"add-trade-embargo\" class=\"advisor-order danger\">Prohibit trade</button>",
"        <label class=\"advisor-field\"><span>Country</span><select id=\"trade-rule-country\"><option value=\"*\">All countries</option>${actors.map((region) => `<option value=\"${tradeActorId(region)}\">${region.name}</option>`).join('')}</select></label>\n        <label class=\"advisor-field\"><span>Enforcement</span><select id=\"trade-rule-enforcement\"><option value=\"communicated\">Give notice — honour cargo sent before notice arrives</option><option value=\"immediate\">Immediate at border — affects cargo already underway</option></select></label>\n        <p class=\"advisor-note\">Normal policy changes travel by the fastest available message route. A distant partner can keep dispatching under the old terms until the notice reaches them. Immediate enforcement is available for emergencies, but can surprise or turn away cargo already at sea.</p>\n        <button id=\"add-trade-embargo\" class=\"advisor-order danger\">Prohibit trade</button>")
replace(p,
"      setTradeRestriction(player, {\n        direction, goods: good === '*' ? null : [good],\n        counterparties: country === '*' ? null : [country], allowed: false,\n      }, this.regions, this.clock.tickIndex);",
"      const enforcement = document.getElementById('trade-rule-enforcement')?.value || 'communicated';\n      setTradeRestriction(player, {\n        direction, goods: good === '*' ? null : [good],\n        counterparties: country === '*' ? null : [country], allowed: false, enforcement,\n      }, this.regions, this.clock.tickIndex);")
replace(p,
"      setTradeRestriction(player, { direction, goods: good === '*' ? null : [good], counterparties: country === '*' ? null : [country], allowed: true, tariffRate: rate }, this.regions, this.clock.tickIndex);",
"      const enforcement = document.getElementById('trade-rule-enforcement')?.value || 'communicated';\n      setTradeRestriction(player, { direction, goods: good === '*' ? null : [good], counterparties: country === '*' ? null : [country], allowed: true, tariffRate: rate, enforcement }, this.regions, this.clock.tickIndex);")

# Add regression coverage.
Path('tools/test-trade-policy-promulgation.mjs').write_text(r'''import assert from 'node:assert/strict';
import { borderTariffQuote, setTradeRestriction, tickTradePolicyCommunications } from '../js/economy/tradePolicy.js?v=test';

function r(id, polity, neighbour){ return { id, name:id, population:1000, wallet:100, treasury:10, controllingActorId:polity, governance:{sovereignPolityId:polity}, neighbors:neighbour?[neighbour]:[], adjacentSeaIds:[], stockpile:{steel:100}, marketDemand:{steel:20}, safetyRating:1, construction:{assets:[]}, horseEconomy:{transport:0}, occupations:{}, relations:new Map() }; }
const importer=r('a','A','b'), exporter=r('b','B','a'), regions=[importer,exporter];
const rule=setTradeRestriction(importer,{direction:'import',goods:['steel'],allowed:false,enforcement:'communicated'},regions,10);
const notice=rule.notificationTickByActor.B;
assert.ok(notice>=11,'physical neighbour notice should take at least one simulation tick');
assert.equal(borderTariffQuote(exporter,importer,'steel',0,{currentTick:10,departureTick:10}).allowed,true,'partner may dispatch before notice arrives');
assert.equal(borderTariffQuote(exporter,importer,'steel',0,{currentTick:notice,departureTick:notice}).allowed,false,'new departures after notice obey embargo');
assert.equal(borderTariffQuote(exporter,importer,'steel',0,{currentTick:notice+5,departureTick:10}).allowed,true,'cargo dispatched before notice is grandfathered on arrival');

const urgentImporter=r('c','C','d'), urgentExporter=r('d','D','c');
setTradeRestriction(urgentImporter,{direction:'import',goods:['steel'],allowed:false,enforcement:'immediate'},[urgentImporter,urgentExporter],20);
assert.equal(borderTariffQuote(urgentExporter,urgentImporter,'steel',0,{currentTick:20,departureTick:15}).allowed,false,'immediate enforcement applies to cargo already underway');

const tariffImporter=r('e','E','f'), tariffExporter=r('f','F','e');
const tariffRule=setTradeRestriction(tariffImporter,{direction:'import',goods:['steel'],allowed:true,tariffRate:.25},[tariffImporter,tariffExporter],30);
const tariffNotice=tariffRule.notificationTickByActor.F;
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'steel',100,{currentTick:30,departureTick:30}).importTariff,0,'tariff is not charged before notice');
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'steel',100,{currentTick:tariffNotice,departureTick:tariffNotice}).importTariff,25,'tariff applies to departures after notice');
assert.equal(borderTariffQuote(tariffExporter,tariffImporter,'steel',100,{currentTick:tariffNotice+4,departureTick:30}).importTariff,0,'pre-notice cargo keeps old tariff');

assert.ok(importer.tradePolicy.pendingNotices.length>0,'foreign reaction is queued rather than telepathic');
tickTradePolicyCommunications(regions, notice-1);
assert.ok(importer.tradePolicy.pendingNotices.length>0,'notice remains pending before delivery');
tickTradePolicyCommunications(regions, notice);
assert.equal(importer.tradePolicy.pendingNotices.length,0,'diplomatic notice resolves on delivery');
console.log('trade policy promulgation regression passed');
''')

# CI workflow.
Path('.github/workflows/trade-policy-promulgation.yml').write_text('''name: Trade policy promulgation\n\non:\n  pull_request:\n    branches: [main]\n    paths:\n      - js/economy/tradePolicy.js\n      - js/economy/trade.js\n      - js/ui/advisors.js\n      - tools/test-trade-policy-promulgation.mjs\n      - tools/test-tariffs-and-labour.mjs\n      - .github/workflows/trade-policy-promulgation.yml\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: node --check js/economy/tradePolicy.js\n      - run: node --check js/economy/trade.js\n      - run: node --check js/ui/advisors.js\n      - run: node tools/test-trade-policy-promulgation.mjs\n      - run: node tools/test-tariffs-and-labour.mjs\n''')
print('trade policy promulgation applied')
