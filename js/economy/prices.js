import { TRADE_GOODS, TRADABLE_RESOURCES as BASE_TRADABLE_RESOURCES } from './tradeGoods.js?v=20260912-steel1';
import { DIET_FOOD_IDS } from './foodDiversity.js?v=20260921-food-diversity1';

const DIET_GOODS=Object.freeze({
  staple_grains:{basePrice:.28,referenceStock:12000},
  pulses:{basePrice:.52,referenceStock:5000},
  fruit_vegetables:{basePrice:.68,referenceStock:3500},
  animal_foods:{basePrice:1.15,referenceStock:1800},
});
export const TRADABLE_RESOURCES=[...BASE_TRADABLE_RESOURCES,...DIET_FOOD_IDS];

export function localPrice(region, resource) {
  const dietGood=DIET_GOODS[resource];
  const good = TRADE_GOODS[resource] || dietGood;
  if (!good) return 0;
  const base = good.basePrice;
  const ref = good.referenceStock;
  const demand = Math.max(0, region.marketDemand?.[resource] || 0);
  // Generic commodities retain the legacy half-year strategic reserve. Diet
  // baskets are weekly market availability signals, not duplicated calorie
  // reserves, so only a token buffer is removed before scarcity is observed.
  const reserveWeeks=dietGood?.25:26;
  const stock = Math.max(0, (region.stockpile?.[resource] || 0) - demand * reserveWeeks);
  const demandPremium = 1 + Math.min(9, demand / Math.max(1, ref * 0.01));
  return base * (ref / (stock + ref)) * demandPremium;
}
