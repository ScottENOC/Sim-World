// Extraction rate *within* a single accessible tier. Harder to pull out the
// more has already been taken from THIS tier — `difficulty` controls how
// steeply that bites (a shallow, uniform seam barely slows down; a band that
// gets genuinely harder to work throttles fast). This never reaches into a
// deeper tier on its own — that requires a tech unlock, handled by
// selectActiveTier below, not by this formula getting "hard enough."
// The static endowment file expresses relative geology. Calibration scales
// accessible tin here so the same map data can support an approximately
// eighty-year prosperous bronze economy before its shallow supply fails.
export const SURFACE_TIN_STOCK_MULTIPLIER = 5.5;
export const SURFACE_COPPER_STOCK_MULTIPLIER = 2;

export function initialiseDeposit(resourceKey, deposit) {
  return {
    tiers: deposit.tiers.map((tier, index) => {
      const stockMultiplier = index === 0
        ? resourceKey === 'tin'
          ? SURFACE_TIN_STOCK_MULTIPLIER
          : resourceKey === 'copper'
            ? SURFACE_COPPER_STOCK_MULTIPLIER
            : 1
        : 1;
      const initialStock = tier.initialStock * stockMultiplier;
      return { ...tier, initialStock, remainingStock: initialStock };
    }),
  };
}

export function extractionRate({
  initialStock,
  remainingStock,
  workers,
  baseYieldPerWorker,
  difficulty,
  techMultiplier = 1,
}) {
  if (remainingStock <= 0 || initialStock <= 0 || workers <= 0) return 0;
  const depletionFactor = Math.pow(remainingStock / initialStock, difficulty);
  const potential = workers * baseYieldPerWorker * techMultiplier * depletionFactor;
  return Math.min(potential, remainingStock);
}

// A deposit is a list of tiers, ordered shallowest-first. This picks the
// shallowest tier that's both tech-accessible AND not yet exhausted — the
// "hard stop gate" from the design: a region can't reach into `deep` mining
// just because `surface` ran out, no matter how much labor it throws at it,
// until it actually has mine_drainage. Returns null if every accessible
// tier is empty (genuinely nothing more to get without new tech).
export function selectActiveTier(tiers, unlockedTechIds) {
  for (const tier of tiers) {
    const accessible = tier.requiredTechId === null || unlockedTechIds.has(tier.requiredTechId);
    if (accessible && tier.remainingStock > 0) return tier;
  }
  return null;
}
