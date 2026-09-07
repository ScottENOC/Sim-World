#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(path, old, new, label):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'{label}: anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# Construction: a dedicated shore-control project and AI interest in strategic coasts.
patch('js/economy/construction.js', """  naval_base: {
    id: 'naval_base', name: 'Naval base and sheds', requiredTechId: 'naval_warfare', coastal: true, unique: true,
    requiresInfrastructure: 'harbour', minPopulation: 7000,
    description: 'Dedicated warship sheds, stores, repair space and naval administration supporting a fleet that exists to fight rather than merely transport soldiers.',
    workRequired: 10500, defaultWorkers: 135, minWorkers: 40, maxWorkers: 550,
    materials: { stone: 700, wood: 1200, bronze: 30 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.04,
  },
""", """  naval_base: {
    id: 'naval_base', name: 'Naval base and sheds', requiredTechId: 'naval_warfare', coastal: true, unique: true,
    requiresInfrastructure: 'harbour', minPopulation: 7000,
    description: 'Dedicated warship sheds, stores, repair space and naval administration supporting a fleet that exists to fight rather than merely transport soldiers.',
    workRequired: 10500, defaultWorkers: 135, minWorkers: 40, maxWorkers: 550,
    materials: { stone: 700, wood: 1200, bronze: 30 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.04,
  },
  coastal_fortifications: {
    id: 'coastal_fortifications', name: 'Coastal and strait fortifications', requiredTechId: 'hill_forts', coastal: true, unique: true,
    description: 'Fortified headlands, signal towers, protected anchorages and defended shore positions. On a narrow passage these works make persistent toll collection and naval interdiction far more credible.',
    workRequired: 11500, defaultWorkers: 150, minWorkers: 45, maxWorkers: 650,
    materials: { stone: 1250, wood: 650, bronze: 25 }, wagePerWorkerWeek: 0.002, maintenanceRate: 0.035,
  },
""", 'coastal fort construction')
patch('js/economy/construction.js', """      ['naval_base', (region.navy?.boats || 0) > 8 ? 7 : 2],
      ['administrative_centre', (region.population || 0) > 12000 ? 6 : 2],
""", """      ['naval_base', (region.navy?.boats || 0) > 8 ? 7 : 2],
      ['coastal_fortifications', region.isCoastal && (region.adjacentSeaIds || []).length >= 2 ? 8 : 1],
      ['administrative_centre', (region.population || 0) > 12000 ? 6 : 2],
""", 'AI coastal fort priority')

# Main loop: accumulate control before trade and pass agreements for exemptions.
patch('js/main.js', """import { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';
""", """import { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';
import { tickTransitControl } from './economy/transitTolls.js?v=20260907-transit1';
""", 'main transit import')
patch('js/main.js', """    tickScouting(regions, calendarWeek, Math.random);
    tickTrade(regions, calendarWeek, time);
    tickMaritimeExperience(regions, activeRaids, time.elapsedDays);
""", """    tickScouting(regions, calendarWeek, Math.random);
    tickTransitControl(regions, time.elapsedDays);
    tickTrade(regions, calendarWeek, time, agreements);
    tickMaritimeExperience(regions, activeRaids, time.elapsedDays);
""", 'main transit tick')

# Nation AI: rulers use tolls where they have real infrastructure/control.
patch('js/ai/nationAi.js', """import { applyMemoryDrivenNpcPolicy, npcMemorySignals } from './memoryDrivenAi.js?v=20260907-memory-ai1';
""", """import { applyMemoryDrivenNpcPolicy, npcMemorySignals } from './memoryDrivenAi.js?v=20260907-memory-ai1';
import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';
""", 'AI transit import')
patch('js/ai/nationAi.js', """    chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks);
    maybeAdjustTradeEmbargo(region, regionsById, currentTick);
""", """    chooseAiReligion(region, religiousWorld, currentTick, rng, strategicWeeks);
    maybeManageTransitTolls(region, regions, rng);
    maybeAdjustTradeEmbargo(region, regionsById, currentTick);
""", 'AI transit call')
patch('js/ai/nationAi.js', """function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {
""", """function maybeManageTransitTolls(region, regions, rng) {
  const summary = transitPolicySummary(region, regions);
  const trade = region.tradeEconomy || {};
  const throughput = Math.max(0, (trade.exportIncomeEma || 0) + (trade.importSpendEma || 0));
  const treasuryPressure = (region.treasury || 0) < Math.max(20, (region.population || 0) * 0.002);
  const hasRoadAdministration = (region.construction?.assets || []).some((asset) => asset.typeId === 'road_network' && (asset.condition || 0) > 0.5) &&
    (region.construction?.assets || []).some((asset) => asset.typeId === 'market_customs' && (asset.condition || 0) > 0.5);
  if (hasRoadAdministration) {
    const desired = treasuryPressure ? 0.035 : throughput > 80 ? 0.018 : 0.01;
    setRoadTollPolicy(region, { rate: desired, alliesFree: true });
  }
  for (const entry of summary.nearby) {
    if (!entry.controlledByUs || entry.control < 0.30) continue;
    const customs = (region.construction?.assets || []).some((asset) => asset.typeId === 'market_customs' && (asset.condition || 0) > 0.5);
    if (!customs) continue;
    const desired = treasuryPressure ? 0.055 : throughput > 100 ? 0.03 : 0.018;
    // Small variation stops every AI from converging on the exact same nominal rate.
    setChokepointTollPolicy(region, entry.id, { rate: desired * (0.9 + rng() * 0.2), alliesFree: true });
  }
}

function maybeAdjustTradeEmbargo(region, regionsById, currentTick) {
""", 'AI transit function')

# Treasurer UI: player controls road and chokepoint tolls; allies-free is explicit.
patch('js/ui/advisors.js', """import { activeTradeRestrictions, removeTradeRestriction, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';
""", """import { activeTradeRestrictions, removeTradeRestriction, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';
import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';
""", 'advisor transit import')
patch('js/ui/advisors.js', """    const goods = Object.entries(TRADE_GOODS);
    const ruleLabel = (rule) => {
""", """    const goods = Object.entries(TRADE_GOODS);
    const transit = transitPolicySummary(player, this.regions);
    const ruleLabel = (rule) => {
""", 'advisor transit summary')
patch('js/ui/advisors.js', """      ${section('Trade restrictions', `
""", """      ${section('Transit tolls', `
        ${row('Toll revenue this tick', (transit.tollRevenueThisTick || 0).toFixed(1))}
        <label class=\"advisor-field advisor-slider\"><span>Road transit toll <b id=\"road-toll-label\">${Math.round((transit.roadPolicy.rate || 0) * 100)}%</b></span><input id=\"road-toll-rate\" type=\"range\" min=\"0\" max=\"20\" value=\"${Math.round((transit.roadPolicy.rate || 0) * 100)}\"></label>
        <label class=\"advisor-field\"><span>Military-support allies</span><select id=\"road-allies-free\"><option value=\"yes\" ${transit.roadPolicy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value=\"no\" ${transit.roadPolicy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>
        <p class=\"advisor-note\">Road tolls apply only to merchants crossing an intermediate region with an operational road network. Repeated tolling creates bounded resentment based on the burden; it does not subtract relations forever.</p>
        ${transit.nearby.length ? transit.nearby.map((entry) => `<div class=\"advisor-report-row\"><span>${entry.label}</span><strong>${entry.controlledByUs ? `control ${percent(entry.control)}` : 'not under our effective control'}</strong></div>
          <label class=\"advisor-field advisor-slider\"><span>${entry.label} toll <b id=\"cp-toll-label-${entry.id}\">${Math.round((entry.policy.rate || 0) * 100)}%</b></span><input data-cp-toll=\"${entry.id}\" type=\"range\" min=\"0\" max=\"20\" value=\"${Math.round((entry.policy.rate || 0) * 100)}\" ${entry.controlledByUs ? '' : 'disabled'}></label>
          <label class=\"advisor-field\"><span>${entry.label}: military-support allies</span><select data-cp-allies=\"${entry.id}\" ${entry.controlledByUs ? '' : 'disabled'}><option value=\"yes\" ${entry.policy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value=\"no\" ${entry.policy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>`).join('') : '<p class=\"advisor-note\">This region is not close enough to a major mapped maritime chokepoint to enforce passage tolls.</p>'}`)}
      ${section('Trade restrictions', `
""", 'advisor transit section')
patch('js/ui/advisors.js', """    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
""", """    const roadToll = document.getElementById('road-toll-rate');
    const roadAllies = document.getElementById('road-allies-free');
    const updateRoadToll = () => {
      if (!roadToll) return;
      setRoadTollPolicy(player, { rate: Number(roadToll.value) / 100, alliesFree: roadAllies?.value !== 'no' });
      const label = document.getElementById('road-toll-label'); if (label) label.textContent = `${roadToll.value}%`;
    };
    roadToll?.addEventListener('input', updateRoadToll); roadAllies?.addEventListener('change', updateRoadToll);
    document.querySelectorAll('[data-cp-toll]').forEach((input) => input.addEventListener('input', () => {
      const id = input.dataset.cpToll;
      const allies = document.querySelector(`[data-cp-allies=\"${id}\"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input.value) / 100, alliesFree: allies?.value !== 'no' });
      const label = document.getElementById(`cp-toll-label-${id}`); if (label) label.textContent = `${input.value}%`;
    }));
    document.querySelectorAll('[data-cp-allies]').forEach((select) => select.addEventListener('change', () => {
      const id = select.dataset.cpAllies;
      const input = document.querySelector(`[data-cp-toll=\"${id}\"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: select.value !== 'no' });
    }));
    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
""", 'advisor transit wiring')

print('Transit control integration patched')
