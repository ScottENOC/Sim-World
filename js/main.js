import { Clock } from './core/clock.js?v=20260904-weather1';
import { createPerformanceProfiler } from './core/performanceProfiler.js?v=20260912-deep-profiler1';
import { calendarWeekIndex } from './core/simTime.js?v=20260905-time2';
import { EventBus } from './core/eventBus.js?v=20260904-weather1';
import { loadWorld } from './world/region.js?v=20260912-silkroad1';
import { loadSeaWorld, linkSeaAdjacency } from './world/seaRegion.js?v=20260912-silkroad1';
import { seedCensus, densityPerKm2 } from './society/census.js?v=20260904-weather1';
import { tickEconomy } from './economy/labor.js?v=20260912-silkroad1';
import { tickTrade } from './economy/trade.js?v=20260912-medieval1';
import { tickStateFinance } from './economy/stateFinance.js?v=20260912-currency2';
import { tickDemographics } from './society/demographics.js?v=20260912-culture-scale1';
import { tickDisease } from './society/disease.js?v=20260912-disease1';
import './ui/diseasePolicyUi.js?v=20260912-disease1';
import { tickBanditry } from './military/banditry.js?v=20260905-projects1';
import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable, syncNextRaidId } from './military/raiding.js?v=20260912-medieval1';
import { tickNationAi } from './ai/nationAi.js?v=20260905-projects1';
import { skillMultiplier, LEARNABLE_ACTIVITIES } from './technology/learningByDoing.js?v=20260904-weather1';
import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID, CATAPULT_TECH_ID } from './technology/breakthroughs.js?v=20260912-medieval1';
import { tickGunpowderIndustry } from './military/firearms.js?v=20260912-gunpowder1';
import { MapRenderer } from './ui/mapRenderer.js?v=20260904-war1';
import { AdvisorCouncil } from './ui/advisors.js?v=20260905-projects1';
import { renderDiplomaticServicePanel } from './ui/diplomaticServicePanel.js?v=20260909-diplomatic-ui1';
import { buildSocialOverlayLayers } from './ui/socialOverlays.js?v=20260910-social-overlays1';
import { loadWorldSpatialGraph } from './world/spatialBaseLoader.js?v=20260910-spatial1';
import { syncRegionSpatialSites } from './world/spatialGraph.js?v=20260910-spatial1';
import { createLocalRegionView } from './ui/localRegionView.js?v=20260910-spatial1';
import { ensureSubregionalControl } from './military/subregionalControl.js?v=20260908-subregion1';
import { FogOfWar } from './core/fogOfWar.js?v=20260904-weather1';
import { buildFishingContactPairs, initialiseKnowledge, pruneKnowledge, tickFishingKnowledge, KNOWLEDGE_THRESHOLDS, knowledgeLevel, knowledgeStage, compassDirection } from './core/knowledge.js?v=20260906-scouting1';
import { startScoutingMission, tickScouting } from './core/scouting.js?v=20260906-scouting1';
import { attitudeLabel, attitudeToward, canDiplomaticallyReach, endAgreement, proposeAgreement, syncNextAgreementId, tickDiplomacy } from './diplomacy/relations.js?v=20260912-migration-diplomacy1';
import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, polityById, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260912-currency2';
import { tickMedievalInstitutions } from './politics/medievalInstitutions.js?v=20260912-medieval-politics1';
import { tickMedievalStateSystems } from './politics/medievalStateSystems.js?v=20260912-medieval2';
import { tickMedievalCommercialInstitutions } from './economy/medievalCommercialInstitutions.js?v=20260912-medieval2';
import { tickMedievalDoctrine } from './military/medievalDoctrine.js?v=20260912-medieval2';
import { tickNonStateOrganisations } from './politics/nonStateOrganisations.js?v=20260912-organisations1';
import { tickPrivateMilitaryActors } from './politics/privateMilitaryActors.js?v=20260912-pmc1';
import { tickOrganisationInteractions } from './politics/nonStateInteractions.js?v=20260912-organisations2';
import { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, lobbyForRestoration, plausibleGovernedRegions, rejectSettlementOffer, restorationBacking, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';
import { createGameSnapshot, readSave, restoreGameSnapshot, saveSummary, writeSave } from './core/saveGame.js?v=20260904-war1';
import { syncNextCampaignId, tickCampaigns } from './military/campaigns.js?v=20260912-medieval1';
import { prepareConstructionLabor, syncNextProjectId, tickConstruction, tickInfrastructureMaintenance } from './economy/construction.js?v=20260905-projects1';
import { prepareSiegeWorkforce, tickSiegeEquipment } from './military/siegeEquipment.js?v=20260905-projects1';
import { createReligiousWorld, initialiseReligions, tickReligion } from './society/religion.js?v=20260905-religion1';
import { tickReligiousInstitutions } from './society/religiousInstitutions.js?v=20260912-medieval-politics1';
import { tickMedievalReligiousPolitics } from './society/medievalReligiousPolitics.js?v=20260912-medieval2';
import { tickMaritimeExperience } from './technology/seamanship.js?v=20260906-maritime1';
import { deployFleet, dockFleet, fleetEventInvolvesActor, formatShipOutcome, initialiseFleets, orderFleetHome, orderFleetToSea, resolveFleetContact, setFleetFlag, setFleetMission, syncNextFleetIds, syncRegionalNavyLedger, tickFleets } from './military/fleets.js?v=20260908-fleets1';
import { tickTransitControl } from './economy/transitTolls.js?v=20260907-transit1';
import { MILITARY_POSTURES, ensureMilitaryStrategy, reviewMilitaryStrategy, setMilitaryStrategy } from './military/strategicPlanning.js?v=20260908-strategy1';
import { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter, sendJointOperationProposal, sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260909-counterintel1';
import { attemptBribeDiplomat, diplomatPublicProfile, dispatchDiplomat, ensureDiplomaticService, expelDiplomat, foreignGovernmentTrust, recallDiplomat, releaseDiplomat, resolveDiplomatAuthorityBreach, setDiplomatAuthority, syncNextDiplomatId, tickDiplomats } from './diplomacy/diplomats.js?v=20260909-agent-trust1';
import { ensureCounterIntelligence, setCounterIntelligencePolicy } from './diplomacy/counterIntelligence.js?v=20260909-counterintel1';
import { ensureCommunicationState, tickCommunicationPractices } from './diplomacy/languageCommunication.js?v=20260909-language1';
import { tickGenerationalLanguageChange } from './diplomacy/languageChange.js?v=20260909-language-change1';
import { LANGUAGE_POLICIES, ensureRegionalLanguagePolicy, regionalLanguagePolicyAssessment, setRegionalLanguagePolicy, tickRegionalLanguagePolicies } from './politics/languagePolicy.js?v=20260909-language-policy1';
import { resolvePlayerJointOperationAdvice, tickPlayerJointOperationAdvisor } from './military/playerJointOperationAdvisor.js?v=20260909-joint-player1';
import { CAMPAIGN_ORDERS, issueCampaignOrder, marshalCampaignAssessment, tickCampaignCommandAdvisor } from './military/campaignCommand.js?v=20260909-command1';
import { WAR_STANCES, participantInWar, setEnemyPriority, setWarStance, syncNextWarId, syncWarTheatres } from './military/warTheatres.js?v=20260908-war1';

const START_YEAR = -1300; // target: roughly eighty prosperous years before a c.1220 BCE collapse
const LAYERS = {
  density: {
    valueFn: (r) => densityPerKm2(r),
    label: 'Population / km²',
    format: (v) => v.toFixed(1),
  },
  stability: {
    valueFn: (r) => r.stability,
    label: 'Stability',
    format: (v) => v.toFixed(2),
    colorLow: '#a4453a',
    colorHigh: '#3a4a3e',
  },
  wealth: {
    valueFn: (r) => r.wallet,
    label: 'Populace wealth',
    format: (v) => v.toFixed(0),
  },
  political: {
    type: 'categorical',
    valueFn: (r) => r.governance?.sovereignPolityId || r.controllingActorId,
    label: 'Controlled by',
  },
};

let activePlayerPolityId = null;

async function main() {
  const bus = new EventBus();
  const clock = new Clock();
  const profiler = createPerformanceProfiler();
  profiler.mount();
  const regions = await loadWorld();
  console.log(`Simulation map loaded: ${regions.length} permanent land regions`);
  seedCensus(regions);
  const religiousWorld = initialiseReligions(regions, createReligiousWorld());
  const polities = initialisePolities(regions);
  initialisePoliticalContinuity(polities, regions, 0);
  const seaRegions = await loadSeaWorld();
  linkSeaAdjacency(regions, seaRegions);
  const spatialGraph = await loadWorldSpatialGraph(regions);
  for (const region of regions) syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);
  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);
  initialiseKnowledge(regions, seaRegions);
  for (const region of regions) { ensureCommunicationState(region); ensureDiplomaticService(region); ensureCounterIntelligence(region); }
  const toolTypes = await (await fetch('data/world/toolTypes.json?v=20260904-weather1')).json();

  console.log(
    `Loaded ${regions.length} regions:`,
    regions.map((r) => `${r.name} (pop ${r.population.toLocaleString()})`).join(', ')
  );
  console.log(`Loaded ${seaRegions.length} sea regions:`, seaRegions.map((s) => s.name).join(', '));

  const fogOfWar = new FogOfWar(regions);
  const canvas = document.getElementById('map-canvas');

  let selectedRegion = null;
  let playerRegionId = null;
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const seaRegionsById = new Map(seaRegions.map((s) => [s.id, s]));
  let activeRaids = [];
  let activeCampaigns = [];
  let activeWars = [];
  let fleets = initialiseFleets(regions);
  const agreements = [];
  const eventQueue = [];
  let council;
  let localRegionView = null;
  const addRegionZoomButton = (region) => {
    const controls = document.getElementById('region-controls');
    if (!controls || controls.querySelector('#btn-zoom-local-region')) return;
    const button = document.createElement('button');
    button.id = 'btn-zoom-local-region';
    button.className = 'region-zoom-button';
    button.textContent = 'Zoom to region';
    button.addEventListener('click', () => localRegionView?.open(region));
    controls.prepend(button);
  };

  const map = new MapRenderer(canvas, regions, {
    seaRegions,
    onInteraction: () => clock.deferForInteraction(350),
    getConflictPressure: (region) => {
      const campaign = activeCampaigns.find((item) => item.defenderId === region.id && item.phase === 'engaged');
      if (!campaign) return 0;
      if (fogOfWar.devMode) return campaign.pressure;
      const playerPolity = activePlayerPolityId;
      const attacker = regionsById.get(campaign.attackerId);
      const defender = regionsById.get(campaign.defenderId);
      return attacker?.governance?.sovereignPolityId === playerPolity ||
        defender?.governance?.sovereignPolityId === playerPolity ? campaign.pressure : 0;
    },
    isRegionVisible: (region) => fogOfWar.isVisible(region),
    isSeaRegionVisible: (sea) => sea.adjacentLand.some((landId) => {
      const land = regionsById.get(landId);
      return land ? fogOfWar.isVisible(land) : false;
    }),
    onSelect: (region) => {
      selectedRegion = region;
      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
      addRegionZoomButton(region);
      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);
      updateRegionStats(region, seaRegionsById, fogOfWar, regions, playerRegionId);
      document.getElementById('region-sheet').classList.remove('hidden');
    },
  });

  council = new AdvisorCouncil({
    regions, polities, religiousWorld, fogOfWar, clock,
    getPlayerRegionId: () => playerRegionId,
    getActiveRaids: () => activeRaids,
    addRaid: (raid) => activeRaids.push(raid),
    getCampaigns: () => activeCampaigns,
    addCampaign: (campaign) => activeCampaigns.push(campaign),
    getAgreements: () => agreements,
    openRegion: (regionId) => {
      const region = regionsById.get(regionId);
      if (!region || !fogOfWar.isVisible(region)) return;
      selectedRegion = region;
      map.selectedId = region.id;
      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
      addRegionZoomButton(region);
      appendCampaignShortcut(region, activeCampaigns, regionsById, playerRegionId, council);
      updateRegionStats(region, seaRegionsById, fogOfWar, regions, playerRegionId);
      document.getElementById('region-sheet').classList.remove('hidden');
      map.draw();
    },
  });

  localRegionView = createLocalRegionView({
    graph: spatialGraph, regions,
    getCampaigns: () => activeCampaigns,
    getFleets: () => fleets,
  });

  Object.assign(LAYERS, buildSocialOverlayLayers({
    regions, religiousWorld, agreements, fogOfWar,
    getPlayerRegionId: () => playerRegionId,
    getPlayerPolityId: () => activePlayerPolityId,
    knowledgeLevel, knowledgeThresholds: KNOWLEDGE_THRESHOLDS,
  }));
  wireLayerToggle(map);
  const deferSimulationForInput = () => clock.deferForInteraction(350);
  document.addEventListener('pointerdown', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('touchstart', deferSimulationForInput, { passive: true, capture: true });
  document.addEventListener('input', deferSimulationForInput, true);
  document.addEventListener('keydown', deferSimulationForInput, true);
  map.setLayer(LAYERS.density);
  showLegend(map);

  document.getElementById('btn-close-sheet').addEventListener('click', () => {
    document.getElementById('region-sheet').classList.add('hidden');
    selectedRegion = null;
    map.selectedId = null;
    map.draw();
    council.refresh();
  });

  wireHud(clock);
  const loadSavedGame = () => {
    const snapshot = readSave();
    if (!snapshot) throw new Error('No saved game was found.');
    const restored = restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, activeWars, fleets, clock, fogOfWar });
    if (!restored.fleetsRestored) fleets.splice(0, fleets.length, ...initialiseFleets(regions, []));
    playerRegionId = restored.playerRegionId;
    activePlayerPolityId = restored.playerPolityId || regionsById.get(playerRegionId)?.polityId || null;
    syncNextRaidId(activeRaids);
    syncNextAgreementId(agreements);
    syncNextCampaignId(activeCampaigns);
    syncNextWarId(activeWars);
    syncNextFleetIds(fleets);
    syncRegionalNavyLedger(regions, fleets);
    syncNextDiplomaticMessageId(regions);
    syncNextDiplomatId(regions);
    for (const region of regions) {
      ensureCommunicationState(region); ensureDiplomaticService(region); ensureCounterIntelligence(region);
      syncRegionSpatialSites(spatialGraph, region, ensureSubregionalControl(region).places);
    }
    syncNextProjectId(regions);
    eventQueue.length = 0;
    document.getElementById('event-modal').classList.add('hidden');
    document.getElementById('picker-modal').classList.add('hidden');
    selectedRegion = regionsById.get(playerRegionId) || null;
    map.selectedId = selectedRegion?.id || null;
    map.refreshLayer();
    council.close();
    if (selectedRegion) {
      renderRegionControls(selectedRegion, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
      addRegionZoomButton(selectedRegion);
      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId);
      document.getElementById('region-sheet').classList.remove('hidden');
    }
    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
    clock.start();
    map.draw();
    return restored;
  };

  wireMenu({
    fogOfWar,
    map,
    clock,
    regions,
    seaRegions,
    polities,
    religiousWorld,
    agreements,
    getActiveRaids: () => activeRaids,
    getActiveCampaigns: () => activeCampaigns,
    getPlayerRegionId: () => playerRegionId,
    loadGame: loadSavedGame,
    getSelectedRegion: () => selectedRegion,
    clearSelection: () => {
      selectedRegion = null;
      map.selectedId = null;
    },
  });

  let communicationElapsedDays = 0;
  let languageChangeElapsedDays = 0;
  let diplomacyRelationshipElapsedDays = 0;

  clock.onTick((time) => {
    profiler.beginTick(time);
    // Legacy systems that store durations in weeks receive a calendar-week
    // index derived from absolute simulated time. The expensive scheduler can
    // therefore tick monthly without turning 104 historical weeks into 104 months.
    const calendarWeek = calendarWeekIndex(time.endDay);
    const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets, nonStateWorld: religiousWorld }));
    activeCampaigns = campaignResult.remaining;
    const campaignCommandEvents = profiler.measure('Campaign command advisor', () => tickCampaignCommandAdvisor(activeCampaigns, regions, activePlayerPolityId, calendarWeek));
    for (const advisoryEvent of campaignCommandEvents) {
      advisoryEvent.resolveDecision = (choice) => {
        if (choice !== 'follow') return { changed: false, summary: 'Existing campaign orders remain in force.' };
        const defender = regionsById.get(advisoryEvent.campaign.defenderId);
        const result = issueCampaignOrder(advisoryEvent.campaign, advisoryEvent.assessment.recommendation, defender, calendarWeek, { playerIssued: true, rationale: 'marshal_advice' });
        return { ...result, summary: result.changed ? `Order issued: ${CAMPAIGN_ORDERS[advisoryEvent.assessment.recommendation]?.label || advisoryEvent.assessment.recommendation}.` : 'The order could not be issued.' };
      };
    }
    profiler.measure('Construction + siege prep', () => {
      prepareConstructionLabor(regions);
      prepareSiegeWorkforce(regions);
    });
    profiler.measure('Economy', () => tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay));
    profiler.measure('Gunpowder industry', () => tickGunpowderIndustry(regions, time.elapsedDays));
    profiler.measure('Knowledge pruning', () => pruneKnowledge(regions, calendarWeek));
    profiler.measure('Knowledge diffusion', () => tickFishingKnowledge(fishingContactPairs, calendarWeek));
    profiler.measure('Scouting', () => tickScouting(regions, calendarWeek, Math.random));
    const fleetResult = profiler.measure('Fleets', () => tickFleets(fleets, regions, seaRegions, agreements, calendarWeek, time.elapsedDays, Math.random, { playerActorId: activePlayerPolityId }));
    for (const fleetEvent of fleetResult.events) {
      if (fleetEvent.type !== 'fleet_contact' || !fleetEventInvolvesActor(fleetEvent, activePlayerPolityId, fleets)) continue;
      fleetEvent.resolveDecision = (choice) => {
        const generated = resolveFleetContact(fleetEvent, choice, fleets, regionsById, calendarWeek, Math.random);
        syncRegionalNavyLedger(regions, fleets);
        return generated;
      };
    }
    profiler.measure('Transit control', () => tickTransitControl(regions, time.elapsedDays));
    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements, profiler));
    profiler.measure('Maritime experience', () => tickMaritimeExperience(regions, activeRaids, time.elapsedDays));
    profiler.measure('State finance', () => tickStateFinance(regions, time.elapsedDays));
    profiler.measure('Infrastructure maintenance', () => tickInfrastructureMaintenance(regions, time.elapsedDays));
    const constructionEvents = profiler.measure('Construction', () => tickConstruction(regions, calendarWeek, time.elapsedDays));
    profiler.measure('Siege equipment', () => tickSiegeEquipment(regions, time.elapsedDays));
    const breakthroughEvents = profiler.measure('Technology breakthroughs', () => tickBreakthroughs(regions, calendarWeek, Math.random, time.elapsedDays));
    const religionEvents = profiler.measure('Religion', () => tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays));
    const religiousInstitutionEvents = profiler.measure('Religious institutions', () => tickReligiousInstitutions(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));
    const diseaseEvents = profiler.measure('Disease', () => tickDisease(regions, time.elapsedDays, Math.random));
    profiler.measure('Demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays, profiler));
    // These are slow-moving social processes. The world clock may tick monthly
    // (and later weekly/daily), but recomputing them on every world tick wastes
    // CPU without adding meaningful temporal resolution.
    communicationElapsedDays += time.elapsedDays;
    if (communicationElapsedDays >= 90) {
      const elapsedCommunicationDays = communicationElapsedDays;
      communicationElapsedDays = 0;
      profiler.measure('Communication practices', () => tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, elapsedCommunicationDays));
    }

    languageChangeElapsedDays += time.elapsedDays;
    let languageChangeEvents = [];
    if (languageChangeElapsedDays >= 365.2425) {
      const elapsedLanguageDays = languageChangeElapsedDays;
      languageChangeElapsedDays = 0;
      languageChangeEvents = profiler.measure('Language change', () => tickGenerationalLanguageChange(regions, elapsedLanguageDays));
    }
    const diplomatEvents = profiler.measure('Diplomats', () => tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random));
    for (const diplomatEvent of diplomatEvents) {
      if (diplomatEvent.type !== 'diplomat_authority_breach_reported' || diplomatEvent.homeRegionId !== playerRegionId) continue;
      diplomatEvent.resolveDecision = (choice) => resolveDiplomatAuthorityBreach(regionsById.get(diplomatEvent.homeRegionId), diplomatEvent.diplomat.id, choice, agreements, calendarWeek);
    }
    const courierEvents = profiler.measure('Diplomatic couriers', () => tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random));
    const playerCapitalForJointPlan = regionsById.get(playerRegionId);
    const jointOperationAdvisorEvents = profiler.measure('Joint operation advisor', () => tickPlayerJointOperationAdvisor(playerCapitalForJointPlan, agreements, regionsById, activeCampaigns, calendarWeek));
    for (const advisoryEvent of jointOperationAdvisorEvents) {
      advisoryEvent.resolveDecision = (choice) => resolvePlayerJointOperationAdvice(advisoryEvent, choice, playerCapitalForJointPlan, regionsById, activeCampaigns, polities, calendarWeek);
    }
    const warEvents = profiler.measure('War theatres', () => syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek));
    preparePlayerWarEntryEvents(warEvents, activeWars, activePlayerPolityId, regions);
    diplomacyRelationshipElapsedDays += time.elapsedDays;
    const maintainDiplomaticRelationships = diplomacyRelationshipElapsedDays >= 90;
    const diplomacyElapsedDays = maintainDiplomaticRelationships ? diplomacyRelationshipElapsedDays : time.elapsedDays;
    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, diplomacyElapsedDays, profiler, { maintainRelationships: maintainDiplomaticRelationships }));
    if (maintainDiplomaticRelationships) diplomacyRelationshipElapsedDays = 0;
    const playerCapitalForPlan = regionsById.get(playerRegionId);
    if (playerCapitalForPlan) profiler.measure('Military strategy review', () => reviewMilitaryStrategy(playerCapitalForPlan, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeek }));
    const languagePolicyEvents = profiler.measure('Language policy', () => tickRegionalLanguagePolicies(regions, polities, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));
    const polityEvents = profiler.measure('Polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays));
    const continuityEvents = profiler.measure('Political continuity', () => tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId }));
    const medievalPoliticalEvents = profiler.measure('Medieval politics', () => tickMedievalInstitutions(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));
    const medievalStateEvents = profiler.measure('Medieval state systems', () => tickMedievalStateSystems(polities, regions, calendarWeek, time.elapsedDays, Math.random));
    profiler.measure('Medieval commerce', () => tickMedievalCommercialInstitutions(regions, polities, time.elapsedDays));
    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));
    const medievalReligiousEvents = profiler.measure('Religious politics', () => tickMedievalReligiousPolitics(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random));
    const organisationEvents = profiler.measure('Non-state organisations', () => tickNonStateOrganisations(regions, polities, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { agreements, activeRaids }));
    const privateMilitaryEvents = profiler.measure('Private military actors', () => tickPrivateMilitaryActors(regions, polities, religiousWorld, activeCampaigns, calendarWeek, time.elapsedDays, Math.random));
    const organisationInteractionEvents = profiler.measure('Organisation relations', () => tickOrganisationInteractions(regions, polities, religiousWorld, time.elapsedDays));
    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));
    profiler.measure('Nation AI', () => tickNationAi(regions, playerRegionId, activeRaids, activeCampaigns, agreements, polities,
      religiousWorld, calendarWeek, toolTypes, Math.random, time.elapsedDays, { fleets, seaRegions }));

    const { remaining, events } = profiler.measure('Raids', () => tickRaids(activeRaids, regionsById, calendarWeek, toolTypes, Math.random));
    activeRaids = remaining;

    // Dev mode reveals diagnostic/map state, but it must not become a global
    // player notification feed. Raid modals are always limited to the player's
    // own region/polity so unrelated AI wars cannot pause or block the game.
    const playerRaidEvents = events.filter((event) => {
      const playerPolityId = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;
      if (!playerRegionId || !playerPolityId) return false;
      const attacker = regionsById.get(event.raid.attackerId);
      const defender = regionsById.get(event.raid.defenderId);
      return event.raid.attackerId === playerRegionId || event.raid.defenderId === playerRegionId ||
        attacker?.governance?.sovereignPolityId === playerPolityId ||
        defender?.governance?.sovereignPolityId === playerPolityId;
    });
    for (const retreatEvent of campaignResult.events.filter((event) => event.type === 'claimant_retreat')) {
      if (retreatEvent.defeatedPolityId === activePlayerPolityId && retreatEvent.newSeatRegionId) {
        playerRegionId = retreatEvent.newSeatRegionId;
        fogOfWar.setPlayerRegion(playerRegionId);
        map.refreshLayer();
      }
    }
    for (const settlementEvent of campaignResult.events.filter((event) => event.type === 'settlement_required')) {
      const attacker = regionsById.get(settlementEvent.attackerId);
      const defender = regionsById.get(settlementEvent.defenderId);
      settlementEvent.resolveSettlement = (choice) => {
        let offer = settlementEvent.offer;
        let result;
        if (settlementEvent.playerRole === 'conqueror') {
          offer = createConquestSettlementOffer(attacker, defender, choice, polities, regions, calendarWeek);
          result = choice === 'direct_rule'
            ? rejectSettlementOffer(offer, polities, regions, calendarWeek, true)
            : resolveNpcSettlement(offer, polities, regions, calendarWeek);
        } else {
          result = offer?.type === 'direct_rule'
            ? rejectSettlementOffer(offer, polities, regions, calendarWeek, true)
            : choice === 'accept'
              ? acceptSettlementOffer(offer, polities, regions, calendarWeek)
              : rejectSettlementOffer(offer, polities, regions, calendarWeek, false);
        }
        settlementEvent.campaign.settlementResolved = true;
        settlementEvent.campaign.settlement = offer;
        settlementEvent.campaign.settlementResult = result;
        settlementEvent.campaign.outcome = 'submission';
        const playerPolity = polityById(polities, activePlayerPolityId);
        const newSeat = playerPolity?.continuity?.seatRegionId;
        if (newSeat && regionsById.has(newSeat)) {
          playerRegionId = newSeat;
          fogOfWar.setPlayerRegion(newSeat);
        }
        map.refreshLayer();
        return { result, offer, playerState: playerPolity?.continuity || null };
      };
    }

    const playerEvents = [
      ...breakthroughEvents.filter((event) => event.regionId === playerRegionId),
      ...constructionEvents.filter((event) => event.regionId === playerRegionId),
      ...religionEvents.filter((event) => event.regionId === playerRegionId),
      ...religiousInstitutionEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),
      ...diseaseEvents.filter((event) => event.regionId === playerRegionId),
      ...languageChangeEvents.filter((event) => event.regionId === playerRegionId),
      ...playerRaidEvents,
      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),
      ...warEvents.filter((event) => event.playerInvolved),
      ...courierEvents.filter((event) => {
        const message = event.message;
        return message && (message.senderActorId === activePlayerPolityId || message.targetActorId === activePlayerPolityId || event.interceptingActorId === activePlayerPolityId);
      }),
      ...jointOperationAdvisorEvents,
      ...campaignCommandEvents,
      ...diplomatEvents.filter((event) => event.homeRegionId === playerRegionId && event.type !== 'diplomat_report'),
      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),
      ...polityEvents.filter((event) => event.regionId === playerRegionId),
      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),
      ...medievalPoliticalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.rebelPolityId === activePlayerPolityId),
      ...medievalStateEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.claimantPolityId === activePlayerPolityId),
      ...medievalReligiousEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),
      ...organisationEvents.filter((event) => event.regionId === playerRegionId || event.organisation?.memberPolityIds?.has?.(activePlayerPolityId) || event.polityIds?.includes?.(activePlayerPolityId)),
      ...privateMilitaryEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),
      ...organisationInteractionEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),
      ...fleetResult.events.filter((event) => fleetEventInvolvesActor(event, activePlayerPolityId, fleets)),
      ...campaignResult.events.filter((event) => {
        if (event.type === 'settlement_required') return event.attackerPolityId === activePlayerPolityId || event.defenderPolityId === activePlayerPolityId;
        if (event.type === 'claimant_retreat') return event.conquerorPolityId === activePlayerPolityId || event.defeatedPolityId === activePlayerPolityId;
        const attacker = regionsById.get(event.campaign.attackerId);
        const defender = regionsById.get(event.campaign.defenderId);
        const playerPolity = activePlayerPolityId;
        return attacker?.governance?.sovereignPolityId === playerPolity || defender?.governance?.sovereignPolityId === playerPolity;
      }),
    ];
    if (playerEvents.length > 0) {
      clock.requestAutoPause();
      eventQueue.push(...playerEvents);
      showNextEvent(clock, eventQueue);
    }

    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
    profiler.measure('UI world-map draw', () => map.draw());

    if (selectedRegion && fogOfWar.isVisible(selectedRegion)) {
      profiler.measure('UI region stats', () => updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId));
    }
    profiler.measure('UI council refresh', () => council.refresh());
    profiler.endTick();
  });

  document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);

  const startLoadButton = document.getElementById('btn-load-start');
  if (saveSummary() && !saveSummary().invalid) {
    startLoadButton.classList.remove('hidden');
    startLoadButton.addEventListener('click', () => {
      try { loadSavedGame(); }
      catch (error) {
        startLoadButton.textContent = `Could not load: ${error.message}`;
        startLoadButton.disabled = true;
      }
    });
  }

  showRegionPicker(regions, (chosen) => {
    playerRegionId = chosen.id;
    activePlayerPolityId = chosen.polityId || chosen.governance?.localPolityId || chosen.governance?.sovereignPolityId;
    fogOfWar.setPlayerRegion(chosen.id);
    reviewMilitaryStrategy(chosen, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeekIndex(clock.elapsedDays || 0) });

    document.getElementById('picker-modal').classList.add('hidden');
    selectedRegion = chosen;
    map.selectedId = chosen.id;

    renderRegionControls(chosen, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    updateRegionStats(chosen, seaRegionsById, fogOfWar, regions, playerRegionId);
    document.getElementById('region-sheet').classList.remove('hidden');

    map.refreshLayer();
    clock.start();
  });

  window.__worldsim = {
    bus,
    clock,
    regions,
    seaRegions,
    get activeRaids() { return activeRaids; },
    get activeCampaigns() { return activeCampaigns; },
    get activeWars() { return activeWars; },
    get fleets() { return fleets; },
    get activePlayerPolityId() { return activePlayerPolityId; },
    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },
    diplomatApi: { dispatchDiplomat, recallDiplomat, setDiplomatAuthority, setCounterIntelligencePolicy, sendForgedJointOperationLetter, sendDeceptionJointOperationLetter, attemptBribeDiplomat, expelDiplomat, releaseDiplomat, diplomatPublicProfile, foreignGovernmentTrust },
    campaignCommandApi: { issueCampaignOrder, marshalCampaignAssessment },
    agreements,
    religiousWorld,
    polities,
    map,
    fogOfWar,
    profiler,
    setDevMode: (enabled) => setDevMode(enabled),
  };

  function setDevMode(enabled) {
    fogOfWar.setDevMode(enabled);

    const toggle = document.getElementById('toggle-dev-mode');
    if (toggle) toggle.checked = fogOfWar.devMode;

    // If the player was inspecting something that is no longer visible,
    // close the sheet rather than leaving hidden information on screen.
    if (selectedRegion && !fogOfWar.isVisible(selectedRegion)) {
      document.getElementById('region-sheet').classList.add('hidden');
      selectedRegion = null;
      map.selectedId = null;
    }

    map.refreshLayer();
    if (map.layer) showLegend(map);
  }
}

function appendCampaignShortcut(region, campaigns, regionsById, playerRegionId, council) {
  const playerPolity = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;
  const campaign = campaigns.find((item) => {
    if (item.completed || (item.attackerId !== region.id && item.defenderId !== region.id)) return false;
    const attacker = regionsById.get(item.attackerId);
    const defender = regionsById.get(item.defenderId);
    return attacker?.governance?.sovereignPolityId === playerPolity ||
      defender?.governance?.sovereignPolityId === playerPolity;
  });
  if (!campaign) return;
  const controls = document.getElementById('region-controls');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'conflict-shortcut';
  button.innerHTML = `<span>Active campaign · ${campaign.stage.replaceAll('_', ' ')}</span><strong>${Math.round(campaign.pressure * 100)}% pressure</strong>`;
  button.addEventListener('click', () => council?.openCampaign(campaign.id));
  controls.appendChild(button);
}

function showRegionPicker(regions, onChosen) {
  const pickerList = document.getElementById('picker-list');
  const pickerTitle = document.getElementById('picker-title');
  const pickerHelp = document.getElementById('picker-help');

  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const alphabetically = (a, b) => collator.compare(a, b);

  // Navigation metadata only: this does not define sovereignty.
  const navigationForRegion = (region) => {
    const sourceGroup = region.feature?.properties?.sourceGroup;
    const name = region.name;

    // Spain's dataset spans two continents.
    if (sourceGroup === 'ESP' && (name === 'Ceuta' || name === 'Melilla')) {
      return { continent: 'Africa', country: 'Spain' };
    }

    const groups = {
      'GBR-ENG': { continent: 'Europe', country: 'England' },
      'GBR-WLS': { continent: 'Europe', country: 'Wales' },
      'GBR-SCT': { continent: 'Europe', country: 'Scotland' },
      'FRA': { continent: 'Europe', country: 'France' },
      'ESP': { continent: 'Europe', country: 'Spain' },
      'PRT': { continent: 'Europe', country: 'Portugal' },
      'IRL': { continent: 'Europe', country: 'Ireland' },
      'GIB': { continent: 'Europe', country: 'Gibraltar' },
      'AND': { continent: 'Europe', country: 'Andorra' },
      'IMN': { continent: 'Europe', country: 'Isle of Man' },
      'JEY': { continent: 'Europe', country: 'Jersey' },
      'GGY': { continent: 'Europe', country: 'Guernsey' },
      'ITA': { continent: 'Europe', country: 'Italy' },
      'GRC': { continent: 'Europe', country: 'Greece' },
      'ALB': { continent: 'Europe', country: 'Albania' },
      'MKD': { continent: 'Europe', country: 'Macedonia' },
      'BGR': { continent: 'Europe', country: 'Bulgaria' },
      'SRB': { continent: 'Europe', country: 'Serbia' },
      'MNE': { continent: 'Europe', country: 'Montenegro' },
      'BIH': { continent: 'Europe', country: 'Bosnia & Herzegovina' },
      'HRV': { continent: 'Europe', country: 'Croatia' },
      'TUR': { continent: 'Asia', country: 'Anatolia' },
      'CYP': { continent: 'Asia', country: 'Cyprus' },
      'SYR': { continent: 'Asia', country: 'Syria' },
      'LBN': { continent: 'Asia', country: 'Levant' },
      'ISR': { continent: 'Asia', country: 'Southern Levant' },
      'PSE': { continent: 'Asia', country: 'Southern Levant' },
      'JOR': { continent: 'Asia', country: 'Transjordan' },
      'IRQ': { continent: 'Asia', country: 'Mesopotamia' },
      'IRN': { continent: 'Asia', country: 'Western Iran' },
      'KAZ': { continent: 'Asia', country: 'Kazakh Steppe' },
      'TKM': { continent: 'Asia', country: 'Turkmenistan' },
      'UZB': { continent: 'Asia', country: 'Transoxiana' },
      'KGZ': { continent: 'Asia', country: 'Tian Shan Valleys' },
      'TJK': { continent: 'Asia', country: 'Pamir & Tajik Valleys' },
      'AFG': { continent: 'Asia', country: 'Afghanistan' },
      'PAK': { continent: 'Asia', country: 'Indus & Northwest' },
      'CHN': { continent: 'Asia', country: 'China' },
      'MNG': { continent: 'Asia', country: 'Mongolian Steppe' },
      'EGY': { continent: 'Africa', country: 'Egypt' },
      'LBY': { continent: 'Africa', country: 'Libya' },
      'TUN': { continent: 'Africa', country: 'Tunisia' },
    };

    return groups[sourceGroup] || { continent: 'Other', country: sourceGroup || 'Other' };
  };

  const entries = regions.map((region) => ({ region, ...navigationForRegion(region) }));

  const resetList = (...nodes) => {
    pickerList.replaceChildren(...nodes);
    pickerList.scrollTop = 0;
  };

  const makeButton = (className, label, detail, onClick) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.innerHTML = detail
      ? `<strong>${label}</strong><span class="picker-count">${detail}</span>`
      : `<strong>${label}</strong>`;
    el.addEventListener('click', onClick);
    return el;
  };

  const makeBackButton = (label, onClick) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'picker-back';
    el.textContent = `← ${label}`;
    el.addEventListener('click', onClick);
    return el;
  };

  const renderContinents = () => {
    pickerTitle.textContent = 'Choose where to begin';
    pickerHelp.textContent = 'Choose a continent.';

    const continents = [...new Set(entries.map((entry) => entry.continent))]
      .sort(alphabetically);

    resetList(...continents.map((continent) => {
      const matches = entries.filter((entry) => entry.continent === continent);
      const countryCount = new Set(matches.map((entry) => entry.country)).size;
      return makeButton(
        'picker-group',
        continent,
        `${countryCount} ${countryCount === 1 ? 'area' : 'areas'} · ${matches.length} regions`,
        () => renderCountries(continent),
      );
    }));
  };

  const renderCountries = (continent) => {
    pickerTitle.textContent = continent;
    pickerHelp.textContent = 'Choose a country or geographic grouping.';

    const countries = [...new Set(
      entries
        .filter((entry) => entry.continent === continent)
        .map((entry) => entry.country)
    )].sort(alphabetically);

    const nodes = [makeBackButton('Continents', renderContinents)];

    for (const country of countries) {
      const matches = entries.filter(
        (entry) => entry.continent === continent && entry.country === country
      );

      nodes.push(makeButton(
        'picker-group',
        country,
        `${matches.length} ${matches.length === 1 ? 'region' : 'regions'}`,
        () => renderRegions(continent, country),
      ));
    }

    resetList(...nodes);
  };

  const renderRegions = (continent, country) => {
    pickerTitle.textContent = country;
    pickerHelp.textContent = `${continent} · choose the region you will govern.`;

    const matches = entries
      .filter((entry) => entry.continent === continent && entry.country === country)
      .map((entry) => entry.region)
      .sort((a, b) => alphabetically(a.name, b.name));

    const nodes = [makeBackButton(continent, () => renderCountries(continent))];

    for (const region of matches) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'picker-option';
      el.dataset.id = region.id;
      el.innerHTML = `
        <strong>${region.name}</strong>
        <span>pop ${region.population.toLocaleString()} &middot; land quality ${region.landQuality.toFixed(2)}&times;</span>
      `;
      el.addEventListener('click', () => onChosen(region));
      nodes.push(el);
    }

    resetList(...nodes);
  };

  // Always start at the top level; only one hierarchy level is rendered at a time.
  renderContinents();
}
function wireLayerToggle(map) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const alreadyActive = btn.classList.contains('active');
      document.querySelectorAll('.layer-btn').forEach((b) => b.classList.remove('active'));

      if (alreadyActive) {
        map.clearLayer();
        document.getElementById('legend').classList.add('hidden');
      } else {
        map.setLayer(LAYERS[btn.dataset.layer]);
        btn.classList.add('active');
        showLegend(map);
      }
    });
  });
}

function wireHud(clock) {
  const pauseBtn = document.getElementById('btn-pause');
  const hud = document.getElementById('hud');
  const halfSpeedBtn = document.getElementById('btn-speed-half');
  const notice = document.getElementById('performance-notice');
  let noticeTimer = null;

  const syncSpeedControls = () => {
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === clock.speed);
    });
    pauseBtn.textContent = clock.speed === 0 ? '►' : 'II';
  };

  const showPerformanceNotice = ({ previousSpeed, speed, tickDurationMs }) => {
    if (speed === 0.5) {
      halfSpeedBtn.classList.remove('hidden');
      hud.classList.add('performance-limited');
    }
    const measured = Math.max(1, Math.round(tickDurationMs));
    notice.textContent = `A week is taking about ${measured} ms on this device, so ${previousSpeed}x was reduced to ${speed}x. Every week will still be simulated.`;
    notice.classList.remove('hidden');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.add('hidden'), 8000);
  };

  clock.onSpeedChange((detail) => {
    syncSpeedControls();
    if (detail.automatic && detail.reason === 'performance') showPerformanceNotice(detail);
  });

  pauseBtn.addEventListener('click', () => {
    clock.togglePause();
  });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed);
      clock.setSpeed(speed);
    });
  });

  syncSpeedControls();
}

function wireMenu({ fogOfWar, map, clock, regions, seaRegions, polities, religiousWorld, agreements, getActiveRaids,
  getActiveCampaigns, getPlayerRegionId, loadGame, getSelectedRegion, clearSelection }) {
  const menuModal = document.getElementById('menu-modal');
  const menuButton = document.getElementById('btn-menu');
  const closeButton = document.getElementById('btn-close-menu');
  const toggle = document.getElementById('toggle-dev-mode');
  const saveButton = document.getElementById('btn-save-game');
  const loadButton = document.getElementById('btn-load-game');
  const saveStatus = document.getElementById('save-status');

  const refreshSaveStatus = (message = null) => {
    const summary = saveSummary();
    loadButton.disabled = !summary || summary.invalid;
    if (message) saveStatus.textContent = message;
    else if (summary?.invalid) saveStatus.textContent = 'The saved game on this device is damaged.';
    else if (summary) saveStatus.textContent = `Saved ${new Date(summary.savedAt).toLocaleString()} · week ${summary.tickIndex.toLocaleString()}.`;
    else saveStatus.textContent = 'No saved game on this device.';
  };

  const closeMenu = () => menuModal.classList.add('hidden');

  menuButton.addEventListener('click', () => {
    toggle.checked = fogOfWar.devMode;
    saveButton.disabled = !getPlayerRegionId();
    refreshSaveStatus();
    menuModal.classList.remove('hidden');
  });

  closeButton.addEventListener('click', closeMenu);

  menuModal.addEventListener('click', (event) => {
    if (event.target === menuModal) closeMenu();
  });

  toggle.addEventListener('change', () => {
    fogOfWar.setDevMode(toggle.checked);

    const selected = getSelectedRegion();
    if (selected && !fogOfWar.isVisible(selected)) {
      document.getElementById('region-sheet').classList.add('hidden');
      clearSelection();
      map.selectedId = null;
    }

    map.refreshLayer();
    if (map.layer) {
      const info = map.getLegendInfo();
      if (info) updateLegendFromInfo(info);
    }
  });

  saveButton.addEventListener('click', () => {
    try {
      const snapshot = createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements,
        activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), activeWars: window.__worldsim?.activeWars || [], fleets: window.__worldsim?.fleets || [],
        clock, playerRegionId: getPlayerRegionId(), playerPolityId: activePlayerPolityId, fogOfWar });
      writeSave(snapshot);
      refreshSaveStatus(`Game saved · ${clock.formatDate(START_YEAR)}.`);
    } catch (error) {
      saveStatus.textContent = `Could not save: ${error.message}`;
    }
  });

  loadButton.addEventListener('click', () => {
    if (!window.confirm('Load the saved game? Unsaved progress will be lost.')) return;
    try {
      loadGame();
      closeMenu();
    } catch (error) {
      saveStatus.textContent = `Could not load: ${error.message}`;
    }
  });

  refreshSaveStatus();
}

function updateLegendFromInfo(info) {
  document.getElementById('legend-label').textContent = info.label;

  const gradientEl = document.getElementById('legend-gradient');
  const categoricalEl = document.getElementById('legend-categorical');

  if (info.type === 'categorical') {
    gradientEl.classList.add('hidden');
    categoricalEl.classList.remove('hidden');
    categoricalEl.innerHTML = info.entries
      .map((e) => `<div class="legend-swatch-row"><span class="legend-swatch" style="background:${e.color}"></span>${e.key}</div>`)
      .join('');
  } else {
    categoricalEl.classList.add('hidden');
    gradientEl.classList.remove('hidden');
    document.getElementById('legend-min').textContent = info.min;
    document.getElementById('legend-max').textContent = info.max;
  }

  document.getElementById('legend').classList.remove('hidden');
}

function showLegend(map) {
  const info = map.getLegendInfo();
  if (!info) return;
  updateLegendFromInfo(info);
}

// Built once when the player taps a region — never rebuilt on the periodic
// refresh below, or every keystroke in the input would get wiped mid-edit.
function renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes) {
  document.getElementById('region-name').textContent = region.name;

  const playerCapital = regions.find((candidate) => candidate.id === playerRegionId);
  const playerPolity = polityById(polities, activePlayerPolityId) || sovereignPolity(playerCapital, polities);
  const playerState = playerPolity?.continuity;
  const playerHasLocalRule = Boolean(playerPolity && (region.governance?.sovereignPolityId === playerPolity.id ||
    region.governance?.localPolityId === playerPolity.id));
  const isPlayerSubject = playerPolity && region.id !== playerRegionId && region.governance?.sovereignPolityId === playerPolity.id;
  if (playerState?.status === 'exile') {
    if (region.id === playerState.seatRegionId) renderExileGovernmentControls(region, regions, polities, playerPolity);
    else document.getElementById('region-controls').innerHTML = '<div class="raid-status">Your government is in exile. You have no domestic authority here.</div>';
    return;
  }
  if (isPlayerSubject) {
    renderSubjectRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    return;
  }

  if (!playerHasLocalRule) {
    const rulerName = fogOfWar.devMode
      ? (regions.find((r) => r.id === region.controllingActorId)?.name || region.controllingActorId)
      : 'another ruler';

    document.getElementById('region-controls').innerHTML = `
      <div class="raid-status">Ruled by ${rulerName} — you cannot issue domestic orders here.</div>
    `;
    return;
  }

  const targets = regions
    .filter((r) => r.id !== region.id)
    .filter((r) => fogOfWar.isVisible(r))
    .map((r) => ({ region: r, ...canRaid(region, r, regions, polities) }))
    .filter((t) => t.possible);

  const inFlight = activeRaids.filter((r) => r.attackerId === region.id && !r.completed);
  const liveCampaigns = window.__worldsim?.activeCampaigns || [];
  const playerCampaigns = liveCampaigns.filter((campaign) => {
    if (campaign.completed) return false;
    const attacker = regions.find((candidate) => candidate.id === campaign.attackerId);
    return (attacker?.governance?.sovereignPolityId || attacker?.controllingActorId || attacker?.id) === activePlayerPolityId;
  });
  const campaignCommandHtml = playerCampaigns.length ? playerCampaigns.map((campaign) => {
    const attacker = regions.find((candidate) => candidate.id === campaign.attackerId);
    const defender = regions.find((candidate) => candidate.id === campaign.defenderId);
    const assessment = marshalCampaignAssessment(campaign, attacker, defender);
    const weeks = assessment.supplyWeeks === null ? 'n/a' : assessment.supplyWeeks.toFixed(1);
    const orderOptions = Object.entries(CAMPAIGN_ORDERS).map(([id, cfg]) => `<option value="${id}" ${assessment.currentOrder === id ? 'selected' : ''}>${cfg.label}</option>`).join('');
    return `<div class="raid-status campaign-command-card" data-campaign-card="${campaign.id}"><strong>${assessment.defenderName}</strong> · ${assessment.phase.replaceAll('_',' ')} · risk ${assessment.risk}<br>
      ${assessment.personnel.toLocaleString()} troops remaining of ${assessment.initialPersonnel.toLocaleString()} · casualties ${Math.round(assessment.casualtyShare * 100)}% · morale ${Math.round(assessment.morale * 100)}%<br>
      Supply ${Math.round(assessment.supply * 100)}% · ${weeks} weeks carried food · corridor ${Math.round(assessment.corridorReliability * 100)}%${assessment.corridorBrokenNodeId ? ` · cut at ${assessment.corridorBrokenNodeId}` : ''}<br>
      General intends: ${String(assessment.generalIntent).replaceAll('_',' ')}.<br><strong>Marshal:</strong> ${assessment.reason}<br>
      Recommendation: <strong>${CAMPAIGN_ORDERS[assessment.recommendation]?.label || assessment.recommendation}</strong>
      <label class="control-row">Ruler's operational order<select data-campaign-order-select="${campaign.id}">${orderOptions}</select></label>
      <button data-apply-campaign-order="${campaign.id}">Issue order</button>
      <button data-follow-campaign-advice="${campaign.id}">Follow Marshal recommendation</button></div>`;
  }).join('') : '<div class="raid-status">No field campaign is currently under your command.</div>';
  const diplomaticTargets = (playerState?.status === 'vassal' || playerState?.status === 'governor') ? [] : regions
    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));
  const activeAgreements = agreements.filter((a) => a.active && (a.fromId === region.id || a.toId === region.id));
  const polity = sovereignPolity(region, polities);
  const levyOffers = availableVassalLevies(region, regions, polities, clock.tickIndex);
  const totalVassalLevies = levyOffers.reduce((sum, offer) => sum + offer.available, 0);
  const inFlightLine = inFlight.length
    ? `<div class="raid-status">${inFlight.length} raid(s) currently away (${inFlight.reduce((s, r) => s + r.personnel, 0).toLocaleString()} soldiers)</div>`
    : '';

  document.getElementById('region-controls').innerHTML = `
    <div class="raid-section military-strategy-section">
      <strong>Military strategy</strong>
      <label class="control-row">Posture
        <select id="military-posture">
          <option value="peace" ${ensureMilitaryStrategy(region).posture === 'peace' ? 'selected' : ''}>Peace — local defence</option>
          <option value="guarded" ${ensureMilitaryStrategy(region).posture === 'guarded' ? 'selected' : ''}>Guarded</option>
          <option value="prepare_war" ${ensureMilitaryStrategy(region).posture === 'prepare_war' ? 'selected' : ''}>Prepare for war</option>
          <option value="mobilise_war" ${ensureMilitaryStrategy(region).posture === 'mobilise_war' ? 'selected' : ''}>Mobilise for war</option>
          <option value="emergency_defence" ${ensureMilitaryStrategy(region).posture === 'emergency_defence' ? 'selected' : ''}>Emergency defence</option>
        </select>
      </label>
      <label class="control-row">War planning target
        <select id="military-plan-target"><option value="">— none —</option>${diplomaticTargets.map((target) => `<option value="${target.id}" ${ensureMilitaryStrategy(region).targetRegionId === target.id ? 'selected' : ''}>${target.name}</option>`).join('')}</select>
      </label>
      <label class="control-row">Minimum normal garrisons <span id="garrison-floor-label">${Math.round(ensureMilitaryStrategy(region).garrisonFloor * 100)}%</span>
        <input type="range" id="military-garrison-floor" min="10" max="100" value="${Math.round(ensureMilitaryStrategy(region).garrisonFloor * 100)}">
      </label>
      <label class="control-row">Military spending priority <span id="military-spending-label">${Math.round(ensureMilitaryStrategy(region).spendingPriority * 100)}%</span>
        <input type="range" id="military-spending-priority" min="10" max="100" value="${Math.round(ensureMilitaryStrategy(region).spendingPriority * 100)}">
      </label>
      <label class="control-row">Desired preparation time (weeks)
        <input type="number" id="military-prep-weeks" min="4" max="260" step="4" value="${ensureMilitaryStrategy(region).desiredPreparationWeeks}">
      </label>
      <label class="control-row">Assume vassal help
        <select id="military-vassal-assumption">${['none','conservative','normal','optimistic'].map((v) => `<option value="${v}" ${ensureMilitaryStrategy(region).vassalAssumption === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class="control-row">Assume ally help
        <select id="military-ally-assumption">${['none','conservative','normal','optimistic'].map((v) => `<option value="${v}" ${ensureMilitaryStrategy(region).allyAssumption === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div id="military-plan-report" class="raid-status"></div>
    </div>
    <div class="raid-section campaign-command-section"><strong>Campaign command</strong>
      <div class="raid-status">Give the general an operational intent rather than moving individual units. The Marshal will interrupt only when the campaign becomes materially dangerous.</div>
      ${campaignCommandHtml}
    </div>
    <label class="control-row">Target navy size (boats)
      <input type="number" min="0" step="1" id="input-navy" value="${Math.round(region.targetNavySize)}" ${region.isCoastal ? '' : 'disabled title="not a coastal region"'}>
    </label>
    <div class="raid-section">
      <strong>Government scouting</strong>
      <div id="scouting-control-status" class="raid-status">${region.scouting?.active
        ? `${region.scouting.mode === 'sea' ? 'Naval' : 'Land'} expedition away · ${region.scouting.armyCommitted || 0} soldiers${region.scouting.navyCommitted ? ' · 1 fleet boat' : ''}`
        : region.scouting?.lastResult?.success
          ? `Last expedition made contact with ${region.scouting.lastResult.targetName}`
          : region.scouting?.lastResult ? 'Last expedition returned without making contact' : 'No expedition currently away'}</div>
      <label class="control-row">Scout by
        <select id="scouting-mode">
          <option value="auto">best available route</option>
          <option value="land">land patrol</option>
          ${region.isCoastal ? '<option value="sea">naval expedition</option>' : ''}
        </select>
      </label>
      ${region.isCoastal ? `<label class="control-row">Naval heading
        <select id="scouting-heading">
          <option value="">unspecified</option>
          <option value="N">north</option><option value="NE">north-east</option><option value="E">east</option><option value="SE">south-east</option>
          <option value="S">south</option><option value="SW">south-west</option><option value="W">west</option><option value="NW">north-west</option>
        </select>
      </label>` : ''}
      <button id="btn-scout-launch" ${region.scouting?.active ? 'disabled' : ''}>Send scouting expedition</button>
    </div>
    ${polity ? `<div class="raid-status"><strong>${polity.name}</strong> · ${polity.report.subjectCount || 0} subject region(s) · legitimacy ${(polity.administration.legitimacy * 100).toFixed(0)}%<br>
      Administration: records ${(polity.administration.recordKeeping * 100).toFixed(0)}%, accounting ${(polity.administration.accounting * 100).toFixed(0)}%, communications ${(polity.administration.communications * 100).toFixed(0)}%, officials ${(polity.administration.officialdom * 100).toFixed(0)}%, delegation ${(polity.administration.delegation * 100).toFixed(0)}%<br>
      Institutions: ${[...polity.administration.breakthroughs].map((name) => name.replaceAll('_', ' ')).join(', ') || 'custom and oral authority'}</div>` : ''}
    <div class="raid-section">
      ${targets.length === 0
        ? '<div class="raid-status">No visible reachable raid targets (need a land border, or a shared sea plus navy capacity)</div>'
        : `
          <label class="control-row">Raid target
            <select id="raid-target">
              <option value="">— select —</option>
              ${targets.map((t) => `<option value="${t.region.id}" data-sea="${t.viaSea}">${t.region.name}${t.viaSea ? ' (sea)' : ''}</option>`).join('')}
            </select>
          </label>
          <label class="control-row">Send <span id="raid-fraction-label">50%</span> of home army
            <input type="range" id="raid-fraction" min="0" max="100" value="50">
          </label>
          <div id="raid-info" class="raid-status"></div>
          ${levyOffers.length ? `<label class="control-row"><span>Call vassal contingents (up to ${totalVassalLevies.toLocaleString()} now)</span>
            <input type="checkbox" id="raid-use-vassals" ${totalVassalLevies > 0 ? '' : 'disabled'}>
          </label>` : ''}
          <button id="btn-raid-launch" disabled>Launch Raid</button>
        `}
      ${inFlightLine}
    </div>
    <div class="raid-section diplomacy-section">
      <strong>Relations and agreements</strong>
      ${diplomaticTargets.length === 0
        ? '<div class="raid-status">No known neighbouring cultures to negotiate with.</div>'
        : `<label class="control-row">Neighbour
            <select id="diplomacy-target">
              <option value="">— select —</option>
              ${diplomaticTargets.map((target) => {
                const feeling = attitudeToward(target, region.id);
                return `<option value="${target.id}">${target.name} — ${attitudeLabel(feeling)}</option>`;
              }).join('')}
            </select>
          </label>
          <label class="control-row">Offer or demand
            <select id="diplomacy-action">
              <option value="military_support">Send troops against bandits</option>
              <option value="tribute">Demand weekly tribute</option>
              <option value="resource_access">Claim wood-harvesting rights</option>
              <option value="join_war">Ask them to join a war</option>
              <option value="joint_operation">Plan a joint attack for a future date</option>
              <option value="vassalage">Demand submission as a vassal</option>
            </select>
          </label>
          <label class="control-row" id="support-personnel-row">Troops / requested contribution
            <input type="number" min="10" step="10" id="support-personnel" value="${Math.max(10, Math.floor(region.army.personnel * 0.1))}">
          </label>
          <label class="control-row hidden" id="war-enemy-row">Ask them to fight
            <select id="war-enemy"><option value="">— select enemy —</option>${regions.filter((candidate) => candidate.id !== region.id && fogOfWar.isVisible(candidate)).map((candidate) => `<option value="${candidate.id}">${candidate.name}</option>`).join('')}</select>
          </label>
          <label class="control-row hidden" id="joint-operation-months-row">Attack in
            <input id="joint-operation-months" type="number" min="1" max="60" step="1" value="3"> months
          </label>
          <label class="control-row hidden" id="joint-operation-share-row">Promise to commit
            <input id="joint-operation-share" type="number" min="10" max="95" step="5" value="60">% of the field army
          </label>
          <div id="diplomacy-info" class="raid-status"></div>
          <button id="btn-diplomacy-propose" disabled>Make proposal</button>`}
      ${activeAgreements.length === 0 ? '' : `
        <div class="agreement-list">
          ${activeAgreements.map((agreement) => {
            const otherId = agreement.fromId === region.id ? agreement.toId : agreement.fromId;
            const other = regions.find((r) => r.id === otherId);
            const labels = { military_support: 'military support', tribute: 'tribute', resource_access: 'wood access', war_commitment: 'war commitment' };
            return `<div class="agreement-row"><span>${labels[agreement.type]} — ${other?.name || otherId}</span><button data-end-agreement="${agreement.id}">End</button></div>`;
          }).join('')}
        </div>`}
    </div>
  `;

  const refreshMilitaryPlan = () => {
    const strategy = setMilitaryStrategy(region, {
      posture: document.getElementById('military-posture')?.value || 'peace',
      targetRegionId: document.getElementById('military-plan-target')?.value || null,
      garrisonFloor: (Number(document.getElementById('military-garrison-floor')?.value) || 100) / 100,
      spendingPriority: (Number(document.getElementById('military-spending-priority')?.value) || 45) / 100,
      desiredPreparationWeeks: Number(document.getElementById('military-prep-weeks')?.value) || 26,
      vassalAssumption: document.getElementById('military-vassal-assumption')?.value || 'conservative',
      allyAssumption: document.getElementById('military-ally-assumption')?.value || 'conservative',
    });
    const report = reviewMilitaryStrategy(region, { regions, polities, agreements, activeCampaigns: window.__worldsim?.activeCampaigns || [], currentTick: calendarWeekIndex(clock.elapsedDays || 0) });
    const garrisonLabel = document.getElementById('garrison-floor-label');
    const spendingLabel = document.getElementById('military-spending-label');
    if (garrisonLabel) garrisonLabel.textContent = `${Math.round(strategy.garrisonFloor * 100)}%`;
    if (spendingLabel) spendingLabel.textContent = `${Math.round(strategy.spendingPriority * 100)}%`;
    const status = document.getElementById('military-plan-report');
    if (status) status.innerHTML = `Authorised establishment: ${report.establishment.toLocaleString()} · current ${report.currentPersonnel.toLocaleString()}<br>` +
      `Normal garrisons ${report.normalGarrison.toLocaleString()} → retain ${report.retainedGarrison.toLocaleString()} · desired field army ${report.desiredFieldArmy.toLocaleString()}<br>` +
      `Expected support: vassals ${report.expectedVassalSupport.toLocaleString()} / nominal ${report.nominalVassalSupport.toLocaleString()}, allies ${report.expectedAllySupport.toLocaleString()} / nominal ${report.nominalAllySupport.toLocaleString()}` +
      (report.targetName ? `<br>Plan against ${report.targetName}: estimated opposing force ${report.estimatedEnemy.toLocaleString()} (uncertainty ±${Math.round(report.enemyUncertainty * 100)}%)${report.viaSea ? ' · overseas operation' : ''}` : '');
  };
  ['military-posture','military-plan-target','military-garrison-floor','military-spending-priority','military-prep-weeks','military-vassal-assumption','military-ally-assumption']
    .forEach((id) => document.getElementById(id)?.addEventListener(id.includes('floor') || id.includes('priority') ? 'input' : 'change', refreshMilitaryPlan));
  refreshMilitaryPlan();

  document.querySelectorAll('[data-apply-campaign-order]').forEach((button) => button.addEventListener('click', () => {
    const id = Number(button.dataset.applyCampaignOrder);
    const campaign = playerCampaigns.find((item) => Number(item.id) === id);
    const defender = campaign ? regions.find((candidate) => candidate.id === campaign.defenderId) : null;
    const select = document.querySelector(`[data-campaign-order-select="${id}"]`);
    if (campaign && select) issueCampaignOrder(campaign, select.value, defender, calendarWeekIndex(clock.elapsedDays || 0), { playerIssued: true });
    renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  }));
  document.querySelectorAll('[data-follow-campaign-advice]').forEach((button) => button.addEventListener('click', () => {
    const id = Number(button.dataset.followCampaignAdvice);
    const campaign = playerCampaigns.find((item) => Number(item.id) === id);
    if (!campaign) return;
    const attacker = regions.find((candidate) => candidate.id === campaign.attackerId);
    const defender = regions.find((candidate) => candidate.id === campaign.defenderId);
    const assessment = marshalCampaignAssessment(campaign, attacker, defender);
    issueCampaignOrder(campaign, assessment.recommendation, defender, calendarWeekIndex(clock.elapsedDays || 0), { playerIssued: true, rationale: 'marshal_advice' });
    renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  }));

  document.getElementById('input-navy').addEventListener('change', (e) => {
    region.targetNavySize = Math.max(0, Number(e.target.value) || 0);
  });

  const scoutButton = document.getElementById('btn-scout-launch');
  scoutButton?.addEventListener('click', () => {
    const mode = document.getElementById('scouting-mode')?.value || 'auto';
    const heading = document.getElementById('scouting-heading')?.value || null;
    const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);
    const mission = startScoutingMission(region, regions, currentWeek, Math.random, mode, heading);
    const status = document.getElementById('scouting-control-status');
    if (!mission) {
      if (status) status.textContent = 'No viable scouting route or insufficient army/fleet capacity.';
      return;
    }
    if (status) status.textContent = `${mission.mode === 'sea' ? 'Naval' : 'Land'} expedition dispatched${mission.heading ? ` ${mission.heading}` : ''} · ${mission.armyCommitted} soldiers${mission.navyCommitted ? ' · 1 fleet boat' : ''} · expected return in ${Math.max(1, Math.round(mission.completeTick-currentWeek))} weeks`;
    scoutButton.disabled = true;
  });

  if (targets.length > 0) {
    const targetSelect = document.getElementById('raid-target');
    const fractionSlider = document.getElementById('raid-fraction');
    const launchBtn = document.getElementById('btn-raid-launch');

  const updateRaidInfo = () => {
    const fraction = Number(fractionSlider.value) / 100;
    document.getElementById('raid-fraction-label').textContent = Math.round(fraction * 100) + '%';

    const targetId = targetSelect.value;
    if (!targetId) {
      document.getElementById('raid-info').textContent = '';
      launchBtn.disabled = true;
      return;
    }

    const target = targets.find((t) => t.region.id === targetId);
    let requested = Math.floor(region.army.personnel * fraction);
    let capNote = '';

    if (target.viaSea) {
      const maxSea = maxSeaRaidersAvailable(region);
      if (requested > maxSea) {
        requested = maxSea;
        capNote = ` (capped by navy capacity — ${region.navy.boats.toFixed(0)} boats)`;
      }
    }

    document.getElementById('raid-info').textContent =
      `Sending ${requested.toLocaleString()} of ${Math.round(region.army.personnel).toLocaleString()} home soldiers${capNote}`;
    const useVassals = !target.viaSea && document.getElementById('raid-use-vassals')?.checked;
    document.getElementById('raid-info').textContent += useVassals
      ? ` plus up to ${totalVassalLevies.toLocaleString()} vassal troops` : '';
    launchBtn.disabled = requested <= 0 && !(useVassals && totalVassalLevies > 0);
  };

    targetSelect.addEventListener('change', updateRaidInfo);
    fractionSlider.addEventListener('input', updateRaidInfo);
    document.getElementById('raid-use-vassals')?.addEventListener('change', updateRaidInfo);
    updateRaidInfo();

    launchBtn.addEventListener('click', () => {
    const target = targets.find((t) => t.region.id === targetSelect.value);
    if (!target) return;

    const fraction = Number(fractionSlider.value) / 100;
    const requested = Math.floor(region.army.personnel * fraction);
    const useVassals = !target.viaSea && document.getElementById('raid-use-vassals')?.checked;
    const contingents = useVassals ? musterVassalLevies(region, regions, polities, clock.tickIndex) : [];
    const raid = launchRaid(region, target.region, requested, target.viaSea, clock.tickIndex,
      { regions, polities, contingents });

    if (raid) {
      activeRaids.push(raid);
      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    }
    });
  }

  const diplomacyTarget = document.getElementById('diplomacy-target');
  const diplomacyAction = document.getElementById('diplomacy-action');
  const diplomacyButton = document.getElementById('btn-diplomacy-propose');
  if (diplomacyTarget && diplomacyAction && diplomacyButton) {
    const supportRow = document.getElementById('support-personnel-row');
    const updateDiplomacyInfo = () => {
      supportRow.classList.toggle('hidden', !['military_support','join_war'].includes(diplomacyAction.value));
      document.getElementById('war-enemy-row')?.classList.toggle('hidden', !['join_war','joint_operation'].includes(diplomacyAction.value));
      document.getElementById('joint-operation-months-row')?.classList.toggle('hidden', diplomacyAction.value !== 'joint_operation');
      document.getElementById('joint-operation-share-row')?.classList.toggle('hidden', diplomacyAction.value !== 'joint_operation');
      diplomacyButton.disabled = !diplomacyTarget.value;
      const target = diplomaticTargets.find((r) => r.id === diplomacyTarget.value);
      document.getElementById('diplomacy-info').textContent = target
        ? `${target.name}'s culture is ${attitudeLabel(attitudeToward(target, region.id))} toward yours. Coercive demands require a clear military advantage.`
        : '';
    };
    diplomacyTarget.addEventListener('change', updateDiplomacyInfo);
    diplomacyAction.addEventListener('change', updateDiplomacyInfo);
    updateDiplomacyInfo();

    diplomacyButton.addEventListener('click', () => {
      const target = diplomaticTargets.find((r) => r.id === diplomacyTarget.value);
      if (!target) return;
      let result;
      if (diplomacyAction.value === 'joint_operation') {
        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);
        if (!enemy || enemy.id === target.id) { document.getElementById('diplomacy-info').textContent = 'Choose a different polity as the target of the joint attack.'; return; }
        const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);
        const months = Math.max(1, Number(document.getElementById('joint-operation-months')?.value) || 3);
        const share = Math.max(10, Math.min(95, Number(document.getElementById('joint-operation-share')?.value) || 60)) / 100;
        result = sendJointOperationProposal(region, target, enemy, regions, currentWeek, {
          attackTick: currentWeek + Math.max(2, Math.round(months * 4.345)), commitmentFraction: share,
          secrecy: ensureMilitaryStrategy(region).secrecy,
        });
        document.getElementById('diplomacy-info').textContent = result.sent
          ? `Courier dispatched. You propose attacking ${enemy.name} in about ${months} month${months === 1 ? '' : 's'} and promise roughly ${Math.round(share * 100)}% of the field army. Their answer must travel back before you know it.`
          : `Could not dispatch the plan (${String(result.reason).replaceAll('_', ' ')}).`;
        return;
      }
      if (diplomacyAction.value === 'join_war') {
        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);
        if (!enemy || enemy.id === target.id) { document.getElementById('diplomacy-info').textContent = 'Choose a different polity as the enemy they should fight.'; return; }
        result = sendWarInvitation(region, target, enemy, regions, calendarWeekIndex(clock.elapsedDays || 0), {
          requestedPersonnel: Number(document.getElementById('support-personnel')?.value) || 0,
          secrecy: ensureMilitaryStrategy(region).secrecy,
        });
        document.getElementById('diplomacy-info').textContent = result.sent
          ? `Courier dispatched to ${target.name}. Expected arrival around week ${result.message.arrivalTick}; the message may be delayed, intercepted or exposed en route.`
          : `Could not dispatch the request (${String(result.reason).replaceAll('_', ' ')}).`;
        return;
      }
      result = diplomacyAction.value === 'vassalage'
        ? demandVassalage(region, target, polities, toolTypes, clock.tickIndex, regions)
        : proposeAgreement(diplomacyAction.value, region, target, agreements, toolTypes,
          clock.tickIndex, { personnel: Number(document.getElementById('support-personnel')?.value) || 0 });
      document.getElementById('diplomacy-info').textContent = result.accepted
        ? `${target.name} accepted the agreement.`
        : `The proposal failed (${String(result.reason).replaceAll('_', ' ')}).`;
      if (result.accepted) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    });
  }

  document.querySelectorAll('[data-end-agreement]').forEach((button) => {
    button.addEventListener('click', () => {
      const agreement = agreements.find((candidate) => candidate.id === Number(button.dataset.endAgreement));
      endAgreement(agreement, new Map(regions.map((r) => [r.id, r])), clock.tickIndex);
      renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    });
  });
  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0));
}

function renderSubjectRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes) {
  const governance = region.governance;
  const capital = regions.find((candidate) => candidate.id === playerRegionId);
  const polity = sovereignPolity(capital, polities);
  const forms = governanceFormAvailability(region, polity);
  const offer = availableVassalLevies(capital, regions, polities, clock.tickIndex)
    .find((candidate) => candidate.region.id === region.id);
  const history = governance.levyHistory;
  const survival = history.sent > 0 ? history.returned / history.sent : null;
  const reportAge = governance.lastReport ? clock.tickIndex - governance.lastReport.asOfTick : null;
  const languagePolicy = ensureRegionalLanguagePolicy(region);
  const languageAssessment = regionalLanguagePolicyAssessment(region, capital, polity);
  const languageDifference = languageAssessment.mismatch ? 'Local and state languages differ.' : 'Local and state language are currently the same.';
  document.getElementById('region-controls').innerHTML = `
    <div class="raid-status"><strong>${governanceLabel(region)}</strong><br>
      Administrative control ${(governance.administrativeControl * 100).toFixed(0)}% · autonomy ${(governance.autonomy * 100).toFixed(0)}% · estimated corruption ${(governance.corruption * 100).toFixed(0)}%<br>
      Reports arrive about ${governance.reportDelayWeeks} week(s) apart${reportAge === null ? '; no regular report has arrived yet' : `; latest report is ${reportAge} week(s) old`}. Local passage is guaranteed.</div>
    <label class="control-row">Form of rule
      <select id="subject-form">
        <option value="vassal" ${governance.relationship === 'vassal' ? 'selected' : ''}>Subordinate local ruler</option>
        <option value="delegated" ${governance.relationship === 'delegated' ? 'selected' : ''} ${forms.delegated ? '' : 'disabled'}>Delegated royal province</option>
        <option value="integrated" ${governance.relationship === 'integrated' ? 'selected' : ''} ${forms.integrated ? '' : 'disabled'}>Integrated province</option>
      </select>
    </label>
    <div class="raid-status">Governor: ${governance.governor?.type?.replaceAll('_', ' ') || 'none'} · competence ${((governance.governor?.competence || 0) * 100).toFixed(0)}% · loyalty ${((governance.governor?.loyalty || 0) * 100).toFixed(0)}%</div>
    <div class="raid-section"><strong>Administrative language</strong>
      <label class="control-row">Policy
        <select id="subject-language-policy">
          <option value="local" ${languagePolicy.mode === 'local' ? 'selected' : ''}>Use the local language</option>
          <option value="bilingual" ${languagePolicy.mode === 'bilingual' ? 'selected' : ''} ${governance.relationship === 'vassal' ? 'disabled' : ''}>Bilingual administration</option>
          <option value="state" ${languagePolicy.mode === 'state' ? 'selected' : ''} ${governance.relationship === 'vassal' ? 'disabled' : ''}>Use the state language</option>
        </select>
      </label>
      <div id="subject-language-policy-info" class="raid-status">${languageDifference}<br>
        Estimated administrative cost ${languageAssessment.costPerWeek.toFixed(2)}/week · control effect ${Math.round((languageAssessment.controlMultiplier - 1) * 100)}% · report delay ${Math.round((languageAssessment.reportDelayMultiplier - 1) * 100)}% · corruption ${languageAssessment.corruptionDelta >= 0 ? '+' : ''}${Math.round(languageAssessment.corruptionDelta * 100)} points.<br>
        ${languagePolicy.mode === 'local' ? 'Best local legitimacy and language retention, but central oversight is weaker.' : languagePolicy.mode === 'bilingual' ? 'Best compromise when properly staffed, but it consumes more money and scarce bilingual officials.' : 'Cheap and potentially efficient once widely understood, but initially disruptive and assimilationist where the population does not speak it.'}</div>
    </div>
    <div class="delegated-powers">
      ${Object.entries(governance.delegatedPowers || {}).map(([power, enabled]) => `<label class="control-row"><span>Delegate ${power.replace(/([A-Z])/g, ' $1').toLowerCase()}</span><input type="checkbox" data-delegated-power="${power}" ${enabled ? 'checked' : ''}></label>`).join('')}
    </div>
    <label class="control-row">Tribute demand <span id="subject-tribute-label">${(governance.tributeRate * 100).toFixed(0)}%</span>
      <input type="range" id="subject-tribute" min="0" max="25" value="${governance.tributeRate * 100}">
    </label>
    <label class="control-row">Maximum military obligation <span id="subject-levy-label">${(governance.militaryObligation * 100).toFixed(0)}%</span>
      <input type="range" id="subject-levy" min="0" max="80" value="${governance.militaryObligation * 100}">
    </label>
    <label class="control-row">Local autonomy <span id="subject-autonomy-label">${(governance.autonomy * 100).toFixed(0)}%</span>
      <input type="range" id="subject-autonomy" min="10" max="98" value="${governance.autonomy * 100}">
    </label>
    <div class="raid-status">Army at home: ${Math.round(region.army.personnel).toLocaleString()}<br>
      Willing to lend now: ${(offer?.available || 0).toLocaleString()} (${offer?.reason?.replaceAll('_', ' ') || 'unavailable'})<br>
      Local defence reserve: ${(offer?.reserveNeeded || 0).toLocaleString()} · insecurity ${((offer?.insecurity || 0) * 100).toFixed(0)}%<br>
      Previous contingents: ${history.sent.toLocaleString()} sent, ${history.returned.toLocaleString()} returned${survival === null ? '' : ` (${(survival * 100).toFixed(0)}% survival)`}</div>
    <div class="raid-status">Routine labour, trade and local defence remain under the local ruler. Your authority is limited to tribute, broad military obligations and passage.</div>
    <div class="raid-section"><strong>Political settlement</strong><br>
      <button id="btn-grant-more-autonomy">Grant another 10% autonomy</button>
      <div class="raid-status">You can return or grant this region to a polity with a plausible historical/cultural claim.</div>
      <select id="transfer-region-target"><option value="">— choose recipient —</option></select>
      <button id="btn-transfer-region" disabled>Transfer / liberate region</button>
    </div>
  `;
  const wirePolicy = (id, labelId, policy) => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      const value = Number(input.value) / 100;
      setGovernancePolicy(region, policy, value);
      document.getElementById(labelId).textContent = `${Math.round(value * 100)}%`;
    });
  };
  wirePolicy('subject-tribute', 'subject-tribute-label', 'tributeRate');
  wirePolicy('subject-levy', 'subject-levy-label', 'militaryObligation');
  wirePolicy('subject-autonomy', 'subject-autonomy-label', 'autonomy');
  document.getElementById('subject-language-policy')?.addEventListener('change', (event) => {
    const result = setRegionalLanguagePolicy(region, event.target.value, { playerChoice: true, currentTick: clock.tickIndex });
    if (result.changed) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
  document.getElementById('subject-form').addEventListener('change', (event) => {
    const result = changeGovernanceForm(region, event.target.value, polity);
    if (result.changed) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
  document.querySelectorAll('[data-delegated-power]').forEach((input) => {
    input.addEventListener('change', () => setDelegatedPower(region, input.dataset.delegatedPower, input.checked));
  });
  document.getElementById('btn-grant-more-autonomy')?.addEventListener('click', () => {
    grantRegionalAutonomy(region, 0.1);
    renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
  const transferSelect = document.getElementById('transfer-region-target');
  const transferButton = document.getElementById('btn-transfer-region');
  for (const candidate of polities) {
    if (candidate.id === polity?.id) continue;
    const score = plausibleGovernedRegions(candidate, [region], polities, 0.42)[0]?.score || 0;
    if (score < 0.42) continue;
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.name} (claim ${Math.round(score * 100)}%)`;
    transferSelect?.appendChild(option);
  }
  transferSelect?.addEventListener('change', () => { if (transferButton) transferButton.disabled = !transferSelect.value; });
  transferButton?.addEventListener('click', () => {
    const recipient = polityById(polities, transferSelect.value);
    if (!recipient || !polity) return;
    const reason = (recipient.continuity?.claims?.[region.id] || 0) >= 0.7 ? 'liberation' : 'grant';
    const result = transferRegion(region, polity, recipient, regions, polities, clock.tickIndex, reason);
    if (result.transferred) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
}

function renderExileGovernmentControls(hostRegion, regions, polities, playerPolity) {
  const state = playerPolity.continuity;
  const claims = plausibleGovernedRegions(playerPolity, regions, polities, 0.32).slice(0, 8);
  const backing = restorationBacking(playerPolity);
  const targets = polities.filter((candidate) => candidate.id !== playerPolity.id);
  document.getElementById('region-controls').innerHTML = `
    <div class="raid-status"><strong>Government in exile</strong><br>
      Your court is hosted in ${hostRegion.name}. You govern no local population here.<br>
      Exile community: ${Math.round(state.exilePopulation || 0).toLocaleString()} · legitimacy ${Math.round((state.legitimacy || 0) * 100)}%</div>
    <div class="raid-section"><strong>Restoration claims</strong>
      ${claims.length ? claims.map((item) => `<div class="raid-status">${item.region.name}: ${Math.round(item.score * 100)}% plausible restoration claim</div>`).join('') : '<div class="raid-status">No strong territorial claim remains.</div>'}
    </div>
    <div class="raid-section"><strong>Diplomacy from exile</strong>
      <label class="control-row">Lobby polity
        <select id="exile-lobby-target">${targets.map((candidate) => `<option value="${candidate.id}">${candidate.name}</option>`).join('')}</select>
      </label>
      <button id="btn-exile-lobby">Seek recognition and restoration backing</button>
      <div id="exile-lobby-status" class="raid-status">${backing.length ? backing.slice(0, 5).map((item) => `${polityById(polities, item.polityId)?.name || item.polityId}: ${Math.round(item.support * 100)}% backing`).join(' · ') : 'No foreign government has committed meaningful backing yet.'}</div>
      <div class="raid-status">Backing does not create an army from nothing. It preserves diplomatic leverage for liberation, rebellion and restoration when a host or ally has the opportunity to act.</div>
    </div>`;
  document.getElementById('btn-exile-lobby')?.addEventListener('click', () => {
    const target = polityById(polities, document.getElementById('exile-lobby-target')?.value);
    const result = lobbyForRestoration(playerPolity, target, regions);
    const status = document.getElementById('exile-lobby-status');
    if (status) status.textContent = result.success
      ? `${target.name} restoration backing is now ${Math.round(result.support * 100)}%.`
      : `Lobbying failed (${String(result.reason).replaceAll('_', ' ')}).`;
  });
}


function actorRegion(regions, actorId) {
  return regions.find((region) => (region.governance?.sovereignPolityId || region.controllingActorId || region.id) === actorId) || null;
}

function preparePlayerWarEntryEvents(events, wars, playerActorId, regions) {
  if (!playerActorId) return;
  for (const event of events) {
    if (event.type !== 'war_participant_joined') continue;
    const war = wars.find((candidate) => candidate.id === event.warId);
    const player = participantInWar(war, playerActorId);
    if (!war || !player) continue;
    event.playerInvolved = true;
    event.war = war;
    event.entrantName = actorRegion(regions, event.actorId)?.name || event.actorId;
    event.playerIsEntrant = event.actorId === playerActorId;
    const entrant = participantInWar(war, event.actorId);
    const counterpart = event.playerIsEntrant
      ? war.participants.find((p) => p.actorId !== playerActorId && p.sideId === entrant?.sideId)
      : entrant;
    event.sameSide = counterpart ? counterpart.sideId === player.sideId : false;
    event.resolveWarEntry = (choice) => {
      const others = war.participants.filter((p) => p.actorId !== playerActorId);
      const primaryEnemy = others.find((p) => p.sideId !== player.sideId)?.actorId || others[0]?.actorId;
      if (choice === 'cooperate') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId,
          other.sideId === player.sideId ? WAR_STANCES.COOPERATE : WAR_STANCES.HOSTILE);
      } else if (choice === 'cobelligerent') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId,
          other.sideId === player.sideId ? WAR_STANCES.COBELLIGERENT : WAR_STANCES.HOSTILE);
      } else if (choice === 'avoid_entrant') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.AVOID);
      } else if (choice === 'fight_all_primary') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId, WAR_STANCES.HOSTILE);
        if (primaryEnemy) setEnemyPriority(war, playerActorId, primaryEnemy, 0.8);
      } else if (choice === 'prioritise_entrant') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.HOSTILE);
        setEnemyPriority(war, playerActorId, event.actorId, 0.85);
      } else if (choice === 'prioritise_existing') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.HOSTILE);
        if (primaryEnemy && primaryEnemy !== event.actorId) setEnemyPriority(war, playerActorId, primaryEnemy, 0.85);
      }
      return war;
    };
  }
}

function showNextEvent(clock, eventQueue) {
  if (eventQueue.length === 0) return;

  const event = eventQueue.shift();
  if (event.type === 'war_participant_joined') {
    const options = document.getElementById('event-options');
    document.getElementById('event-title').textContent = `${event.entrantName} enters the war`;
    document.getElementById('event-body').textContent = event.playerIsEntrant
      ? `Your state has entered an existing multi-party war. Decide how your armies should treat the other belligerents; sharing an enemy does not automatically make another army your ally.`
      : `${event.entrantName} has entered a war in which you are already fighting. Decide whether to coordinate, avoid them, or treat them as another enemy. These orders also guide how your generals divide effort between fronts.`;
    const choices = event.sameSide
      ? [['cooperate','Coordinate as allies'],['cobelligerent','Fight the common enemy independently'],['avoid_entrant','Avoid their forces'],['prioritise_entrant','Treat them as hostile']]
      : [['prioritise_existing','Fight both; prioritise existing enemy'],['prioritise_entrant','Fight both; prioritise newcomer'],['avoid_entrant','Avoid the newcomer if possible'],['fight_all_primary','Fight all belligerents']];
    options.innerHTML = choices.map(([id,label]) => `<button data-war-choice="${id}">${label}</button>`).join(' ');
    document.getElementById('event-modal').classList.remove('hidden');
    options.querySelectorAll('[data-war-choice]').forEach((button) => button.addEventListener('click', () => {
      event.resolveWarEntry?.(button.dataset.warChoice);
      document.getElementById('event-modal').classList.add('hidden');
      if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
    }));
    return;
  }
  if (event.type === 'organisation_founded') {
    const organisation = event.organisation;
    document.getElementById('event-title').textContent = `${organisation?.name || 'A new organisation'} emerges`;
    const labels = { free_city: 'an autonomous commercial city', pirate_haven: 'a pirate haven', mercenary_company: 'a mercenary company', merchant_league: 'a merchant league', chartered_company: 'a chartered territorial company', interstate_league: 'an interstate league' };
    document.getElementById('event-body').textContent = `${organisation?.name || 'A new organisation'} has emerged as ${labels[organisation?.type] || organisation?.type || 'a political organisation'}. It is not automatically a sovereign country: its power comes from its treasury, members, armed capacity, legal privileges and any places it controls.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'organisation_evolved') {
    document.getElementById('event-title').textContent = 'States pool sovereignty';
    document.getElementById('event-body').textContent = `${event.organisation?.name || 'An interstate organisation'} has developed enough common authority to become a supranational union. Member states still exist, but some sovereignty is now exercised collectively.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'religious_seat_offer') {
    document.getElementById('event-title').textContent = `${event.religionName} requests an autonomous sacred seat`;
    document.getElementById('event-body').textContent = `The organised religious authority asks for a protected enclave inside ${event.regionName}. You would surrender a small part of the local tax base and direct territorial control, but hosting the seat can greatly increase religious legitimacy, pilgrimage income and influence over believers in other states.`;
    const options = document.getElementById('event-options');
    if (event.resolveDecision) {
      options.innerHTML = '<button id="btn-seat-grant">Grant the autonomous seat</button><button id="btn-seat-refuse">Keep direct control</button>';
      const finish = (choice) => {
        const result = event.resolveDecision(choice);
        document.getElementById('event-body').textContent = result?.established ? 'The sacred seat is established as an autonomous enclave inside the region. Its religious authority is now politically distinct from your government.' : 'You refuse to surrender territory. The religious hierarchy remains organised, but without an autonomous seat here.';
        options.innerHTML = '<button id="btn-event-continue">Continue</button>';
        document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });
      };
      document.getElementById('btn-seat-grant').addEventListener('click', () => finish('grant'));
      document.getElementById('btn-seat-refuse').addEventListener('click', () => finish('refuse'));
      document.getElementById('event-modal').classList.remove('hidden');
      return;
    }
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'religious_schism') {
    document.getElementById('event-title').textContent = 'Organised religious schism';
    document.getElementById('event-body').textContent = `${event.regionName} has become the centre of a durable institutional split. The new communion belongs to the same religious family but now has its own hierarchy and political patrons. This can sharpen regional identity and destabilise states that span both institutions.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'medieval_autonomy_demand') {
    document.getElementById('event-title').textContent = `${event.regionName} demands greater autonomy`;
    document.getElementById('event-body').textContent = `Local elites now command their own garrison, fiscal machinery and political networks. They ask for greater control over taxation and defence. Granting autonomy reduces immediate secession pressure but further entrenches local power.`;
    const options = document.getElementById('event-options');
    if (event.resolveDecision) {
      options.innerHTML = '<button id="btn-autonomy-grant">Grant autonomy</button><button id="btn-autonomy-refuse">Refuse the demand</button>';
      const finish = (choice) => {
        const result = event.resolveDecision(choice);
        document.getElementById('event-body').textContent = result?.granted ? 'The province receives greater autonomy, lower tribute and control over its own military and tax administration.' : 'The demand is refused. Local grievance and independence pressure rise.';
        options.innerHTML = '<button id="btn-event-continue">Continue</button>';
        document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });
      };
      document.getElementById('btn-autonomy-grant').addEventListener('click', () => finish('grant'));
      document.getElementById('btn-autonomy-refuse').addEventListener('click', () => finish('refuse'));
      document.getElementById('event-modal').classList.remove('hidden');
      return;
    }
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'succession_continuity_resolved') {
    document.getElementById('event-title').textContent = 'Succession war decided';
    document.getElementById('event-body').textContent = event.loserStatus === 'exile'
      ? `The territorial succession war is over, but the defeated claimant survives as a government in exile${event.hostPolityId ? ' under foreign protection' : ''}. Its claims, legitimacy and restoration diplomacy now use the same political-continuity system as a ruler displaced by conquest.`
      : 'The territorial succession war is over and the defeated political faction no longer has a viable continuity claim.';
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'medieval_civil_war') {
    document.getElementById('event-title').textContent = `Civil war: ${event.regionName} breaks away`;
    document.getElementById('event-body').textContent = `A local government with its own garrison, stronghold and tax apparatus has stopped recognising the former sovereign. This is not a spontaneous rebel stack: institutions built during years of local self-defence have become an independent government.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'diplomatic_message_intercepted') {
    document.getElementById('event-title').textContent = event.destroyed ? 'Diplomatic courier lost' : 'Secret message compromised';
    document.getElementById('event-body').textContent = event.destroyed
      ? 'A diplomatic courier carrying war plans was intercepted and the message never reached its destination. The enemy may now know something of your intentions.'
      : 'A diplomatic courier was intercepted or searched en route. The message continued, but your intended war and requested alliance may no longer be secret.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'join_war_response') {
    document.getElementById('event-title').textContent = event.accepted ? 'Ally joins the war' : 'War request refused';
    document.getElementById('event-body').textContent = event.accepted
      ? `${event.targetName} has agreed to join the war against ${event.enemyName}. Their commitment is now part of your general's planning assumptions, but actual troops still have to be mobilised and moved.`
      : `${event.targetName} has refused to join the war against ${event.enemyName}. Your general will no longer count on that promised contribution.`;
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'diplomat_authority_breach_reported') {
    document.getElementById('event-title').textContent = 'Envoy exceeded his mandate';
    document.getElementById('event-body').textContent = `${event.diplomat?.name || 'Your envoy'} made a commitment beyond the authority you granted. You can ratify the commitment, accepting it as state policy, or repudiate it at the cost of diplomatic credibility and the envoy's standing.`;
    const options = document.getElementById('event-options');
    options.innerHTML = '<button id="btn-dip-ratify">Ratify the commitment</button><button id="btn-dip-repudiate">Repudiate it and restrict the envoy</button>';
    document.getElementById('event-modal').classList.remove('hidden');
    const finish = (choice) => {
      const result = event.resolveDecision?.(choice);
      document.getElementById('event-body').textContent = choice === 'ratify' ? `The commitment is ratified${result?.affectedAgreements ? ` (${result.affectedAgreements} agreement)` : ''}.` : 'The commitment is repudiated and the envoy is reduced to observation authority.';
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });
    };
    document.getElementById('btn-dip-ratify').addEventListener('click', () => finish('ratify'));
    document.getElementById('btn-dip-repudiate').addEventListener('click', () => finish('repudiate'));
    return;
  }
  if (['diplomat_expelled','diplomat_detained','diplomat_compromise_suspected'].includes(event.type)) {
    document.getElementById('event-title').textContent = event.type === 'diplomat_expelled' ? 'Envoy expelled' : event.type === 'diplomat_detained' ? 'Envoy detained' : 'Spymaster questions an envoy';
    document.getElementById('event-body').textContent = event.type === 'diplomat_expelled' ? `${event.diplomat?.name || 'Your envoy'} has been ordered to leave the foreign court.` : event.type === 'diplomat_detained' ? `${event.diplomat?.name || 'Your envoy'} has been detained and cannot be recalled normally.` : `There are reasons to doubt ${event.diplomat?.name || 'your envoy'}. This is suspicion, not proof of betrayal.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'fleet_contact') {
    document.getElementById('event-title').textContent = 'Fleet sighted';
    document.getElementById('event-body').textContent = event.description;
    const options = document.getElementById('event-options');
    options.innerHTML = event.choices.map((choice) => `<button data-fleet-choice="${choice}">${choice[0].toUpperCase() + choice.slice(1)}</button>`).join(' ');
    document.getElementById('event-modal').classList.remove('hidden');
    options.querySelectorAll('[data-fleet-choice]').forEach((button) => button.addEventListener('click', () => {
      const generated = event.resolveDecision ? event.resolveDecision(button.dataset.fleetChoice) : [];
      document.getElementById('event-modal').classList.add('hidden');
      if (generated?.length) eventQueue.unshift(...generated);
      if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
    }));
    return;
  }
  if (event.type === 'fleet_battle' || event.type === 'fleet_port_assault') {
    const r = event.result;
    document.getElementById('event-title').textContent = event.type === 'fleet_port_assault' ? 'Fleet attacked in port' : 'Naval battle';
    document.getElementById('event-body').innerHTML = `${event.attackerName} fought ${event.defenderName}.<br><br>` +
      `${event.attackerName} sunk: ${formatShipOutcome(r.attackerLost)}; captured by enemy: ${formatShipOutcome(r.attackerCapturedByDefender)}; damaged: ${formatShipOutcome(r.attackerDamaged)}.<br>` +
      `${event.defenderName} sunk: ${formatShipOutcome(r.defenderLost)}; captured: ${formatShipOutcome(r.defenderCapturedByAttacker)}; damaged: ${formatShipOutcome(r.defenderDamaged)}.` +
      `${r.portDamage?.length ? `<br>Port infrastructure damaged: ${r.portDamage.map((d) => d.typeId.replaceAll('_', ' ')).join(', ')}.` : ''}`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'fleet_escaped') {
    document.getElementById('event-title').textContent = 'Fleet escapes';
    document.getElementById('event-body').textContent = 'The target fleet refused battle and escaped the pursuit.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'fleet_hail') {
    document.getElementById('event-title').textContent = 'Fleet hailed';
    document.getElementById('event-body').textContent = event.targetResponded ? 'The other fleet answered the hail. Your observers gained a closer look at its ships and flag.' : 'The other fleet ignored the hail and kept its distance.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'fleet_contact') {
    document.getElementById('event-title').textContent = 'Fleet sighted';
    document.getElementById('event-body').textContent = event.description;
    const options = document.getElementById('event-options');
    options.innerHTML = event.choices.map((choice) => `<button data-fleet-choice="${choice}">${choice[0].toUpperCase() + choice.slice(1)}</button>`).join(' ');
    document.getElementById('event-modal').classList.remove('hidden');
    options.querySelectorAll('[data-fleet-choice]').forEach((button) => button.addEventListener('click', () => {
      const generated = event.resolveDecision ? event.resolveDecision(button.dataset.fleetChoice) : [];
      document.getElementById('event-modal').classList.add('hidden');
      if (generated?.length) eventQueue.unshift(...generated);
      if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
    }));
    return;
  }
  if (event.type === 'fleet_battle' || event.type === 'fleet_port_assault') {
    const r = event.result;
    document.getElementById('event-title').textContent = event.type === 'fleet_port_assault' ? 'Fleet attacked in port' : 'Naval battle';
    document.getElementById('event-body').innerHTML = `${event.attackerName} fought ${event.defenderName}.<br><br>` +
      `${event.attackerName} sunk: ${formatShipOutcome(r.attackerLost)}; captured by enemy: ${formatShipOutcome(r.attackerCapturedByDefender)}; damaged: ${formatShipOutcome(r.attackerDamaged)}.<br>` +
      `${event.defenderName} sunk: ${formatShipOutcome(r.defenderLost)}; captured: ${formatShipOutcome(r.defenderCapturedByAttacker)}; damaged: ${formatShipOutcome(r.defenderDamaged)}.` +
      `${r.portDamage?.length ? `<br>Port infrastructure damaged: ${r.portDamage.map((d) => d.typeId.replaceAll('_', ' ')).join(', ')}.` : ''}`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'fleet_ship_worn_out') {
    document.getElementById('event-title').textContent = `${event.shipClassLabel} lost`;
    document.getElementById('event-body').textContent = `A ${event.shipClassLabel} has deteriorated beyond service and has been struck from the fleet. Warships are discrete assets; this vessel is gone.`;
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'fleet_escaped') {
    document.getElementById('event-title').textContent = 'Fleet escapes';
    document.getElementById('event-body').textContent = 'The target fleet refused battle and escaped the pursuit.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'fleet_hail') {
    document.getElementById('event-title').textContent = 'Fleet hailed';
    document.getElementById('event-body').textContent = event.targetResponded ? 'The other fleet answered the hail. Your observers gained a closer look at its ships and flag.' : 'The other fleet ignored the hail and kept its distance.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'restoration_backing') {
    document.getElementById('event-title').textContent = 'Foreign backing strengthens';
    document.getElementById('event-body').textContent = `A host government now gives substantial backing to your restoration claim. This does not guarantee intervention, but makes future liberation or recognition much more plausible.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'claimant_retreat') {
    document.getElementById('event-title').textContent = event.wasCapital ? 'The capital has fallen' : `${event.defenderName} is lost`;
    document.getElementById('event-body').textContent = event.defeatedPolityId === activePlayerPolityId
      ? (event.wasCapital
        ? `Your court and surviving claimant have retreated to another region under your control. ${event.defenderName} remains strongly claimed; losing the capital has changed your position, not ended the game.`
        : `${event.defenderName} has been occupied, but your surviving polity continues elsewhere and retains a restoration claim.`)
      : `${event.defenderName} has been occupied, but the defeated polity survives elsewhere as a claimant. The war has not erased it politically.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'settlement_required') {
    const options = document.getElementById('event-options');
    const finish = (summary) => {
      document.getElementById('event-body').textContent = summary;
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
        if (eventQueue.length > 0) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
      });
    };
    document.getElementById('event-title').textContent = event.playerRole === 'conqueror'
      ? `Terms for ${event.defenderName}` : `Your government after the fall of ${event.defenderName}`;
    if (event.playerRole === 'conqueror') {
      document.getElementById('event-body').textContent = 'Military resistance has collapsed. Choose what role, if any, to offer the defeated government. Recognition can legitimise your rule; exclusion may create a rival government in exile.';
      options.innerHTML = Object.entries(SETTLEMENT_TYPES).map(([id, terms]) => `<button data-settlement-type="${id}">${terms.label}</button>`).join('');
      options.querySelectorAll('[data-settlement-type]').forEach((button) => button.addEventListener('click', () => {
        const resolved = event.resolveSettlement(button.dataset.settlementType);
        finish(resolved?.result?.accepted
          ? `The defeated government accepted ${resolved.offer.terms.label.toLowerCase()}. Its cooperation adds legitimacy to your settlement.`
          : `The defeated government remains a rival claimant${resolved?.result?.hostPolityId ? ' under foreign protection' : ''}.`);
      }));
    } else if (event.offer?.type === 'direct_rule') {
      document.getElementById('event-body').textContent = 'The conqueror offers your government no role and intends direct rule. Your political alternative is exile.';
      options.innerHTML = '<button id="btn-settlement-reject">Form a government in exile</button>';
      document.getElementById('btn-settlement-reject').addEventListener('click', () => {
        const resolved = event.resolveSettlement('reject');
        finish(`Your government survives in exile with about ${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers and retains its claims.`);
      });
    } else {
      document.getElementById('event-body').textContent = `${event.offer?.terms?.label || 'A subordinate role'} is offered. Accepting preserves local authority but recognises the conqueror's sovereignty; refusing preserves an independent claim from exile.`;
      options.innerHTML = '<button id="btn-settlement-accept">Accept the settlement</button><button id="btn-settlement-reject">Refuse and flee</button>';
      document.getElementById('btn-settlement-accept').addEventListener('click', () => { const resolved = event.resolveSettlement('accept'); finish(`You remain in office as a ${resolved?.playerState?.status || 'subject ruler'} under the new sovereign.`); });
      document.getElementById('btn-settlement-reject').addEventListener('click', () => { const resolved = event.resolveSettlement('reject'); finish(`Your government continues in exile with about ${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers.`); });
    }
    document.getElementById('event-modal').classList.remove('hidden');
    return;
  }
  if (event.type === 'campaign_command_advice') {
    const assessment = event.assessment || {};
    const options = document.getElementById('event-options');
    document.getElementById('event-title').textContent = `Marshal: ${assessment.defenderName || 'campaign'} needs attention`;
    document.getElementById('event-body').innerHTML = `<strong>Risk: ${assessment.risk || 'unknown'}</strong><br>${assessment.reason || ''}<br><br>` +
      `${Math.round(assessment.personnel || 0).toLocaleString()} troops remain · morale ${Math.round((assessment.morale || 0) * 100)}% · supply ${Math.round((assessment.supply || 0) * 100)}% · corridor ${Math.round((assessment.corridorReliability || 0) * 100)}%.<br>` +
      `The Marshal recommends: <strong>${CAMPAIGN_ORDERS[assessment.recommendation]?.label || assessment.recommendation}</strong>.`;
    options.innerHTML = '<button id="btn-campaign-follow">Follow Marshal recommendation</button><button id="btn-campaign-ignore">Keep current orders</button>';
    const finish = (choice) => {
      const result = event.resolveDecision?.(choice);
      document.getElementById('event-body').textContent = result?.summary || 'Existing orders remain in force.';
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause(); });
    };
    document.getElementById('btn-campaign-follow').addEventListener('click', () => finish('follow'));
    document.getElementById('btn-campaign-ignore').addEventListener('click', () => finish('ignore'));
    document.getElementById('event-modal').classList.remove('hidden');
    return;
  }
  if (['joint_operation_mobilise_advice','joint_operation_stage_advice','joint_operation_launch_confirmation'].includes(event.type)) {
    const assessment = event.assessment || {};
    const options = document.getElementById('event-options');
    const isLaunch = event.type === 'joint_operation_launch_confirmation';
    const isStage = event.type === 'joint_operation_stage_advice';
    document.getElementById('event-title').textContent = isLaunch ? `Launch the promised attack on ${assessment.enemyName || 'the enemy'}?`
      : isStage ? 'Marshal: concentrate the army now?' : 'Marshal: begin mobilisation now?';
    const lead = Math.max(0, (event.plan?.attackTick || 0) - (event.dueTick || 0));
    document.getElementById('event-body').innerHTML = `${isLaunch
      ? `This is the date agreed with ${assessment.allyName || 'our ally'}. The decision to attack is still yours.`
      : isStage
        ? `The agreed attack is approaching. The Marshal recommends concentrating the promised field army at the relevant border or embarkation area.`
        : `The Marshal calculates that mobilisation should start now if we are to have the promised force ready on time.`}<br><br>` +
      `<strong>Council assessment</strong><br>${assessment.marshal || ''}<br>${assessment.treasurer || ''}<br>${assessment.steward || ''}<br>${assessment.envoy || ''}<br>${assessment.spymaster || ''}` +
      (isLaunch ? `<br><br><strong>Allied participation:</strong> ${assessment.allySummary || 'uncertain'}` : '');
    const yesLabel = isLaunch ? 'Launch the attack as promised' : isStage ? 'Concentrate the army' : 'Begin mobilisation';
    const noLabel = isLaunch ? 'Do not attack' : 'Not yet';
    options.innerHTML = `<button id="btn-joint-plan-yes">${yesLabel}</button><button id="btn-joint-plan-no">${noLabel}</button>`;
    const finish = (choice) => {
      const result = event.resolveDecision?.(choice);
      document.getElementById('event-body').textContent = result?.summary || 'Order recorded.';
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
        if (eventQueue.length > 0) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
      });
    };
    document.getElementById('btn-joint-plan-yes').addEventListener('click', () => finish('yes'));
    document.getElementById('btn-joint-plan-no').addEventListener('click', () => finish('no'));
    document.getElementById('event-modal').classList.remove('hidden');
    return;
  }
  if (event.type === 'diplomat_posted') {
    document.getElementById('event-title').textContent = 'Envoy reaches a foreign court';
    document.getElementById('event-body').textContent = `${event.diplomat.name} has reached the assigned court and begun building local familiarity. Reports will be imperfect and periodic, not omniscient.`;
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'diplomat_returned') {
    document.getElementById('event-title').textContent = 'Envoy returns';
    document.getElementById('event-body').textContent = `${event.diplomat.name} has returned home and is available for reassignment.`;
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'diplomat_detained') {
    document.getElementById('event-title').textContent = 'Envoy detained';
    document.getElementById('event-body').textContent = `${event.diplomat.name} has been detained by the foreign court. Their reporting and delegated authority are unavailable while held.`;
    wireEventContinue(clock, eventQueue); return;
  }
  if (['forged_letter_detected','forged_letter_believed'].includes(event.type)) {
    document.getElementById('event-title').textContent = event.type === 'forged_letter_detected' ? 'Suspected forged letter' : 'Intelligence from a diplomatic letter';
    document.getElementById('event-body').textContent = event.type === 'forged_letter_detected'
      ? 'Our officials found inconsistencies in a letter presented as genuine. The alleged sender may have been impersonated.'
      : 'A letter has been accepted as probably genuine. Its operational claims remain intelligence, not certainty.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'campaign_arrived') {
    document.getElementById('event-title').textContent = `Campaign reaches ${event.defenderName}`;
    document.getElementById('event-body').textContent = `${event.attackerName}'s army has completed its march and begun applying military pressure to ${event.defenderName}. Open the Marshal's conflict report to follow the fighting or issue orders.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'campaign_decided') {
    const outcomes = {
      withdrawn: 'The attacker has ordered a withdrawal.',
      attacker_broke: 'Losses, poor supply and failing morale have broken the attacking army.',
      punitive_success: 'The punitive expedition has inflicted its intended damage and is withdrawing.',
      submission_pending: `${event.defenderName} has surrendered militarily; the political settlement is unresolved.`,
      capital_lost: `${event.defenderName} has fallen, but the ruling faction has retreated to surviving territory.`,
      region_lost: `${event.defenderName} has been occupied while the defending polity survives elsewhere.`,
      submission: `${event.defenderName} has surrendered and a political settlement has been reached.`,
      liberated: `${event.defenderName} has been liberated and restored to the recognised claimant government.`,
      liberation_failed: `The attempted liberation of ${event.defenderName} failed to produce a viable restoration.`,
      devastated: `${event.defenderName} has been devastated. The surviving attackers are withdrawing.`,
    };
    document.getElementById('event-title').textContent = `Campaign decided: ${event.defenderName}`;
    document.getElementById('event-body').textContent = `${outcomes[event.campaign.outcome] || 'The campaign has ended.'} Attacker losses: ${Math.round(event.campaign.attackerCasualties).toLocaleString()}. Defender military losses: ${Math.round(event.campaign.defenderCasualties).toLocaleString()}. Civilian deaths: ${Math.round(event.campaign.civilianDeaths).toLocaleString()}.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'campaign_returned') {
    document.getElementById('event-title').textContent = `${event.attackerName}'s army returns`;
    document.getElementById('event-body').textContent = `${Math.round(event.campaign.personnel).toLocaleString()} surviving troops have returned from the campaign against ${event.defenderName}.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'agreement_ended') {
    document.getElementById('event-title').textContent = 'Agreement ended';
    document.getElementById('event-body').textContent = `The agreement between ${event.fromName} and ${event.toName} has broken down.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'kingdom_formed') {
    document.getElementById('event-title').textContent = 'A kingdom endures';
    document.getElementById('event-body').textContent = `${event.polityName} is now recognised as more than temporary dominance. Tribute, military service and royal authority have endured across regions.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'iron_smelting_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Iron smelting';
    document.getElementById('event-body').innerHTML = `
      Smiths in ${event.regionName} have learnt to smelt the plentiful local iron ore.<br><br>
      Your workshops can now produce iron and make iron tools. Bronze remains stronger,
      so smiths will use iron only when it is substantially cheaper or bronze is unavailable.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'advanced_boatbuilding_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Advanced boatbuilding';
    document.getElementById('event-body').innerHTML = `
      Shipwrights in ${event.regionName} have learnt to build larger, stronger seagoing vessels.<br><br>
      Advanced boats require wood, pitch, textiles and bronze or iron fittings. They carry more
      cargo and soldiers, travel faster and farther, improve offshore fishing and perform better in war.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'hill_fort_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Hill forts';
    document.getElementById('event-body').innerHTML = `
      Builders and warriors in ${event.regionName} have begun planning defended settlements on commanding ground.<br><br>
      A hill fort is now available through the Steward's construction interface. It still requires stone, wood,
      paid builders and many weeks of work; knowing how to build one does not create it for free.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'catapult_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Torsion catapults';
    document.getElementById('event-body').innerHTML = `
      Engineers in ${event.regionName} have learnt to store tremendous force in twisted cords and release it through a throwing arm.<br><br>
      Catapults can now be ordered through the Marshal. They are costly, but reduce fortification advantages much more effectively than battering rams.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (['water_management_breakthrough', 'shaft_mining_breakthrough', 'mine_drainage_breakthrough'].includes(event.type)) {
    const details = {
      water_management_breakthrough: ['Water management', 'Builders can now commission irrigation works and, in a large irrigated settlement, a canal.'],
      shaft_mining_breakthrough: ['Shaft mining', 'Deep mine works can now be commissioned before miners exploit buried ore.'],
      mine_drainage_breakthrough: ['Mine drainage', 'Drainage works can now extend an operational deep mine beneath the water table.'],
    }[event.type];
    document.getElementById('event-title').textContent = `Breakthrough: ${details[0]}`;
    document.getElementById('event-body').textContent = `${details[1]} Knowledge alone is not infrastructure: materials, labour, maintenance and treasury support are still required.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'construction_completed') {
    document.getElementById('event-title').textContent = `Construction complete: ${event.constructionType.name}`;
    document.getElementById('event-body').textContent = `${event.constructionType.name} has been completed in ${event.regionName}. Its builders are released back to ordinary work.`;
    wireEventContinue(clock, eventQueue);
    return;
  }

  const { attackerName, defenderName, outcome, raid } = event;
  const won = outcome.attackerRatio > 0.5;

  const knowledgeText = outcome.defenderLearnedOrigin
    ? (won
      ? `The raid also gives you some information about where ${attackerName}'s people come from.`
      : `The raid was repelled. Captives, survivors and the wreckage give you much clearer information about where ${attackerName}'s people came from.`)
    : '';

  const lootText = Object.entries(outcome.looted)
    .map(([k, v]) => `${v.toFixed(0)} ${k}`)
    .join(', ') || 'nothing of note';

  document.getElementById('event-title').textContent = `Raid: ${attackerName} vs ${defenderName}`;
  document.getElementById('event-body').innerHTML = `
    ${attackerName}'s raiders (${raid.personnel.toLocaleString()} strong) reached ${defenderName}.
    ${won ? 'The raid succeeded.' : 'The defenders held them off.'}<br><br>
    Attacker losses: ${outcome.attackerLosses.toLocaleString()}<br>
    Defender losses: ${outcome.defenderLosses.toLocaleString()}<br>
    Looted: ${lootText}${outcome.walletStolen > 0.5 ? `, ${outcome.walletStolen.toFixed(0)} household wealth` : ''}${outcome.treasuryStolen > 0.5 ? `, ${outcome.treasuryStolen.toFixed(0)} treasury wealth` : ''}<br>
    ${defenderName}'s stability fell ${(outcome.stabilityLoss * 100).toFixed(0)} points.<br>
    ${knowledgeText}
  `;

  wireEventContinue(clock, eventQueue);
}

function wireEventContinue(clock, eventQueue) {
  document.getElementById('event-options').innerHTML = '<button id="btn-event-continue">Continue</button>';
  document.getElementById('event-modal').classList.remove('hidden');
  if (event.type === 'religious_variant') {
    document.getElementById('event-title').textContent = 'A new religious branch';
    document.getElementById('event-body').textContent = `${event.religion.name} has emerged in ${event.regionName}, interpreting an older tradition in a new way.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'religious_directive') {
    document.getElementById('event-title').textContent = 'A religious directive';
    document.getElementById('event-body').textContent = `${event.leaderName || 'The religious leader'} calls for ${event.directive.type === 'holy_war' ? 'holy war against' : 'peace with'} the followers of ${event.targetFaithName || 'a rival tradition'}. Defiance may cause unrest where this is the state religion.`;
    wireEventContinue(clock, eventQueue);
    return;
  }

  document.getElementById('btn-event-continue').addEventListener('click', () => {
    document.getElementById('event-modal').classList.add('hidden');

    if (eventQueue.length > 0) {
      showNextEvent(clock, eventQueue);
    } else {
      clock.releaseAutoPause();
    }
  });
}

const RESOURCE_LABELS = { ironOre: 'iron ore', advancedNavyBoats: 'advanced navy boats',
  advancedFishingBoats: 'advanced fishing boats', boatLosses: 'boats lost', potteryBroken: 'pots broken',
  horses: 'untrained horses' };
function resourceLabel(key) {
  return RESOURCE_LABELS[key] || key;
}

const ACTIVITY_LABELS = {
  farming: 'Farming',
  gathering: 'Gathering',
  shoreFishing: 'Shore fishing',
  boatFishing: 'Boat fishing',
  lumberjack: 'Lumberjack',
  mining: 'Mining',
  smithing: 'Smithing',
  boatmaking: 'Boat-making',
  materialCrafts: 'Pitch and textiles',
  pottery: 'Pottery',
  horses: 'Horse husbandry',
};

function buildResourcesSection(region, seaRegionsById) {
  const depositLines = ['copper', 'tin', 'ironOre', 'clay', 'gold', 'stone']
    .map((key) => {
      const dep = region.deposits[key];
      if (!dep) return '';

      const tierText = dep.tiers
        .map((t) => {
          const locked = t.requiredTechId && !region.unlockedTechIds.has(t.requiredTechId);
          const pct = t.initialStock > 0 ? Math.round((100 * t.remainingStock) / t.initialStock) : 0;
          return `${t.label} ${pct}%${locked ? ' (locked)' : ''}`;
        })
        .join(', ');

      return `<div>${key === 'ironOre' ? 'iron ore' : key}: ${tierText}</div>`;
    })
    .join('');

  const forestPct = region.forest.K > 0
    ? Math.round((100 * region.forest.currentStock) / region.forest.K)
    : 0;

  const seaLines = region.adjacentSeaIds
    .map((id) => {
      const sea = seaRegionsById.get(id);
      if (!sea) return '';

      const pct = sea.fish.K > 0
        ? Math.round((100 * sea.fish.currentStock) / sea.fish.K)
        : 0;

      return `<div>${sea.name}: fish stock ${pct}%</div>`;
    })
    .join('');

  return `
    <div>Land quality: ${region.landQuality.toFixed(2)}&times; baseline</div>
    <div>Forest: ${forestPct}% of capacity</div>
    <div>Horses: ${Math.round((region.stockpile.horses || 0) + (region.horseEconomy?.draft || 0) + (region.horseEconomy?.transport || 0) + (region.horseEconomy?.war || 0)).toLocaleString()} herd / ${Math.round(region.horseEconomy?.capacity || 0).toLocaleString()} pasture capacity (${Math.round(region.horseEconomy?.draft || 0)} draught, ${Math.round(region.horseEconomy?.transport || 0)} transport, ${Math.round(region.horseEconomy?.war || 0)} war-trained)</div>
    ${depositLines}
    ${seaLines || '<div>No adjacent sea</div>'}
  `;
}

function buildReportSection(region) {
  const r = region.report;
  if (!r || Object.keys(r).length === 0) return '<div>Not yet ticked</div>';

  const lines = [];

  for (const [key, data] of Object.entries(r)) {
    if (key === 'toolWear') {
      if (data.tools > 0.05) lines.push(`<div>Wear and breakage: ${data.tools.toFixed(1)} tools lost</div>`);
      continue;
    }
    if (key === 'foodPlan') {
      if (data.importDependence > 0.005) {
        lines.push(`<div>Food strategy: plans to import ${(data.importDependence * 100).toFixed(0)}% of need</div>`);
      } else if (data.exportSurplus > 0.005) {
        lines.push(`<div>Food strategy: plans a ${(data.exportSurplus * 100).toFixed(0)}% export surplus</div>`);
      }
      continue;
    }
    if (key === 'foodStorage') {
      lines.push(`<div>Food storage: ${Math.round(data.potteryCoverage * 100)}% pottery coverage &middot; ${data.publicGranaries || 0} public granaries &middot; ${data.weeks.toFixed(1)} weeks capacity &middot; ${(data.spoilage * 100).toFixed(1)}% weekly spoilage</div>`);
      continue;
    }
    if (key === 'weather') {
      lines.push(`<div>Growing conditions: ${data.condition} &middot; season ${(data.seasonalMultiplier * 100).toFixed(0)}% &middot; weather ${(data.weatherMultiplier * 100).toFixed(0)}% &middot; combined farming potential ${(data.seasonalMultiplier * data.weatherMultiplier * 100).toFixed(0)}%</div>`);
      continue;
    }
    if (key === 'maintenance') {
      const losses = [];
      if (data.boatLosses > 0.01) losses.push(`${data.boatLosses.toFixed(2)} boats worn out`);
      if (data.potteryBroken > 0.1) losses.push(`${data.potteryBroken.toFixed(0)} pots broken`);
      if (losses.length) lines.push(`<div>Wear and breakage: ${losses.join(' &middot; ')}</div>`);
      continue;
    }
    if (key === 'stateFinance') {
      const payroll = data.payrollDue > 0
        ? `${(data.payRatio * 100).toFixed(0)}% payroll funded`
        : 'no military payroll';
      lines.push(`<div>State finance: ${data.revenue.toFixed(1)} revenue &middot; ${payroll} &middot; ${(data.readiness * 100).toFixed(0)}% military readiness &middot; ${(data.stateCapacity * 100).toFixed(0)}% administrative capacity${data.procurementSpent > 0.05 ? ` &middot; ${data.procurementSpent.toFixed(1)} arms spending` : ''}${data.deserters > 0.5 ? ` &middot; ${data.deserters.toFixed(0)} deserters` : ''}</div>`);
      continue;
    }
    if (key === 'horses') {
      lines.push(`<div>Horse husbandry: ${data.herd.toFixed(0)} horses / ${data.capacity.toFixed(0)} pasture capacity &middot; ${data.draft.toFixed(0)} draught &middot; ${data.transport.toFixed(0)} transport &middot; ${data.war.toFixed(0)} war-trained &middot; ${data.workers.toFixed(0)} breeders/trainers${data.births > 0.05 ? ` &middot; ${data.births.toFixed(1)} births` : ''}${data.deaths > 0.05 ? ` &middot; ${data.deaths.toFixed(1)} deaths` : ''}</div>`);
      continue;
    }
    if (key === 'banditry') {
      const outcomes = [];
      if (data.reintegrated > 0.5) outcomes.push(`${data.reintegrated.toFixed(0)} returned to civilian life`);
      if (data.dispersed > 0.5) outcomes.push(`${data.dispersed.toFixed(0)} dispersed`);
      if (data.starved > 0.5) outcomes.push(`${data.starved.toFixed(0)} starved`);
      if (data.foodLooted > 0.5) outcomes.push(`${data.foodLooted.toFixed(0)} food looted`);
      if (outcomes.length) lines.push(`<div>Banditry: ${outcomes.join(' &middot; ')}</div>`);
      continue;
    }
    if (!data || data.workers === 0) continue;

    const outputs = Object.entries(data)
      .filter(([k]) => k !== 'workers' && k !== 'seaName' && k !== 'advancedShare' && k !== 'ironReadiness' && k !== 'seasonalMultiplier' && k !== 'weatherMultiplier')
      .filter(([, v]) => typeof v === 'number' && v > 0.05)
      .map(([k, v]) => `${v.toFixed(k === 'bronze' || k === 'iron' ? 1 : 0)} ${resourceLabel(k)}`)
      .join(', ');

    lines.push(
      `<div>${ACTIVITY_LABELS[key] || key}: ${data.workers.toLocaleString()} workers &rarr; ${outputs || 'nothing yet'}</div>`
    );
  }

  return lines.join('') || '<div>Nobody produced anything of note this week</div>';
}

// Refreshed every tick while the sheet is open — read-only, safe to
// innerHTML-replace freely. <details> open/closed state is preserved
// manually across the refresh.
function buildContactsSection(region, regions, playerRegionId, fogOfWar) {
  const observer = regions.find((r) => r.id === playerRegionId) || region;
  if (!observer?.knowledge) return '';

  const contacts = [...observer.knowledge.entries()]
    .filter(([id, level]) => id !== observer.id && level >= KNOWLEDGE_THRESHOLDS.NAME)
    .map(([id, level]) => {
      const other = regions.find((r) => r.id === id);
      if (!other) return '';
      const stage = knowledgeStage(observer, other);
      const direction = level >= KNOWLEDGE_THRESHOLDS.DIRECTION
        ? ` — ${compassDirection(observer, other)}`
        : '';
      const stageLabel = {
        name: 'name known',
        direction: 'rough location known',
        map: 'mapped',
        resources: 'resources partly known',
        economy: 'economy partly known',
        population: 'population known',
        detailed: 'detailed knowledge',
      }[stage] || stage;
      return `<div>${other.name}${direction} — ${stageLabel}</div>`;
    })
    .filter(Boolean);

  if (contacts.length === 0) return '<details id="details-contacts"><summary>Known contacts</summary><div>No known foreign countries</div></details>';
  return `<details id="details-contacts"><summary>Known contacts</summary>${contacts.join('')}</details>`;
}

function updateRegionStats(region, seaRegionsById, fogOfWar, regions, playerRegionId) {
  const observer = regions.find((r) => r.id === playerRegionId) || region;
  const familiarity = fogOfWar.devMode || observer.id === region.id || region.controllingActorId === playerRegionId
    ? 1 : knowledgeLevel(observer, region);
  const knowsResources = familiarity >= KNOWLEDGE_THRESHOLDS.RESOURCES;
  const knowsEconomy = familiarity >= KNOWLEDGE_THRESHOLDS.ECONOMY;
  const knowsPopulation = familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION;
  const knowsDetailed = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED;
  const directionLine = observer.id !== region.id && familiarity >= KNOWLEDGE_THRESHOLDS.DIRECTION
    ? `Rough location: ${compassDirection(observer, region)}`
    : '';

  const density = densityPerKm2(region).toFixed(1);
  const culture = region.cultureGroups[0];
  const occ = region.occupations;

  const occLine = occ.farmer === undefined
    ? 'not yet ticked'
    : `farmers ${occ.farmer.toLocaleString()} &middot; gatherers ${(occ.gatherer || 0).toLocaleString()} &middot; shore fishers ${occ.shoreFisher || 0} &middot; boat fishers ${occ.boatFisher || 0} &middot; horse breeders ${occ.horseBreeder || 0} &middot; horse trainers ${occ.horseTrainer || 0} &middot; lumberjacks ${occ.lumberjack} &middot; boatmakers ${occ.boatmaker || 0} &middot; potters ${occ.potter || 0} &middot; textile workers ${occ.textileWorker || 0} &middot; pitch makers ${occ.pitchMaker || 0} &middot; miners ${occ.miner} &middot; smiths ${occ.smith} &middot; traders ${occ.trader || 0} &middot; general ${occ.general.toLocaleString()}`;

  const d = region.demographics;
  const demoLine = `${Math.round(d.children).toLocaleString()} children &middot; ${Math.round(d.workingAge).toLocaleString()} working-age &middot; ${Math.round(d.elderly).toLocaleString()} elderly`;
  const banditLine = region.banditPopulation > 10
    ? `${Math.round(region.banditPopulation).toLocaleString()} people turned to banditry`
    : 'none';

  const stock = region.stockpile;
  const stockLine = Object.keys(stock).length
    ? Object.entries(stock)
        .filter(([, v]) => v > 0.05)
        .map(([k, v]) => `${resourceLabel(k)} ${v.toFixed(k === 'bronze' || k === 'iron' ? 1 : 0)}`)
        .join(' &middot; ') || 'none yet'
    : 'none yet';

  const bronzePloughs = region.equipment.farmer?.bronze_plough || 0;
  const ironPloughs = region.equipment.farmer?.iron_plough || 0;
  const ploughs = bronzePloughs + ironPloughs;
  const farmersSupported = ploughs * 10;
  const toolLine = occ.farmer
    ? `${ploughs.toLocaleString()} plough teams support ${Math.min(farmersSupported, occ.farmer).toLocaleString()} / ${occ.farmer.toLocaleString()} farmers (${bronzePloughs.toLocaleString()} bronze, ${ironPloughs.toLocaleString()} iron; ${((Math.min(farmersSupported, occ.farmer) / occ.farmer) * 100).toFixed(0)}%)`
    : 'n/a';

  const bronzeArms = region.equipment.soldier?.bronze_weapons || 0;
  const ironArms = region.equipment.soldier?.iron_weapons || 0;
  const armyEquipped = bronzeArms + ironArms;
  const siege = region.siegeEquipment?.inventory || {};
  const rams = (siege.ram?.bronze || 0) + (siege.ram?.iron || 0);
  const catapults = (siege.catapult?.bronze || 0) + (siege.catapult?.iron || 0);
  const militaryLine = `${occ.soldier || 0} soldiers (${Math.min(armyEquipped * 2, occ.soldier || 0).toFixed(0)} equipped by ${armyEquipped.toFixed(0)} weapon sets: ${bronzeArms.toFixed(0)} bronze, ${ironArms.toFixed(0)} iron) &middot; ${Math.round(region.horseEconomy?.war || 0)} war horses &middot; ${occ.sailor || 0} sailors &middot; ${Math.round(region.navy.boats)} navy boats (${Math.round(region.navy.advancedBoats || 0)} advanced) &middot; ${Math.round(rams)} rams &middot; ${Math.round(catapults)} catapults`;

  const fishingLine = region.adjacentSeaIds.length
    ? `${Math.round(region.fishingBoats)} fishing boats (${Math.round(region.advancedFishingBoats || 0)} advanced) &middot; fishes ${region.adjacentSeaIds.join(', ')}`
    : 'landlocked — no fishing';

  const tradeEconomy = region.tradeEconomy || {};
  const creditLine = (tradeEconomy.debt || 0) > 0.05 || (tradeEconomy.creditLimit || 0) > 0.05
    ? ` &middot; debt ${(tradeEconomy.debt || 0).toFixed(0)} / ${(tradeEconomy.creditLimit || 0).toFixed(0)} limit`
    : '';
  const foodDependence = region.report?.foodPlan?.importDependence || 0;
  const tradeLine = `Recent exports ${(tradeEconomy.exportIncomeEma || 0).toFixed(0)}/week &middot; food imports ${(tradeEconomy.foodImportEma || 0).toFixed(0)} rations/week${foodDependence > 0.005 ? ` &middot; planned food dependence ${(foodDependence * 100).toFixed(0)}%` : ''}`;
  const militaryFinance = region.militaryFinance || {};
  const financeLine = `Revenue ${(militaryFinance.revenueEma || 0).toFixed(1)}/week &middot; administration ${((militaryFinance.stateCapacity ?? 1) * 100).toFixed(0)}% &middot; payroll ${((militaryFinance.payRatio ?? 1) * 100).toFixed(0)}% &middot; readiness ${((militaryFinance.readiness ?? 1) * 100).toFixed(0)}% &middot; funded force cap ${Number.isFinite(militaryFinance.fundedPersonnelCap) ? Math.round(militaryFinance.fundedPersonnelCap).toLocaleString() : 'unlimited'}${militaryFinance.arrearsWeeks > 0 ? ` &middot; ${militaryFinance.arrearsWeeks} weeks arrears` : ''}`;

  const skillLine = LEARNABLE_ACTIVITIES
    .map((activity) => `${activity} +${((skillMultiplier(region, activity) - 1) * 100).toFixed(0)}%`)
    .join(' &middot; ');

  const visibleNeighbours = region.neighbors
    .map((id) => regions.find((r) => r.id === id))
    .filter(Boolean)
    .filter((neighbour) => fogOfWar.devMode || fogOfWar.isVisible(neighbour))
    .map((neighbour) => neighbour.name);

  const neighbourLine = visibleNeighbours.length
    ? visibleNeighbours.join(', ')
    : 'none known';

  const detailsOpen = {};
  document.querySelectorAll('#region-details details').forEach((d) => {
    detailsOpen[d.id] = d.open;
  });

  document.getElementById('region-details').innerHTML = `
    <div>${knowsPopulation ? `Population: ${region.population.toLocaleString()} (${density}/km&sup2;)` : 'Population: unknown'}</div>
    <div>${knowsPopulation ? `Age bands: ${demoLine}` : 'Age bands: unknown'}</div>
    ${directionLine ? `<div>${directionLine}</div>` : ''}
    <div>${knowsEconomy ? `Stability: ${(region.stability * 100).toFixed(0)}% &middot; Safety: ${(region.safetyRating * 100).toFixed(0)}%` : 'Political/economic condition: unknown'}</div>
    ${knowsDetailed ? `<div>Banditry: ${banditLine}</div><div>Military: ${militaryLine}</div>` : '<div>Military strength: unknown</div>'}
    ${knowsResources ? `<div>Fishing: ${fishingLine}</div>` : '<div>Fishing activity: unknown</div>'}
    ${knowsDetailed ? `<div>Skill (learning by doing): ${skillLine}</div>` : ''}
    ${knowsDetailed ? `<div>Iron smelting: ${region.unlockedTechIds.has(IRON_SMELTING_TECH_ID) ? `discovered &middot; industry ${(region.ironWorkingReadiness * 100).toFixed(0)}% established` : 'not yet discovered'}</div>` : ''}
    ${knowsDetailed ? `<div>Advanced boatbuilding: ${region.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID) ? 'discovered' : 'not yet discovered'}</div>` : ''}
    ${knowsDetailed ? `<div>Torsion catapults: ${region.unlockedTechIds.has(CATAPULT_TECH_ID) ? 'discovered' : 'not yet discovered'}</div>` : ''}
    ${knowsEconomy ? `<div>Wealth: ${region.wallet.toFixed(0)} populace &middot; ${region.treasury.toFixed(0)} treasury${creditLine}</div><div>State: ${financeLine}</div><div>Trade: ${tradeLine}</div>` : '<div>Wealth: unknown</div>'}
    ${knowsDetailed ? `<div>Tools: ${toolLine}</div><div>Culture: ${culture.cultureId} &middot; identity strength ${(culture.identityStrength * 100).toFixed(0)}%</div>` : ''}
    <div>Neighbours: ${neighbourLine}</div>
    <div>Government: ${governanceLabel(region)}${region.governance?.relationship !== 'core' ? ` &middot; administrative control ${(region.governance.administrativeControl * 100).toFixed(0)}% &middot; reports delayed ${region.governance.reportDelayWeeks} weeks` : ''}</div>
    ${observer.id === region.id && region.scouting?.active ? `<div>Scouting: ${region.scouting.mode} expedition away until about week ${Math.round(region.scouting.completeTick)}</div>` : ''}
    ${buildContactsSection(region, regions, playerRegionId, fogOfWar)}
    ${knowsResources ? `<details id="details-resources"><summary>Resources</summary>${buildResourcesSection(region, seaRegionsById)}</details>` : '<div>Resources: only broad rumours</div>'}
    ${knowsEconomy ? `<details id="details-report"><summary>Economy report (this week)</summary>${buildReportSection(region)}</details><details id="details-occupations"><summary>Working as</summary><div>${occLine}</div></details><details id="details-stockpile"><summary>Stockpile</summary><div>${stockLine}</div></details>` : '<div>Economic activity: little known</div>'}
  `;

  Object.entries(detailsOpen).forEach(([id, open]) => {
    const el = document.getElementById(id);
    if (el) el.open = open;
  });
}

main().catch((err) => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<pre style="color:#e8e1cf;padding:20px;">Failed to load: ${err.message}\n\nIf you opened this file directly (file://), that's why — fetch() of local JSON needs a real server. Run: python3 -m http.server, then open localhost.</pre>`;
});
