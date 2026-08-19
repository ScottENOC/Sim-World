// Bronze Age population isn't pulled from a real dataset (there isn't a
// clean one) — it's a placeholder density model until the climate/crop-yield
// system exists to derive carrying capacity properly. Swap BASE_DENSITY and
// HABITABILITY for real numbers once world/climate.js and the resource
// system land; nothing downstream needs to change, they just read
// region.population.

const BASE_DENSITY_PER_KM2 = 3; // rough Bronze Age agrarian average

// Placeholder habitability multipliers — rough stand-ins for "how much of
// this land was good farmland vs. highland/bog" until real terrain/climate
// data drives this instead.
const HABITABILITY = {
  england: 1.3,
  scotland: 0.5,
  wales: 0.6,
  n_ireland: 0.7,
  ireland: 0.8,
  france: 1.4,
};

const STARTING_IDENTITY_STRENGTH = 0.3; // low: young, easily-assimilated cultures

export function seedCensus(regions, rng = Math.random) {
  for (const region of regions) {
    const habitability = HABITABILITY[region.id] ?? 1.0;
    // +/-15% region-to-region noise so it doesn't look like a formula.
    const noise = 0.85 + rng() * 0.3;
    const density = BASE_DENSITY_PER_KM2 * habitability * noise;

    region.population = Math.round(region.areaSqKm * density);

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
