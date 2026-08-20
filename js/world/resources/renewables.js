// Logistic regrowth: dS/dt = r*S*(1 - S/K). Slow near zero (nothing to seed
// from), slow again near the carrying capacity K (fully forested land can't
// get more forested), fastest in between. One equation, both constraints.
export function regrow({ currentStock, K, rate }) {
  if (K <= 0) return currentStock;
  const growth = rate * currentStock * (1 - currentStock / K);
  return clamp(currentStock + growth, 0, K);
}

// Small extra growth pressure from well-forested neighbours, proportional to
// how forested *they* are (not how forested we are) — this is the
// cross-border spread from the design. Caller supplies the neighbours'
// current stock/K since this module only knows about one region at a time.
export function neighborSpreadBonus({ neighborStocks, neighborKs, spreadRate }) {
  let bonus = 0;
  for (let i = 0; i < neighborStocks.length; i++) {
    const neighborFraction = neighborKs[i] > 0 ? neighborStocks[i] / neighborKs[i] : 0;
    bonus += spreadRate * neighborFraction;
  }
  return bonus;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
