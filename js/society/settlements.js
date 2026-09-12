const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const DAYS_PER_YEAR = 365.2425;

function settlementKind(population, isPrincipal = false) {
  const pop = Math.max(0, Number(population) || 0);
  if (pop >= 12000) return 'city';
  if (pop >= 1200) return 'town';
  return isPrincipal ? 'principal_settlement' : 'village';
}

function desiredSatelliteCount(urbanPopulation) {
  const urban = Math.max(0, Number(urbanPopulation) || 0);
  if (urban >= 30000) return 4;
  if (urban >= 15000) return 3;
  if (urban >= 6000) return 2;
  if (urban >= 1500) return 1;
  return 0;
}

function ensureLifecycle(place, currentTick = 0) {
  place.status ||= 'active';
  place.foundedTick ??= currentTick;
  place.lastActiveTick ??= currentTick;
  place.destroyedTick ??= null;
  place.rebuiltTick ??= null;
  place.destroyedReason ??= null;
  place.lowPopulationYears = Math.max(0, Number(place.lowPopulationYears) || 0);
  place.population = Math.max(0, Number(place.population) || 0);
  place.urbanShare = clamp01(place.urbanShare || 0);
  place.fame = clamp01(place.fame || 0);
  return place;
}

export function ensureSettlements(region, currentTick = 0) {
  if (!region.settlements) region.settlements = { version: 2, principalId: null, nextTownOrdinal: 1, places: [] };
  region.settlements.version = Math.max(2, Number(region.settlements.version) || 0);
  if (!Array.isArray(region.settlements.places)) region.settlements.places = [];
  region.settlements.nextTownOrdinal = Math.max(1, Number(region.settlements.nextTownOrdinal) || 1);

  let principal = region.settlements.places.find((place) => place.id === region.settlements.principalId) ||
    region.settlements.places.find((place) => place.kind === 'principal' || place.isPrincipal);
  if (!principal) {
    principal = {
      id: `${region.id}:principal`,
      name: region.name,
      kind: 'principal_settlement',
      isPrincipal: true,
      population: 0,
      urbanShare: 0,
      fame: 0,
      foundedAsMajorSettlement: false,
      status: 'active',
      foundedTick: currentTick,
    };
    region.settlements.places.push(principal);
  }
  principal.isPrincipal = true;
  ensureLifecycle(principal, currentTick);
  region.settlements.principalId = principal.id;

  // Migrate the older subregional town nodes into the authoritative settlement
  // ledger. Their IDs are retained so existing saves, occupations and spatial
  // sites continue to refer to the same physical place.
  for (const node of region.subregionalControl?.places || []) {
    if (!['town', 'city'].includes(node.kind) || node.id === principal.id) continue;
    if (region.settlements.places.some((place) => place.id === node.id)) continue;
    region.settlements.places.push(ensureLifecycle({
      id: node.id,
      name: node.name,
      kind: node.kind,
      isPrincipal: false,
      population: node.population || 0,
      urbanShare: 0,
      fame: 0,
      foundedAsMajorSettlement: (node.population || 0) >= 5000,
      status: 'active',
      foundedTick: node.foundedTick ?? currentTick,
      location: node.location,
      spatialSiteId: node.spatialSiteId,
    }, currentTick));
    const match = String(node.id).match(/:town:(\d+)$/);
    if (match) region.settlements.nextTownOrdinal = Math.max(region.settlements.nextTownOrdinal, Number(match[1]) + 1);
  }

  for (const place of region.settlements.places) ensureLifecycle(place, currentTick);
  return region.settlements;
}

export function principalSettlement(region) {
  const settlements = ensureSettlements(region);
  return settlements.places.find((place) => place.id === settlements.principalId) || settlements.places[0];
}

export function activeSettlements(region) {
  return ensureSettlements(region).places.filter((place) => place.status === 'active');
}

function createSatellite(region, currentTick) {
  const settlements = ensureSettlements(region, currentTick);
  const ordinal = settlements.nextTownOrdinal++;
  const place = ensureLifecycle({
    id: `${region.id}:town:${ordinal}`,
    name: `${region.name} town ${ordinal}`,
    kind: 'village',
    isPrincipal: false,
    population: 0,
    urbanShare: 0,
    fame: 0,
    foundedAsMajorSettlement: false,
    status: 'active',
    foundedTick: currentTick,
  }, currentTick);
  settlements.places.push(place);
  return place;
}

function reactivateSettlement(place, currentTick) {
  place.status = 'active';
  place.rebuiltTick = currentTick;
  place.destroyedReason = null;
  place.lowPopulationYears = 0;
  place.lastActiveTick = currentTick;
}

export function recordSettlementDestruction(region, settlementId, currentTick, reason = 'war') {
  const place = ensureSettlements(region, currentTick).places.find((candidate) => candidate.id === settlementId);
  if (!place) return null;
  place.status = 'ruined';
  place.destroyedTick = currentTick;
  place.destroyedReason = reason;
  place.population = Math.floor((place.population || 0) * (place.isPrincipal ? 0.12 : 0.06));
  place.urbanShare = 0;
  return place;
}

function updateFame(region, place, urbanPopulation) {
  const tradeReach = Math.log1p(region.tradePartnerIds?.size || 0) / Math.log(12);
  const monumental = (region.construction?.assets || []).filter((asset) =>
    ['monumental_tomb', 'great_temple', 'ceremonial_complex', 'monumental_statue'].includes(asset.typeId) &&
    (asset.condition ?? 1) > 0.35).length;
  const artFame = Math.max(0, region.culturalLife?.reputation || 0);
  const scaleSignal = clamp01(Math.log1p(place.population || 0) / Math.log(50000));
  const principalBonus = place.isPrincipal ? 0.06 : 0;
  place.fame = clamp01(scaleSignal * 0.28 + Math.min(0.24, monumental * 0.045) +
    clamp01(tradeReach) * 0.18 + clamp01(artFame) * 0.24 + principalBonus);
  place.urbanShare = clamp01((place.population || 0) / Math.max(1, urbanPopulation));
}

export function tickSettlements(region, currentTick = 0, elapsedDays = 30, rng = Math.random) {
  const settlements = ensureSettlements(region, currentTick);
  const principal = principalSettlement(region);
  const urbanPopulation = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  const desired = desiredSatelliteCount(urbanPopulation);
  const satellites = settlements.places.filter((place) => !place.isPrincipal);

  // Rebuild historical settlements before founding replacements. The identity
  // and coordinates of a ruined/abandoned place survive its period of decline.
  for (let i = 0; i < desired; i++) {
    let place = satellites[i];
    if (!place) {
      place = createSatellite(region, currentTick);
      satellites.push(place);
    } else if (place.status !== 'active' && (region.conflictPressure || 0) < 0.65) {
      reactivateSettlement(place, currentTick);
    }
  }

  const activeSatellites = satellites.filter((place, index) => place.status === 'active' && index < desired);
  if (principal.status !== 'active' && urbanPopulation >= 250 && (region.conflictPressure || 0) < 0.7) {
    reactivateSettlement(principal, currentTick);
  }

  const principalWeight = activeSatellites.length ? 0.58 : 1;
  const satelliteWeights = activeSatellites.map((_, index) => Math.max(0.08, 0.22 - index * 0.035));
  const satelliteTotal = satelliteWeights.reduce((sum, weight) => sum + weight, 0);
  const satellitePool = urbanPopulation * (1 - principalWeight);
  principal.population = principal.status === 'active' ? Math.round(urbanPopulation * principalWeight) : principal.population;

  activeSatellites.forEach((place, index) => {
    place.population = Math.round(satellitePool * satelliteWeights[index] / Math.max(0.0001, satelliteTotal));
    place.lastActiveTick = currentTick;
  });

  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  for (const place of satellites) {
    if (place.status !== 'active') continue;
    if (place.population < 80) place.lowPopulationYears += years;
    else place.lowPopulationYears = Math.max(0, place.lowPopulationYears - years * 0.5);
    if (place.lowPopulationYears >= 5 && satellites.indexOf(place) >= desired) {
      place.status = 'abandoned';
      place.population = 0;
      place.urbanShare = 0;
    }
  }

  // Extreme prolonged conflict can physically ruin settlements, but this is
  // deliberately rare. The entity remains and may later be rebuilt in place.
  const severeConflict = clamp01(((region.conflictPressure || 0) - 0.78) / 0.22) * clamp01((0.35 - (region.stability ?? 0.7)) / 0.35);
  if (severeConflict > 0 && years > 0) {
    for (const place of settlements.places.filter((candidate) => candidate.status === 'active')) {
      const annualRisk = (place.isPrincipal ? 0.035 : 0.07) * severeConflict;
      if (rng() < 1 - Math.exp(-annualRisk * years)) recordSettlementDestruction(region, place.id, currentTick, 'war');
    }
  }

  for (const place of settlements.places) {
    if (place.status === 'active') {
      place.kind = settlementKind(place.population, place.isPrincipal);
      if ((place.population || 0) >= 5000) place.foundedAsMajorSettlement = true;
      place.lastActiveTick = currentTick;
      updateFame(region, place, urbanPopulation);
    } else {
      place.fame = clamp01((place.fame || 0) * Math.pow(0.985, years));
    }
  }
  return settlements;
}

export function settlementSummary(region) {
  const settlements = ensureSettlements(region);
  const principal = principalSettlement(region);
  return {
    name: principal.name,
    population: Math.round(principal.population || 0),
    fame: clamp01(principal.fame || 0),
    urbanShare: clamp01(principal.urbanShare || 0),
    activePlaces: settlements.places.filter((place) => place.status === 'active').length,
    ruinedPlaces: settlements.places.filter((place) => place.status === 'ruined').length,
    abandonedPlaces: settlements.places.filter((place) => place.status === 'abandoned').length,
  };
}
