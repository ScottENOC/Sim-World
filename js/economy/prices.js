// No full market yet, so this isn't a cleared price — it's a scarcity proxy:
// price falls smoothly as a region's own stock of something rises, and
// never quite hits zero or blows up. Good enough to make trade flow from
// abundant regions to scarce ones, which is all that's needed right now.

const BASE_PRICE = {
  food: 1, wood: 0.5, stone: 0.3,
  copper: 2, tin: 4, ironOre: 0.7, gold: 15, bronze: 6, iron: 3.5,
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
  const stock = Math.max(0, region.stockpile[resource] || 0);
  return base * (ref / (stock + ref));
}

export const TRADABLE_RESOURCES = Object.keys(BASE_PRICE);
