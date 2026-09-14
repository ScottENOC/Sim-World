import { changeAttitude } from '../diplomacy/relations.js?v=20260914-water1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const positive = (v) => Math.max(0, Number(v) || 0);

let activeHydrologyGraph = null;

function assets(region) {
  return (region?.construction?.assets || []).filter((asset) => (asset.condition ?? 1) > 0.2);
}

function hasAsset(region, typeId) {
  return assets(region).some((asset) => asset.typeId === typeId);
}

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;
}

function latitudeOf(region) {
  return Number(region?.centroid?.[1]) || 0;
}

function seasonalRunoffMultiplier(region, river, currentDay = 0) {
  const latitude = latitudeOf(region);
  const variability = clamp(river?.navigation?.flowVariability ?? 0.25, 0, 0.9);
  const phaseShift = latitude < 0 ? Math.PI : 0;
  const season = Math.sin((2 * Math.PI * (Number(currentDay) || 0)) / DAYS_PER_YEAR + phaseShift);
  const weatherYield = Number(region?.weather?.yieldMultiplier);
  const weather = Number.isFinite(weatherYield) ? clamp(weatherYield, 0.35, 1.65) : 1;
  // Hooks for future climate work: climate.rainfallMultiplier and
  // climate.evaporationMultiplier can be changed by a climate model without
  // changing the river-routing algorithm.
  const rainfall = clamp(region?.climate?.rainfallMultiplier ?? 1, 0.05, 3);
  const evaporation = clamp(region?.climate?.evaporationMultiplier ?? 1, 0.1, 3);
  const seasonal = 1 + season * variability * 0.45;
  return clamp(seasonal * weather * rainfall / Math.sqrt(evaporation), 0.05, 3);
}

export function ensureRegionalHydrology(region) {
  if (!region.hydrology || typeof region.hydrology !== 'object') region.hydrology = {};
  const h = region.hydrology;
  if (!h.groundwater || typeof h.groundwater !== 'object') h.groundwater = {};
  if (!Number.isFinite(h.groundwater.storage)) h.groundwater.storage = 1;
  if (!Number.isFinite(h.groundwater.rechargeMultiplier)) h.groundwater.rechargeMultiplier = 1;
  if (!Number.isFinite(h.groundwater.withdrawal)) h.groundwater.withdrawal = 0;
  if (!Number.isFinite(h.waterImpactAwareness)) h.waterImpactAwareness = 0;
  if (!h.report || typeof h.report !== 'object') h.report = {};
  if (!region.waterPolicy || typeof region.waterPolicy !== 'object') region.waterPolicy = {};
  if (!region.waterPolicy.operatingPriority) region.waterPolicy.operatingPriority = 'balanced';
  if (!Number.isFinite(region.waterPolicy.surfaceWithdrawalIntensity)) region.waterPolicy.surfaceWithdrawalIntensity = 0.5;
  if (!Number.isFinite(region.waterPolicy.targetReservoirFill)) region.waterPolicy.targetReservoirFill = 0.55;
  if (!Number.isFinite(region.waterPolicy.targetDownstreamFlow)) region.waterPolicy.targetDownstreamFlow = 0.82;
  return h;
}

export function setWaterPolicy(region, patch = {}) {
  ensureRegionalHydrology(region);
  const allowed = ['surfaceWithdrawalIntensity','targetReservoirFill','targetDownstreamFlow','wastewaterTreatment','agriculturalRunoffControl','industrialDischargeControl'];
  for (const key of allowed) if (patch[key] !== undefined) region.waterPolicy[key] = clamp(patch[key]);
  return region.waterPolicy;
}

export function setWaterOperatingPriority(region, priority = 'balanced') {
  ensureRegionalHydrology(region);
  const profiles = {
    balanced: { targetReservoirFill: 0.55, targetDownstreamFlow: 0.82 },
    irrigation: { targetReservoirFill: 0.72, targetDownstreamFlow: 0.62 },
    flood_control: { targetReservoirFill: 0.35, targetDownstreamFlow: 0.86 },
    downstream: { targetReservoirFill: 0.48, targetDownstreamFlow: 1.0 },
    hydropower: { targetReservoirFill: 0.62, targetDownstreamFlow: 0.92 },
  };
  const selected = profiles[priority] || profiles.balanced;
  region.waterPolicy.operatingPriority = profiles[priority] ? priority : 'balanced';
  Object.assign(region.waterPolicy, selected);
  return region.waterPolicy;
}

function waterEngineering(region) {
  const irrigation = hasAsset(region, 'irrigation') ? 1 : 0;
  const canal = hasAsset(region, 'canal') ? 1 : 0;
  const dam = hasAsset(region, 'reservoir_dam') ? 1 : 0;
  const weir = hasAsset(region, 'river_weir') ? 1 : 0;
  return { irrigation, canal, dam, weir };
}

function withdrawalFraction(region) {
  const { irrigation, canal } = waterEngineering(region);
  const policy = clamp(region?.waterPolicy?.surfaceWithdrawalIntensity ?? 0.5);
  // Early irrigation matters locally but cannot normally empty a major river.
  return clamp((irrigation * 0.035 + canal * 0.025) * (0.35 + policy * 1.3), 0, 0.16);
}

function reservoirCapacity(region, naturalFlow) {
  const { dam, weir } = waterEngineering(region);
  const explicit = positive(region?.waterPolicy?.reservoirCapacity);
  if (explicit > 0) return explicit;
  return naturalFlow * (dam * 1.8 + weir * 0.22);
}

function ensureRiverStore(region, riverId) {
  const h = ensureRegionalHydrology(region);
  if (!h.riverStorage || typeof h.riverStorage !== 'object') h.riverStorage = {};
  if (!h.riverStorage[riverId]) h.riverStorage[riverId] = { stored: 0 };
  return h.riverStorage[riverId];
}

function regulateFlow(region, river, inflow, naturalFlow, elapsedDays) {
  const { dam, weir } = waterEngineering(region);
  const capacity = reservoirCapacity(region, naturalFlow);
  if (!(capacity > 0) || (!dam && !weir)) return { outflow: inflow, stored: 0, storageChange: 0 };
  const store = ensureRiverStore(region, river.id);
  const oldStored = clamp(store.stored, 0, capacity);
  const targetStorage = capacity * clamp(region?.waterPolicy?.targetReservoirFill ?? 0.55);
  const targetReleaseFlow = naturalFlow * clamp(region?.waterPolicy?.targetDownstreamFlow ?? 0.82, 0.15, 1.5);
  const dayScale = Math.max(0.01, positive(elapsedDays) / 30);
  let stored = oldStored;
  let outflow = inflow;

  const priority = region?.waterPolicy?.operatingPriority || 'balanced';
  const isFloodPulse = inflow > naturalFlow * 1.18;
  // Ordinary operation aims for the chosen target fill. Flood-control operation
  // deliberately preserves empty capacity, but may use that spare capacity when
  // a real high-flow pulse arrives. This makes timing matter even when annual
  // inflow and outflow are almost equal.
  const desiredCeiling = isFloodPulse && priority === 'flood_control' ? capacity : targetStorage;
  if (inflow > targetReleaseFlow && stored < desiredCeiling) {
    const capture = Math.min(inflow - targetReleaseFlow, (desiredCeiling - stored) / dayScale);
    outflow -= capture;
    stored += capture * dayScale;
  } else if ((inflow < targetReleaseFlow || stored > targetStorage) && stored > 0) {
    const releaseForFlow = Math.max(0, targetReleaseFlow - inflow);
    const releaseForLevel = Math.max(0, stored - targetStorage) / dayScale;
    const release = Math.min(Math.max(releaseForFlow, releaseForLevel), stored / dayScale);
    outflow += release;
    stored -= release * dayScale;
  }
  store.stored = clamp(stored, 0, capacity);
  const storageChange = store.stored - oldStored;
  const floodPeakReduction = inflow > naturalFlow ? clamp(Math.max(0, inflow - outflow) / Math.max(0.05, inflow)) : 0;
  const hasHydroTech = region?.unlockedTechIds?.has?.('hydroelectric_power') || region?.unlockedTechIds?.has?.('electrical_generation');
  const hydroPriority = region?.waterPolicy?.operatingPriority === 'hydropower' ? 1 : 0.65;
  const hydropowerPotential = dam && hasHydroTech ? Math.max(0, outflow) * Math.sqrt(Math.max(0, store.stored) / Math.max(0.05, capacity)) * hydroPriority : 0;
  return { outflow: Math.max(0, outflow), stored: store.stored, storageChange, floodPeakReduction, hydropowerPotential };
}

function pollutionSources(region, elapsedDays) {
  const monthScale = Math.max(0.01, positive(elapsedDays) / 30);
  const population = positive(region?.population);
  const farmers = positive(region?.report?.farming?.workers);
  const drainage = hasAsset(region, 'urban_drainage');
  const wastewaterTreatment = clamp(region?.waterPolicy?.wastewaterTreatment ?? 0);
  const farmControls = clamp(region?.waterPolicy?.agriculturalRunoffControl ?? 0);
  const industrialControls = clamp(region?.waterPolicy?.industrialDischargeControl ?? 0);

  const sewageControl = clamp((drainage ? 0.12 : 0) + wastewaterTreatment * 0.86);
  const pathogen = population * 0.0000022 * (1 - sewageControl) * monthScale;
  const nutrients = farmers * 0.0000014 * (1 - farmControls * 0.82) * monthScale;
  // Industry systems can set industrialChemicalDischarge directly. Keeping this
  // as a hook avoids inventing factories before the industrial era exists.
  const chemicals = positive(region?.industrialChemicalDischarge) * (1 - industrialControls * 0.92) * monthScale;
  return { pathogen, nutrients, chemicals };
}

function addPollution(a, b) {
  return {
    pathogen: positive(a?.pathogen) + positive(b?.pathogen),
    nutrients: positive(a?.nutrients) + positive(b?.nutrients),
    chemicals: positive(a?.chemicals) + positive(b?.chemicals),
  };
}

function decayPollution(load, elapsedDays) {
  const days = positive(elapsedDays);
  return {
    pathogen: positive(load?.pathogen) * Math.pow(0.5, days / 18),
    nutrients: positive(load?.nutrients) * Math.pow(0.5, days / 120),
    chemicals: positive(load?.chemicals) * Math.pow(0.5, days / 720),
  };
}

function concentration(load, flow) {
  const dilution = Math.max(0.08, positive(flow));
  return {
    pathogen: positive(load?.pathogen) / dilution,
    nutrients: positive(load?.nutrients) / dilution,
    chemicals: positive(load?.chemicals) / dilution,
  };
}

function healthRisk(c) {
  return clamp(c.pathogen * 4.8 + c.nutrients * 0.35 + c.chemicals * 2.6, 0, 1);
}

function awareness(region, harm) {
  const h = ensureRegionalHydrology(region);
  const technical = region?.unlockedTechIds?.has?.('water_management') ? 0.35 : 0;
  const advanced = region?.unlockedTechIds?.has?.('hydraulic_engineering') ? 0.25 : 0;
  const recognisedDisease = Object.values(region?.disease?.pathogens || {}).some((p) => p?.recognised) ? 0.15 : 0;
  h.waterImpactAwareness = clamp(h.waterImpactAwareness + (technical + advanced + recognisedDisease + harm * 0.4) * 0.025);
  return h.waterImpactAwareness;
}

function applyDiplomaticExternality(victim, source, severity, cause, currentTick) {
  if (!victim || !source || victim.id === source.id || polityId(victim) === polityId(source)) return null;
  const known = awareness(victim, severity);
  if (known < 0.18 || severity < 0.015) return null;
  const penalty = -Math.min(0.08, severity * (0.025 + known * 0.09));
  changeAttitude(victim, source.id, penalty, cause, currentTick);
  return { type: 'water_externality', victimRegionId: victim.id, sourceRegionId: source.id, cause, severity, penalty };
}

function riverSegments(river) {
  const segments = river?.regionSegments || [];
  if (segments.length) return segments;
  return (river?.regionIds || []).map((regionId) => ({ regionId }));
}

export function initialiseHydrology(graph, regions = []) {
  activeHydrologyGraph = graph || null;
  for (const region of regions) {
    const h = ensureRegionalHydrology(region);
    h.riverIds = [];
  }
  if (!graph?.corridors) return graph;
  for (const river of graph.corridors.values()) if (river?.type === 'river') {
    if (!river.naturalHydrology) river.naturalHydrology = {
      capacity: Math.max(0.15, Number(river?.navigation?.naturalCapacity) || Number(river?.strength) || 0.35),
      geometrySource: river.geometrySource || river.source || 'procedural',
    };
    if (!river.hydrology) river.hydrology = { segments: {}, lastUpdatedDay: null };
    for (const regionId of river.regionIds || []) {
      const region = regions.find((candidate) => candidate.id === regionId);
      if (region) {
        const h = ensureRegionalHydrology(region);
        if (!h.riverIds.includes(river.id)) h.riverIds.push(river.id);
      }
    }
  }
  return graph;
}

export function activeHydrology() {
  return activeHydrologyGraph;
}

export function tickHydrology(graph, regions = [], currentDay = 0, elapsedDays = 30) {
  if (!graph?.corridors) return [];
  const byId = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const region of regions) {
    const h = ensureRegionalHydrology(region);
    h.report = { surfaceInflow: 0, surfaceOutflow: 0, surfaceWithdrawal: 0, waterHealthRisk: 0, riverCount: 0, floodPeakReduction: 0, hydropowerPotential: 0 };
  }

  for (const river of graph.corridors.values()) {
    if (river?.type !== 'river') continue;
    const segments = riverSegments(river);
    if (!segments.length) continue;
    const naturalCapacity = Math.max(0.15, Number(river?.naturalHydrology?.capacity) || Number(river?.navigation?.naturalCapacity) || Number(river?.strength) || 0.35);
    let upstreamFlow = 0;
    let pollution = { pathogen: 0, nutrients: 0, chemicals: 0 };
    let previousRegion = null;
    let flowSum = 0;
    let minFlowRatio = Infinity;
    river.hydrology = river.hydrology || { segments: {} };
    river.hydrology.segments = {};

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const region = byId.get(segment.regionId);
      if (!region) continue;
      const runoff = seasonalRunoffMultiplier(region, river, currentDay);
      const localNatural = naturalCapacity * (0.55 + (i + 1) / segments.length * 0.75) * runoff;
      const naturalInflow = upstreamFlow + localNatural;
      const withdrawal = naturalInflow * withdrawalFraction(region);
      const afterWithdrawal = Math.max(0, naturalInflow - withdrawal);
      const regulated = regulateFlow(region, river, afterWithdrawal, localNatural, elapsedDays);
      const outflow = regulated.outflow;

      pollution = decayPollution(pollution, elapsedDays / Math.max(1, segments.length));
      pollution = addPollution(pollution, pollutionSources(region, elapsedDays));
      const c = concentration(pollution, outflow);
      const risk = healthRisk(c);
      const flowRatio = outflow / Math.max(0.05, naturalInflow);
      const h = ensureRegionalHydrology(region);
      h.report.surfaceInflow += naturalInflow;
      h.report.surfaceOutflow += outflow;
      h.report.surfaceWithdrawal += withdrawal;
      h.report.managedRelease += Math.max(0, -regulated.storageChange);
      h.report.waterHealthRisk = Math.max(h.report.waterHealthRisk, risk);
      h.report.floodPeakReduction = Math.max(h.report.floodPeakReduction, regulated.floodPeakReduction || 0);
      h.report.hydropowerPotential += regulated.hydropowerPotential || 0;
      h.report.riverCount += 1;
      h.waterHealthRisk = h.report.waterHealthRisk;
      h.waterborneDiseasePressure = clamp(risk * 0.45);

      const state = {
        regionId: region.id,
        naturalInflow,
        outflow,
        flowRatio,
        withdrawal,
        stored: regulated.stored,
        storageChange: regulated.storageChange,
        floodPeakReduction: regulated.floodPeakReduction || 0,
        hydropowerPotential: regulated.hydropowerPotential || 0,
        pollutionLoad: { ...pollution },
        concentration: c,
        waterHealthRisk: risk,
      };
      river.hydrology.segments[region.id] = state;
      flowSum += outflow;
      minFlowRatio = Math.min(minFlowRatio, flowRatio);

      if (previousRegion) {
        const quantityHarm = clamp((1 - flowRatio) * 0.7);
        const pollutionHarm = clamp(risk * 0.8);
        const upstreamSource = previousRegion;
        const quantityEvent = applyDiplomaticExternality(region, upstreamSource, quantityHarm, 'upstream_water_reduction', currentDay);
        const pollutionEvent = applyDiplomaticExternality(region, upstreamSource, pollutionHarm, 'upstream_water_pollution', currentDay);
        if (quantityEvent) events.push(quantityEvent);
        if (pollutionEvent) events.push(pollutionEvent);
      }
      previousRegion = region;
      upstreamFlow = outflow;
    }
    river.hydrology.aggregate = {
      meanOutflow: flowSum / Math.max(1, segments.length),
      minFlowRatio: Number.isFinite(minFlowRatio) ? minFlowRatio : 1,
      mouthPollution: { ...pollution },
    };
    river.hydrology.lastUpdatedDay = currentDay;
  }
  return events;
}

export function tickActiveHydrology(regions = [], currentDay = 0, elapsedDays = 30) {
  return tickHydrology(activeHydrologyGraph, regions, currentDay, elapsedDays);
}

export function riverHydrologyState(river, regionId = null) {
  if (!river?.hydrology) return null;
  if (regionId && river.hydrology.segments?.[regionId]) return river.hydrology.segments[regionId];
  return river.hydrology.aggregate || null;
}
