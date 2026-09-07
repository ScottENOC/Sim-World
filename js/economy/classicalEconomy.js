export function classicalTradeEfficiency(region) {
  let multiplier = 1;
  if (region.unlockedTechIds?.has('standard_weights_measures')) multiplier *= 1.08;
  if (region.unlockedTechIds?.has('coinage')) multiplier *= 1.12;
  if (region.construction?.assets?.some((a) => a.typeId === 'market_customs' && (a.condition ?? 1) > 0.35)) multiplier *= 1.05;
  return multiplier;
}

export function classicalTaxEfficiency(region) {
  let multiplier = 1;
  if (region.unlockedTechIds?.has('standard_weights_measures')) multiplier *= 1.06;
  if (region.unlockedTechIds?.has('coinage')) multiplier *= 1.10;
  if (region.unlockedTechIds?.has('relay_administration')) multiplier *= 1.08;
  return multiplier;
}
