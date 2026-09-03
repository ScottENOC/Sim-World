// Bronze Age population isn't pulled from a real dataset (there isn't a
// clean one) — it's a placeholder density model until it's derived from
// the economy system's actual food output instead of assumed up front.
// Uses region.landQuality (loaded from resources.initial.json) so
// population density and farm yield are driven by the same underlying
// "how good is this land" number rather than two independent guesses.

const BASE_DENSITY_PER_KM2 = 3; // rough Bronze Age agrarian average
const STARTING_IDENTITY_STRENGTH = 0.3; // low: young, easily-assimilated cultures

export function seedCensus(regions, rng = Math.random) {
  for (const region of regions) {
    // +/-15% region-to-region noise so it doesn't look like a bare formula.
    const noise = 0.85 + rng() * 0.3;
    const density = BASE_DENSITY_PER_KM2 * region.landQuality * noise;

    region.population = Math.round(region.areaSqKm * density);

    // Pre-modern age structure: young-heavy pyramid, not the roughly-even
    // bands a modern population has — high birth rate and high mortality
    // both push the distribution toward children. Placeholder proportions,
    // not sourced from anything region-specific.
    region.demographics = {
      children: Math.round(region.population * 0.35),
      workingAge: Math.round(region.population * 0.55),
      elderly: Math.round(region.population * 0.10),
    };
    region.population = region.demographics.children + region.demographics.workingAge + region.demographics.elderly;

    // Small seed values representing informal accumulated trade value —
    // there's no production of currency yet (that's taxation, still
    // future), so these are placeholders scaled to population, not derived
    // from anything region-specific.
    // Several months of portable household/merchant wealth provide enough
    // liquidity for trade to specialise before the first shock. This is cash,
    // not credit: borrowing remains capped far below this in trade.js.
    region.wallet = region.population * 0.05;
    region.treasury = region.population * 0.002;

    region.cultureGroups = [
      {
        id: `${region.id}_culture`,
        ancestryId: `${region.id}_ancestry`,
        cultureId: `${region.id}_culture`,
        religionId: `${region.id}_religion`,
        share: 1.0,
        identityStrength: STARTING_IDENTITY_STRENGTH,
      },
    ];
  }
  return regions;
}

export function densityPerKm2(region) {
  return region.population / region.areaSqKm;
}
