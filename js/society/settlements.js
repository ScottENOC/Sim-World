const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function ensureSettlements(region) {
  if (!region.settlements) region.settlements = { principalId: null, places: [] };
  if (!Array.isArray(region.settlements.places)) region.settlements.places = [];
  let principal = region.settlements.places.find((place) => place.id === region.settlements.principalId) ||
    region.settlements.places.find((place) => place.kind === 'principal');
  if (!principal) {
    principal = {
      id: `${region.id}:principal`,
      name: region.name,
      kind: 'principal',
      population: 0,
      urbanShare: 0,
      fame: 0,
      foundedAsMajorSettlement: false,
    };
    region.settlements.places.push(principal);
  }
  region.settlements.principalId = principal.id;
  return region.settlements;
}

export function principalSettlement(region) {
  const settlements = ensureSettlements(region);
  return settlements.places.find((place) => place.id === settlements.principalId) || settlements.places[0];
}

export function tickSettlements(region) {
  const principal = principalSettlement(region);
  const urbanPopulation = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  principal.population = urbanPopulation;
  principal.urbanShare = clamp01(urbanPopulation / Math.max(1, region.population || 1));
  if (urbanPopulation >= 5000) principal.foundedAsMajorSettlement = true;

  // Settlement fame is not a free yield. It is an observation-friendly summary
  // used by visuals/advisors and can later influence migration/tourism. Most of
  // its growth should come from actual institutions, art and trade reputation.
  const tradeReach = Math.log1p(region.tradePartnerIds?.size || 0) / Math.log(12);
  const monumental = (region.construction?.assets || []).filter((asset) =>
    ['monumental_tomb', 'great_temple', 'ceremonial_complex', 'monumental_statue'].includes(asset.typeId) &&
    (asset.condition ?? 1) > 0.35).length;
  const artFame = Math.max(0, region.culturalLife?.reputation || 0);
  const scaleSignal = clamp01(Math.log1p(urbanPopulation) / Math.log(50000));
  principal.fame = clamp01(scaleSignal * 0.28 + Math.min(0.24, monumental * 0.045) +
    clamp01(tradeReach) * 0.18 + clamp01(artFame) * 0.30);
  return principal;
}

export function settlementSummary(region) {
  const principal = principalSettlement(region);
  return {
    name: principal.name,
    population: Math.round(principal.population || 0),
    fame: clamp01(principal.fame || 0),
    urbanShare: clamp01(principal.urbanShare || 0),
  };
}
