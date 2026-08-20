// Extraction rate for a depleting deposit (copper, tin, gold, stone). Harder
// to pull out the more has already been taken — `difficulty` controls how
// steeply that bites for this particular region/resource: a shallow, uniform
// seam (low difficulty) barely slows down; a deposit that gets genuinely
// harder to reach with depth (high difficulty) throttles fast. Technology
// will later flatten this curve or unlock deeper reserve tiers — neither
// exists yet, so techMultiplier just defaults to 1.
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
