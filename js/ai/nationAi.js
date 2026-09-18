// Deliberately simple, reactive rules rather than deep planning — these are
// Bronze Age chiefdoms, not general staffs. Every non-player region gets:
// a military target that scales with how threatened it feels, and an
// occasional, cautious evaluation of whether raiding a reachable neighbor
// is clearly worth it. AI only considers regions it has actually met.
import { toolEfficiencyMultiplier } from '../economy/tools.js?v=20260904-weather1';
import { canRaid, launchRaid } from '../military/raiding.js?v=20260905-projects1';
import { directContactIds, knowledgeOf, KNOWLEDGE_THRESHOLDS } from '../core/knowledge.js?v=20260904-weather1';
import { militaryReadiness } from '../economy/stateFinance.js?v=20260904-weather1';
import { horseMilitaryMultiplier } from '../economy/horses.js?v=20260904-policy1';
import { activeAgreementBetween, attitudeToward, canDiplomaticallyReach, powerRatio, proposeAgreement } from '../diplomacy/relations.js?v=20260904-save1';
import { demandVassalage } from '../politics/polities.js?v=20260904-war1';
import { chooseAiMilitaryPolicies } from '../military/policies.js?v=20260904-policy1';
import { canCampaign, massMobiliseDefender, requestCampaignWithdrawal } from '../military/campaigns.js?v=20260905-projects1';
import { executeGovernmentCampaign } from '../politics/governmentActionExecution.js?v=20260916-institution-integration1';
import { institutionalContextForPolity } from '../politics/institutionalIntegration.js?v=20260916-institution-integration1';
import { chooseAiConstruction } from '../economy/construction.js?v=20260905-projects1';
import { chooseAiSiegeTargets } from '../military/siegeEquipment.js?v=20260905-projects1';
import { chooseAiReligion, religiousWarModifier } from '../society/religion.js?v=20260905-religion1';
import { activeTariffs, activeTradeRestrictions, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';
import { TRADE_GOODS } from '../economy/tradeGoods.js?v=20260905-goods2';
import { buildScoutingContext, startScoutingMission } from '../core/scouting.js?v=20260906-scouting1';
import { applyMemoryDrivenNpcPolicy, npcMemorySignals } from './memoryDrivenAi.js?v=20260907-memory-ai1';
import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';
import { buildMilitaryStrategyContext, chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';
import { chooseSupplyAwareCampaignDirective } from '../military/supplyAwareAi.js?v=20260908-supply-ai1';
import { chooseDefensiveCounterLogistics } from '../military/counterLogisticsAi.js?v=20260909-counter-logistics1';
import { coordinateExpeditionRelief } from '../military/expeditionReliefAi.js?v=20260909-relief1';
import { chooseNpcDiplomatPosting } from '../diplomacy/diplomats.js?v=20260909-diplomats1';
import { activateJointOperations } from '../military/jointOperations.js?v=20260909-joint-ops1';
import { maybeLaunchCivilWarCampaign } from '../politics/civilWarFactions.js?v=20260913-civil-war2';

const BASE_ARMY_FRACTION = 0.01;
const THREAT_ARMY_MULTIPLIER = 2.0;
const BASE_NAVY_PER_POPULATION = 50000;
const RAID_CONSIDERATION_CHANCE_PER_WEEK = 0.005;
const MIN_HOME_ARMY_TO_CONSIDER_RAIDING = 30;
const MIN_SAFETY_TO_CONSIDER_RAIDING = 0.3;
const MIN_ADVANTAGE_TO_RAID = 1.5;
const DEFENDER_HOME_ADVANTAGE = 1.3;
const DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK = 0.0015;
const CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK = 0.0007;
const EMBARGO_REVIEW_INTERVAL = 26;
const STRATEGIC_REVIEW_INTERVAL = 13;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities, religiousWorld, currentTick, toolTypes, rng, elapsedDays = 7, options = {}) {
  const baseWeekScale = Math.max(0.01, elapsedDays / 7);
  const profiler = options.profiler;
  const detail = (label, fn) => profiler?.measureDetail ? profiler.measureDetail(`Nation AI: ${label}`, fn) : fn();
  const metric = (label, value) => profiler?.metric?.(`Nation AI ${label}`, value);
  const regionsById = detail('build region index', () => new Map(regions.map((region) => [region.id, region])));
  const militaryStrategyContext = detail('military strategy context', () => buildMilitaryStrategyContext(regions, agreements, polities, currentTick, activeCampaigns));
  const scoutingContext = detail('scouting context', () => buildScoutingContext(regions, regionsById));
  let aiRegions = 0;
  let strategicReviews = 0;
  detail('campaign management', () => manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options));
  for (const region of regions) {
    if (region.controllingActorId !== playerRegionId) detail('joint operations', () => activateJointOperations(region, regionsById, agreements, activeCampaigns, polities, currentTick, rng));
    if (region.controllingActorId === playerRegionId) continue;
    aiRegions += 1;
    detail('military policy', () => chooseAiMilitaryPolicies(region));
    detail('military strategy', () => chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns, militaryStrategyContext));
    const strategicWeeks = strategicReviewWeeks(region, currentTick, baseWeekScale);
    if (strategicWeeks <= 0) continue;
    strategicReviews += 1;
    const chance = (weekly) => 1 - Math.pow(1 - weekly, strategicWeeks);
    detail('memory policy', () => applyMemoryDrivenNpcPolicy(region, religiousWorld, currentTick, rng, strategicWeeks));
    detail('construction choice', () => chooseAiConstruction(region, currentTick, rng));
    detail('siege choice', () => chooseAiSiegeTargets(region));
    detail('religion choice', () => chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks));
    detail('transit tolls', () => maybeManageTransitTolls(region, regions, rng));
    detail('trade embargo', () => maybeAdjustTradeEmbargo(region, regionsById, currentTick));
    detail('labour tariff', () => maybeAdjustLabourTariff(region, regionsById, currentTick));
    detail('scouting choice', () => maybeScout(region, regionsById, currentTick, rng, scoutingContext));
    detail('diplomat posting', () => chooseNpcDiplomatPosting(region, regions, currentTick, rng));
    detail('agreement choice', () => maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK)));
    const launchedCivilWarCampaign = detail('civil war choice', () => maybeLaunchCivilWarCampaign(region, regionsById, activeCampaigns, polities, currentTick, rng));
    if (!launchedCivilWarCampaign) detail('campaign choice', () => maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, chance(CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK)));
    detail('raid choice', () => maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, chance(RAID_CONSIDERATION_CHANCE_PER_WEEK)));
  }
  metric('regions evaluated', aiRegions); metric('strategic reviews', strategicReviews); metric('active campaigns', activeCampaigns.length); metric('active raids', activeRaids.length);
}

function strategicReviewWeeks(region, currentTick, fallbackWeeks) {
  if (!Number.isFinite(currentTick)) return fallbackWeeks;
  const offset = stableAiHash(region.id) % STRATEGIC_REVIEW_INTERVAL;
  const bucket = Math.floor((currentTick - offset) / STRATEGIC_REVIEW_INTERVAL);
  if (!Number.isFinite(region._lastStrategicAiTick)) {
    if (currentTick < offset) return 0;
    region._lastStrategicAiTick = currentTick; region._lastStrategicAiBucket = bucket; return fallbackWeeks;
  }
  if (region._lastStrategicAiBucket === bucket) return 0;
  const elapsed = Math.max(fallbackWeeks, currentTick - region._lastStrategicAiTick);
  region._lastStrategicAiTick = currentTick; region._lastStrategicAiBucket = bucket; return elapsed;
}

function maybeManageTransitTolls(region, regions, rng) {
  const summary = transitPolicySummary(region, regions); const trade = region.tradeEconomy || {};
  const throughput = Math.max(0, (trade.exportIncomeEma || 0) + (trade.importSpendEma || 0));
  const treasuryPressure = (region.treasury || 0) < Math.max(20, (region.population || 0) * 0.002);
  const hasRoadAdministration = (region.construction?.assets || []).some((asset) => asset.typeId === 'road_network' && (asset.condition || 0) > 0.5) && (region.construction?.assets || []).some((asset) => asset.typeId === 'market_customs' && (asset.condition || 0) > 0.5);
  if (hasRoadAdministration) setRoadTollPolicy(region, { rate: treasuryPressure ? 0.035 : throughput > 80 ? 0.018 : 0.01, alliesFree: true });
  for (const entry of summary.nearby) {
    if (!entry.controlledByUs || entry.control < 0.30) continue;
    const customs = (region.construction?.assets || []).some((asset) => asset.typeId === 'market_customs' && (asset.condition || 0) > 0.5); if (!customs) continue;
    const desired = treasuryPressure ? 0.055 : throughput > 100 ? 0.03 : 0.018;
    const access = entry.control >= 0.78 && (region.militaryPolicy?.navalPriority === 'war') ? 'hostile' : 'open';
    setChokepointTollPolicy(region, entry.id, { rate: desired * (0.9 + rng() * 0.2), alliesFree: true, access });
  }
}

function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {
  if (!Number.isFinite(currentTick)) return;
  const offset = stableAiHash(region.id) % EMBARGO_REVIEW_INTERVAL; const bucket = Math.floor((currentTick - offset) / EMBARGO_REVIEW_INTERVAL);
  if (region._lastEmbargoReviewBucket === bucket || (region._lastEmbargoReviewBucket === undefined && currentTick < offset)) { region._lastEmbargoReviewBucket = bucket; return; }
  region._lastEmbargoReviewBucket = bucket;
  const existing = activeTradeRestrictions(region); const known = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);
  for (const target of known) {
    const actor = tradeActorId(target); const hostility = attitudeToward(region, target.id);
    const keyRule = existing.find((rule) => rule.direction === 'trade' && rule.goods === null && rule.counterparties?.includes(actor));
    if (hostility <= -0.72 && !keyRule) setTradeRestriction(region, { direction: 'trade', goods: null, counterparties: [actor], allowed: false }, [...regionsById.values()], currentTick);
    else if (hostility >= -0.35 && keyRule) setTradeRestriction(region, { direction: 'trade', goods: null, counterparties: [actor], allowed: true }, [...regionsById.values()], currentTick);
  }
}

function maybeAdjustLabourTariff(region, regionsById, currentTick) {
  if (!Number.isFinite(currentTick)) return;
  const labour = region.labourRelations || {};
  const employment = region.employment || {};
  const trade = region.tradeEconomy || {};
  const grievance = clamp01(labour.grievance || 0);
  const unemployment = clamp01(employment.unemploymentRate || 0);
  const hardship = clamp01(employment.hardship || 0);
  const industrial = clamp01(region.structuralTransformation?.industrialShare || 0);
  const tariffBurden = clamp01(trade.importTariffBurdenEma || 0);
  const tariffs = activeTariffs(region).filter((rule) => rule.direction === 'import' || rule.direction === 'trade');

  // If duties themselves have become a major household/input burden, unwind the
  // highest one first. NPCs therefore face the same trade-off as the player.
  if ((tariffBurden > 0.14 || hardship > 0.55) && tariffs.length) {
    const highest = tariffs.slice().sort((a,b)=>(b.tariffRate||0)-(a.tariffRate||0))[0];
    const next = Math.max(0, (highest.tariffRate || 0) - 0.05);
    setTradeRestriction(region, { direction: highest.direction, goods: highest.goods, counterparties: highest.counterparties, allowed: true, tariffRate: next }, [...regionsById.values()], currentTick);
    return;
  }
  if (grievance < 0.28 || unemployment < 0.08 || industrial < 0.22 || tariffBurden > 0.10) return;

  const imports = Object.entries(trade.importSpendByResourceEma || {})
    .filter(([resource, value]) => value > 0.5 && ['manufactured','consumer_good','civilian_equipment'].includes(TRADE_GOODS[resource]?.category))
    .sort((a,b)=>b[1]-a[1]);
  if (!imports.length) return;
  const resource = imports[0][0];
  const existing = (region.tradePolicy?.rules || []).find((rule) => rule.direction === 'import' && rule.goods?.length === 1 && rule.goods[0] === resource && rule.counterparties === null);
  if (existing?.allowed === false) return;
  const desired = Math.min(0.30, 0.08 + unemployment * 0.55 + grievance * 0.20);
  if ((existing?.tariffRate || 0) >= desired - 0.01) return;
  setTradeRestriction(region, { direction: 'import', goods: [resource], counterparties: null, allowed: true, tariffRate: desired }, [...regionsById.values()], currentTick);
}

function maybeScout(region, regionsById, currentTick, rng, scoutingContext = null) {
  if (region.scouting?.active) return;
  const contacts = directContactIds(region).size; const demand = region.marketDemand || {};
  const unmet = ['food', 'bronze', 'copper', 'wood', 'clothing'].reduce((sum, key) => sum + Math.max(0, Number(demand[key]) || 0), 0);
  const population = Math.max(1, region.population || 1); const shortagePressure = Math.min(1, unmet / Math.max(50, population * 0.02));
  const tradeExperience = (region.recentTradePartners?.size || 0) > 0 || (region.occupations?.trader || 0) > 0 || (region.tradeEconomy?.exportIncomeEma || 0) + (region.tradeEconomy?.importSpendEma || 0) > 20;
  if (!tradeExperience && shortagePressure < 0.15 && contacts >= 2) return;
  const isolation = Math.max(0, 1 - contacts / 5); const motive = shortagePressure * 0.55 + (tradeExperience ? 0.25 : 0) + isolation * 0.2;
  if (motive < 0.18 || rng() > Math.min(0.65, motive)) return;
  startScoutingMission(region, [...regionsById.values()], currentTick, rng, 'auto', null, scoutingContext);
}

function stableAiHash(value) { let hash = 2166136261; for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }

function manageCampaigns(campaigns, regionsById, playerRegionId, rng, currentTick, options = {}) {
  const fleets = options.fleets || []; const seaRegionsById = new Map((options.seaRegions || []).map((region) => [region.id, region]));
  for (const campaign of campaigns) {
    if (campaign.phase !== 'engaged') continue;
    const attacker = regionsById.get(campaign.attackerId); const defender = regionsById.get(campaign.defenderId); if (!attacker || !defender) continue;
    if (defender.controllingActorId !== playerRegionId) {
      if (campaign.militia <= 0 && (campaign.pressure >= 0.18 || campaign.defenderMorale < 0.65)) massMobiliseDefender(campaign, defender, 0.1 + rng() * 0.1);
      chooseDefensiveCounterLogistics(campaign, attacker, defender, currentTick, rng);
    }
    if (attacker.controllingActorId !== playerRegionId) {
      const supplyDecision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender); const relief = coordinateExpeditionRelief(campaign, attacker, defender, fleets, regionsById, seaRegionsById, currentTick);
      const desperate = (supplyDecision.riskTolerance || 0) >= 0.72; const canOrderlyWithdraw = (campaign.logisticsState?.routeReliability ?? 1) >= 0.20; const evacuationOrdered = relief.directive === 'evacuate_if_possible';
      if (evacuationOrdered || campaign.attackerMorale < 0.22 || (!desperate && canOrderlyWithdraw && campaign.supply < 0.3 && campaign.pressure < 0.45)) requestCampaignWithdrawal(campaign);
    }
  }
}

function npcCampaignContext(region, target, polities, regionsById) {
  const polity = polities.find((p) => p.id === (region.governance?.sovereignPolityId || region.polityId));
  const base = polity ? institutionalContextForPolity(polity, [...regionsById.values()]) : {};
  const hostility = clamp01(-attitudeToward(region, target.id));
  const threat = clamp01(1 - (region.safetyRating ?? 1));
  const fiscalStress = clamp01(1 - (region.militaryFinance?.payRatio ?? 1));
  return { ...base, hostility, threat, fiscalStress, defensive: false, publicSupport: clamp01((base.publicSupport ?? 0.5) * 0.65 + hostility * 0.35), executivePressure: clamp01(0.45 + hostility * 0.3) };
}

function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0 || region.army.personnel < 100 || rng() > considerationChance) return;
  const candidates = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);
  const hostPolity = polities.find((p) => p.capitalRegionId === region.id);
  if (hostPolity) {
    let restoration = null;
    for (const claimant of polities) {
      const continuity = claimant.continuity; const backing = continuity?.exileSupport?.[hostPolity.id] || 0;
      if (continuity?.status !== 'exile' || backing < 0.7) continue;
      for (const target of candidates) {
        const claim = continuity.claims?.[target.id] || 0; if (claim < 0.65 || target.governance?.sovereignPolityId === claimant.id) continue;
        const reach = canCampaign(region, target, activeCampaigns, [...regionsById.values()], polities); if (!reach.possible) continue;
        const estimatedDefenders = Math.max(25, (target.army?.personnel || target.population * 0.006) * 1.8); const advantage = region.army.personnel / estimatedDefenders; if (advantage < 1.4) continue;
        const score = backing * 0.5 + claim * 0.35 + Math.min(2.5, advantage) * 0.15; if (!restoration || score > restoration.score) restoration = { claimant, target, backing, claim, advantage, score };
      }
    }
    if (restoration) {
      const requested = Math.floor(region.army.personnel * (0.65 + rng() * 0.2));
      const result = executeGovernmentCampaign(region, restoration.target, 'liberation', requested, currentTick, { campaigns: activeCampaigns, regions: [...regionsById.values()], polities, beneficiaryPolityId: restoration.claimant.id, npc: true, rng, context: npcCampaignContext(region, restoration.target, polities, regionsById) });
      if (result.campaign) { activeCampaigns.push(result.campaign); return; }
    }
  }
  let best = null;
  for (const target of candidates) {
    const reach = canCampaign(region, target, activeCampaigns, [...regionsById.values()], polities); if (!reach.possible) continue;
    const familiarity = knowledgeOf(region, target.id); const estimatedDefenders = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED ? target.army.personnel : familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION ? target.demographics.workingAge * 0.015 : target.population * 0.006;
    const advantage = region.army.personnel / Math.max(25, estimatedDefenders * 1.8); if (advantage < 1.35) continue;
    const hostility = -attitudeToward(region, target.id); const religiousPressure = religiousWarModifier(region, target, religiousWorld, currentTick); if (religiousPressure < 0.5 && hostility < 0.7) continue;
    const score = (advantage + hostility + (target.wallet || 0) / Math.max(1, target.population) * 0.01) * religiousPressure; if (!best || score > best.score) best = { target, score, advantage };
  }
  if (!best) return;
  const memory = npcMemorySignals(region); const culturalRestraint = Math.max(memory.politicalLoss, memory.politicalContinuity * 0.55); const subjugationThreshold = 2.4 + culturalRestraint * 0.45; const devastationHostility = -0.65 - culturalRestraint * 0.18;
  const objective = best.advantage > subjugationThreshold && rng() < Math.max(0.12, 0.35 - culturalRestraint * 0.16) ? 'subjugation' : attitudeToward(region, best.target.id) < devastationHostility ? 'devastation' : 'punitive';
  const requested = Math.floor(region.army.personnel * (0.65 + rng() * 0.25));
  const result = executeGovernmentCampaign(region, best.target, objective, requested, currentTick, { campaigns: activeCampaigns, regions: [...regionsById.values()], polities, npc: true, rng, context: npcCampaignContext(region, best.target, polities, regionsById) });
  if (result.campaign) activeCampaigns.push(result.campaign);
}

function maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, considerationChance = DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK) {
  if (rng() > considerationChance) return;
  const candidates = [...directContactIds(region)].map((id) => regionsById.get(id)).filter((target) => target && target.id !== playerRegionId && canDiplomaticallyReach(region, target)); if (candidates.length === 0) return;
  const aidTarget = candidates.filter((target) => target.banditPopulation > target.population * 0.02 && attitudeToward(region, target.id) > 0.2).sort((a, b) => b.banditPopulation / Math.max(1, b.population) - a.banditPopulation / Math.max(1, a.population))[0];
  if (aidTarget && !activeAgreementBetween(agreements, region.id, aidTarget.id, 'military_support')) { const personnel = Math.floor(Math.min(region.army.personnel * 0.15, aidTarget.banditPopulation * 0.5)); proposeAgreement('military_support', region, aidTarget, agreements, toolTypes, currentTick, { personnel }); return; }
  const weakTargets = candidates.map((target) => ({ target, ratio: powerRatio(region, target, toolTypes) })).filter(({ target, ratio }) => ratio >= 1.6 && attitudeToward(region, target.id) < 0.45 && !activeAgreementBetween(agreements, region.id, target.id)).sort((a, b) => b.ratio - a.ratio); if (weakTargets.length === 0) return;
  if (weakTargets[0].ratio >= 2.2 && rng() < 0.2) { demandVassalage(region, weakTargets[0].target, polities, toolTypes, currentTick, [...regionsById.values()]); return; }
  proposeAgreement(rng() < 0.65 ? 'tribute' : 'resource_access', region, weakTargets[0].target, agreements, toolTypes, currentTick);
}

function setMilitaryTargets(region) {
  const threatFactor = 1 + (1 - clamp01(region.safetyRating)) * THREAT_ARMY_MULTIPLIER; region.targetArmySize = Math.round(region.demographics.workingAge * BASE_ARMY_FRACTION * threatFactor);
  if (region.isCoastal) region.targetNavySize = Math.max(region.targetNavySize, Math.round(region.population / BASE_NAVY_PER_POPULATION));
}

function maybeRaid(region, regionsById, activeRaids, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = RAID_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0 || region.army.personnel < MIN_HOME_ARMY_TO_CONSIDER_RAIDING || region.safetyRating < MIN_SAFETY_TO_CONSIDER_RAIDING || rng() > considerationChance) return;
  const ownEquip = toolEfficiencyMultiplier(region, 'soldier', toolTypes.soldier, region.unlockedTechIds); const ownPower = region.army.personnel * ownEquip * militaryReadiness(region) * horseMilitaryMultiplier(region);
  let best = null; let bestScore = -Infinity;
  for (const targetId of directContactIds(region)) {
    const target = regionsById.get(targetId); if (!target || target.id === region.id) continue; const reach = canRaid(region, target, [...regionsById.values()], polities); if (!reach.possible) continue;
    const familiarity = knowledgeOf(region, target.id); const knowsPopulation = familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION; const knowsDetailed = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED;
    const estimatedArmy = knowsDetailed ? target.army.personnel * militaryReadiness(target) : knowsPopulation ? Math.max(10, target.demographics.workingAge * 0.02) : Math.max(10, target.population * 0.005);
    const targetEquip = knowsDetailed ? toolEfficiencyMultiplier(target, 'soldier', toolTypes.soldier, target.unlockedTechIds) : 1; const targetPower = estimatedArmy * targetEquip * DEFENDER_HOME_ADVANTAGE; const advantage = ownPower / (targetPower + 1); if (advantage < MIN_ADVANTAGE_TO_RAID) continue;
    const attitude = attitudeToward(region, target.id); if (attitude > 0.65 && advantage < MIN_ADVANTAGE_TO_RAID * 2) continue;
    const knownWealth = knowsDetailed ? target.wallet + (target.stockpile.bronze || 0) * 5 + (target.stockpile.gold || 0) * 15 : knowsPopulation ? target.population * 0.1 : 1;
    const hostilityMultiplier = Math.max(0.2, 1 - attitude * 0.8); const religiousPressure = religiousWarModifier(region, target, religiousWorld, currentTick); if (religiousPressure < 0.5 && attitude > -0.7) continue;
    const score = advantage * (knownWealth + 1) * hostilityMultiplier * religiousPressure; if (score > bestScore) { bestScore = score; best = { target, viaSea: reach.viaSea }; }
  }
  if (!best) return; const requested = Math.floor(region.army.personnel * (0.5 + rng() * 0.3)); const raid = launchRaid(region, best.target, requested, best.viaSea, currentTick, { regions: [...regionsById.values()], polities }); if (raid) activeRaids.push(raid);
}
