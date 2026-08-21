// Tools aren't a single "development score" — each occupation tracks a
// count of actual tool instances of a given tier ("8,000 farmers have a
// bronze plough"). The first N workers in that occupation get the
// productivity bonus; the rest work at baseline until more tools exist.
// Multiple tiers are supported (bronze plough -> iron plough -> tractor)
// even though only one tier is reachable right now — this is what that
// structure is for.

const MAX_ADOPTION_RATE_PER_WEEK = 0.02; // at most 2% of an occupation newly equipped per week

// Highest-capability tier this region's tech can currently use. Tiers are
// listed worst-to-best, opposite of the ore deposit tiers (which are
// shallowest-first) — for tools we want the BEST unlocked one, not the
// first accessible one.
function bestAvailableTier(tiers, unlockedTechIds) {
  let best = null;
  for (const tier of tiers) {
    if (tier.requiredTechId === null || unlockedTechIds.has(tier.requiredTechId)) best = tier;
  }
  return best;
}

// Productivity multiplier for this tick, based on LAST tick's headcount and
// equipment stock. Deliberately lagged by one tick rather than solved
// simultaneously with this tick's headcount — "last week's equipment level
// determines this week's output" is simple, stable, and close enough.
export function toolEfficiencyMultiplier(region, occupation, toolDefs, unlockedTechIds) {
  const tier = bestAvailableTier(toolDefs, unlockedTechIds);
  if (!tier) return 1;
  const prevHeadcount = region.occupations?.[occupation] || 0;
  const equipped = region.equipment[occupation]?.[tier.id] || 0;
  const equippedFraction = prevHeadcount > 0 ? Math.min(1, equipped / prevHeadcount) : 0;
  return 1 + equippedFraction * tier.productivityBonus;
}

// How much bronze would this occupation like to spend this tick equipping
// more of its (already-decided, this-tick) workforce? Adoption-rate capped
// so equipping a workforce takes years, not one lucky week of smithing.
// Doesn't spend anything yet — that happens in investInTools() once we know
// how much bronze smithing actually delivered this tick.
export function desiredToolInvestment(region, occupation, headcount, toolDefs, unlockedTechIds) {
  const tier = bestAvailableTier(toolDefs, unlockedTechIds);
  if (!tier || headcount <= 0) return { bronzeWanted: 0, tier: null, newToolsWanted: 0 };
  const equipped = region.equipment[occupation]?.[tier.id] || 0;
  const unequipped = Math.max(0, headcount - equipped);
  const adoptionCap = Math.max(1, Math.round(headcount * MAX_ADOPTION_RATE_PER_WEEK));
  const newToolsWanted = Math.min(unequipped, adoptionCap);
  return { bronzeWanted: newToolsWanted * tier.bronzeCost, tier, newToolsWanted };
}

// Spends this occupation's fair share of the bronze that was actually
// available this tick (proportional to what it originally asked for,
// relative to total demand) and adds the resulting tools to the stock.
// Returns the bronze actually spent.
export function investInTools(region, occupation, want, bronzeAvailableForThis) {
  if (!want.tier || want.bronzeWanted <= 0 || bronzeAvailableForThis <= 0) return 0;
  const bronzeSpent = Math.min(want.bronzeWanted, bronzeAvailableForThis);
  const toolsBought = Math.floor(bronzeSpent / want.tier.bronzeCost);
  if (toolsBought <= 0) return 0;
  if (!region.equipment[occupation]) region.equipment[occupation] = {};
  region.equipment[occupation][want.tier.id] = (region.equipment[occupation][want.tier.id] || 0) + toolsBought;
  return toolsBought * want.tier.bronzeCost;
}
