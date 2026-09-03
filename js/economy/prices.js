// No full market yet, so this isn't a cleared price — it's a scarcity proxy:
// price falls smoothly as a region's own stock of something rises, and
// never quite hits zero or blows up. Good enough to make trade flow from
// abundant regions to scarce ones, which is all that's needed right now.

const BASE_PRICE = {
  // Metal is high-value relative to bulk food: a small specialist mine must
  // be capable of supporting a much larger food-importing population.
  food: 0.2, wood: 0.5, stone: 0.3,
  copper: 8, tin: 20, ironOre: 2, gold: 40, bronze: 60, iron: 24,
};

// Roughly "how much stock makes this feel abundant" per resource — sets the
// curve's knee, not a hard cap.
const REFERENCE_STOCK = {
  food: 50000, wood: 5000, stone: 20000,
  copper: 2000, tin: 1000, ironOre: 10000, gold: 200, bronze: 500, iron: 1500,
};

export function localPrice(region, resource) {
  const base = BASE_PRICE[resource];
  const ref = REFERENCE_STOCK[resource];
  if (base === undefined || ref === undefined) return 0;
  // Workshops bid for enough input to cover a season of planned production;
  // without this demand signal, raw ore is sprayed evenly across every
  // region and copper/tin never meet in a real smelting centre.
  const demand = Math.max(0, region.marketDemand?.[resource] || 0);
  const stock = Math.max(0, (region.stockpile[resource] || 0) - demand * 26);
  const demandPremium = 1 + Math.min(9, demand / Math.max(1, ref * 0.01));
  return base * (ref / (stock + ref)) * demandPremium;
}

export const TRADABLE_RESOURCES = Object.keys(BASE_PRICE);
