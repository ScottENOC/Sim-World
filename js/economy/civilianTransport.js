const finiteNonNegative = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
};

/**
 * Ensure a region has durable civilian transport state.
 *
 * Automobiles are an owned regional stock, not a proxy derived from whether a
 * region can manufacture motor vehicles. Keeping the stock separate lets
 * later systems consume vehicle production, model scrappage and constrain
 * commuting by vehicles that households actually have access to.
 */
export function ensureCivilianTransport(region) {
  if (!region || typeof region !== 'object') throw new Error('ensureCivilianTransport requires a region');
  region.civilianTransport ||= {};
  region.civilianTransport.automobiles = Math.round(finiteNonNegative(region.civilianTransport.automobiles));
  return region.civilianTransport;
}

export function automobileOwnershipPer1000(region) {
  const transport = ensureCivilianTransport(region);
  const population = finiteNonNegative(region?.population);
  if (population <= 0) return 0;
  return transport.automobiles * 1000 / population;
}

export function seedAutomobileOwnership(region, automobilesPer1000, options = {}) {
  const transport = ensureCivilianTransport(region);
  const population = finiteNonNegative(region?.population);
  const rate = finiteNonNegative(automobilesPer1000);
  const explicitExisting = Number.isFinite(Number(transport.automobiles)) && transport.automobiles > 0;
  if (explicitExisting && options.force !== true) {
    return { seeded: false, automobiles: transport.automobiles, automobilesPer1000: automobileOwnershipPer1000(region) };
  }
  transport.automobiles = Math.round(population * rate / 1000);
  if (options.source) transport.automobileOwnershipSource = String(options.source);
  return { seeded: true, automobiles: transport.automobiles, automobilesPer1000: rate };
}
