import { TRADE_GOODS, TRADABLE_RESOURCES } from './tradeGoods.js?v=20260905-goods1';

// No full market yet, so this isn't a cleared price — it's a scarcity proxy:
// price falls smoothly as a region's own stock of something rises, and
// never quite hits zero or blows up. Manufactured goods use the same mechanism
// while they are NEW market inventory. Once commissioned/issued they leave the
// stockpile and therefore no longer participate in ordinary merchant pricing.
export function localPrice(region, resource) {
  const good = TRADE_GOODS[resource];
  if (!good) return 0;
  const base = good.basePrice;
  const ref = good.referenceStock;
  const demand = Math.max(0, region.marketDemand?.[resource] || 0);
  const stock = Math.max(0, (region.stockpile?.[resource] || 0) - demand * 26);
  const demandPremium = 1 + Math.min(9, demand / Math.max(1, ref * 0.01));
  return base * (ref / (stock + ref)) * demandPremium;
}

export { TRADABLE_RESOURCES };
