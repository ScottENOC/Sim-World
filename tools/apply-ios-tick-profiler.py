#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'js' / 'main.js'
s = path.read_text()


def replace_once(old, new, label):
    global s
    count = s.count(old)
    assert count == 1, f'{label}: expected exactly one match, found {count}'
    s = s.replace(old, new, 1)


replace_once(
    "import { Clock } from './core/clock.js?v=20260904-weather1';\n",
    "import { Clock } from './core/clock.js?v=20260904-weather1';\nimport { createPerformanceProfiler } from './core/performanceProfiler.js?v=20260911-ios-profiler1';\n",
    'profiler import',
)

replace_once(
    "  const clock = new Clock();\n  const regions = await loadWorld();",
    "  const clock = new Clock();\n  const profiler = createPerformanceProfiler();\n  profiler.mount();\n  const regions = await loadWorld();",
    'profiler setup',
)

replace_once(
    "  clock.onTick((time) => {\n    // Legacy systems",
    "  clock.onTick((time) => {\n    profiler.beginTick(time);\n    // Legacy systems",
    'tick start',
)

replacements = [
    (
        "    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets });",
        "    const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets }));",
        'campaigns',
    ),
    (
        "    const campaignCommandEvents = tickCampaignCommandAdvisor(activeCampaigns, regions, activePlayerPolityId, calendarWeek);",
        "    const campaignCommandEvents = profiler.measure('Campaign command advisor', () => tickCampaignCommandAdvisor(activeCampaigns, regions, activePlayerPolityId, calendarWeek));",
        'campaign advisor',
    ),
    (
        "    prepareConstructionLabor(regions);\n    prepareSiegeWorkforce(regions);",
        "    profiler.measure('Construction + siege prep', () => {\n      prepareConstructionLabor(regions);\n      prepareSiegeWorkforce(regions);\n    });",
        'construction prep',
    ),
    (
        "    tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay);",
        "    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));",
        'economy',
    ),
    (
        "    pruneKnowledge(regions, calendarWeek);",
        "    profiler.measure('Knowledge pruning', () => pruneKnowledge(regions, calendarWeek));",
        'knowledge pruning',
    ),
    (
        "    tickFishingKnowledge(fishingContactPairs, calendarWeek);",
        "    profiler.measure('Knowledge diffusion', () => tickFishingKnowledge(fishingContactPairs, calendarWeek));",
        'knowledge diffusion',
    ),
    (
        "    tickScouting(regions, calendarWeek, Math.random);",
        "    profiler.measure('Scouting', () => tickScouting(regions, calendarWeek, Math.random));",
        'scouting',
    ),
    (
        "    const fleetResult = tickFleets(fleets, regions, seaRegions, agreements, calendarWeek, time.elapsedDays, Math.random, { playerActorId: activePlayerPolityId });",
        "    const fleetResult = profiler.measure('Fleets', () => tickFleets(fleets, regions, seaRegions, agreements, calendarWeek, time.elapsedDays, Math.random, { playerActorId: activePlayerPolityId }));",
        'fleets',
    ),
    (
        "    tickTransitControl(regions, time.elapsedDays);",
        "    profiler.measure('Transit control', () => tickTransitControl(regions, time.elapsedDays));",
        'transit',
    ),
    (
        "    tickTrade(regions, calendarWeek, time, agreements);",
        "    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements));",
        'trade',
    ),
    (
        "    tickMaritimeExperience(regions, activeRaids, time.elapsedDays);",
        "    profiler.measure('Maritime experience', () => tickMaritimeExperience(regions, activeRaids, time.elapsedDays));",
        'maritime',
    ),
    (
        "    tickStateFinance(regions, time.elapsedDays);",
        "    profiler.measure('State finance', () => tickStateFinance(regions, time.elapsedDays));",
        'state finance',
    ),
    (
        "    tickInfrastructureMaintenance(regions, time.elapsedDays);",
        "    profiler.measure('Infrastructure maintenance', () => tickInfrastructureMaintenance(regions, time.elapsedDays));",
        'maintenance',
    ),
    (
        "    const constructionEvents = tickConstruction(regions, calendarWeek, time.elapsedDays);",
        "    const constructionEvents = profiler.measure('Construction', () => tickConstruction(regions, calendarWeek, time.elapsedDays));",
        'construction',
    ),
    (
        "    tickSiegeEquipment(regions, time.elapsedDays);",
        "    profiler.measure('Siege equipment', () => tickSiegeEquipment(regions, time.elapsedDays));",
        'siege equipment',
    ),
    (
        "    const breakthroughEvents = tickBreakthroughs(regions, calendarWeek, Math.random, time.elapsedDays);",
        "    const breakthroughEvents = profiler.measure('Technology breakthroughs', () => tickBreakthroughs(regions, calendarWeek, Math.random, time.elapsedDays));",
        'breakthroughs',
    ),
    (
        "    const religionEvents = tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays);",
        "    const religionEvents = profiler.measure('Religion', () => tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays));",
        'religion',
    ),
    (
        "    tickDemographics(regions, religiousWorld, time.elapsedDays);",
        "    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays));",
        'demographics',
    ),
    (
        "    tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, time.elapsedDays);",
        "    profiler.measure('Communication practices', () => tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, time.elapsedDays));",
        'communication',
    ),
    (
        "    const languageChangeEvents = tickGenerationalLanguageChange(regions, time.elapsedDays);",
        "    const languageChangeEvents = profiler.measure('Language change', () => tickGenerationalLanguageChange(regions, time.elapsedDays));",
        'language change',
    ),
    (
        "    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);",
        "    const diplomatEvents = profiler.measure('Diplomats', () => tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random));",
        'diplomats',
    ),
    (
        "    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);",
        "    const courierEvents = profiler.measure('Diplomatic couriers', () => tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random));",
        'couriers',
    ),
    (
        "    const jointOperationAdvisorEvents = tickPlayerJointOperationAdvisor(playerCapitalForJointPlan, agreements, regionsById, activeCampaigns, calendarWeek);",
        "    const jointOperationAdvisorEvents = profiler.measure('Joint operation advisor', () => tickPlayerJointOperationAdvisor(playerCapitalForJointPlan, agreements, regionsById, activeCampaigns, calendarWeek));",
        'joint advisor',
    ),
    (
        "    const warEvents = syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek);",
        "    const warEvents = profiler.measure('War theatres', () => syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek));",
        'war theatres',
    ),
    (
        "    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);",
        "    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays));",
        'diplomacy',
    ),
    (
        "    if (playerCapitalForPlan) reviewMilitaryStrategy(playerCapitalForPlan, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeek });",
        "    if (playerCapitalForPlan) profiler.measure('Military strategy review', () => reviewMilitaryStrategy(playerCapitalForPlan, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeek }));",
        'military strategy',
    ),
    (
        "    const languagePolicyEvents = tickRegionalLanguagePolicies(regions, polities, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId });",
        "    const languagePolicyEvents = profiler.measure('Language policy', () => tickRegionalLanguagePolicies(regions, polities, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));",
        'language policy',
    ),
    (
        "    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);",
        "    const polityEvents = profiler.measure('Polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays));",
        'polities',
    ),
    (
        "    const continuityEvents = tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId });",
        "    const continuityEvents = profiler.measure('Political continuity', () => tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId }));",
        'continuity',
    ),
    (
        "    tickBanditry(regions, toolTypes, agreements, time.elapsedDays);",
        "    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));",
        'banditry',
    ),
    (
        "    tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions });",
        "    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,\n      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions }));",
        'nation ai',
    ),
    (
        "    const { remaining, events } = tickRaids(activeRaids, regionsById, calendarWeek, toolTypes, Math.random);",
        "    const { remaining, events } = profiler.measure('Raids', () => tickRaids(activeRaids, regionsById, calendarWeek, toolTypes, Math.random));",
        'raids',
    ),
]

for old, new, label in replacements:
    replace_once(old, new, label)

replace_once(
    "    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    map.draw();\n\n    if (selectedRegion && fogOfWar.isVisible(selectedRegion)) {\n      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId);\n    }\n    council.refresh();\n  });",
    "    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);\n    profiler.measure('UI world-map draw', () => map.draw());\n\n    if (selectedRegion && fogOfWar.isVisible(selectedRegion)) {\n      profiler.measure('UI region stats', () => updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId));\n    }\n    profiler.measure('UI council refresh', () => council.refresh());\n    profiler.endTick();\n  });",
    'tick UI tail',
)

replace_once(
    "    fogOfWar,\n    setDevMode: (enabled) => setDevMode(enabled),",
    "    fogOfWar,\n    profiler,\n    setDevMode: (enabled) => setDevMode(enabled),",
    'debug exposure',
)

path.write_text(s)
print('Applied in-game iOS tick profiler instrumentation')
