import { localPrice } from '../economy/prices.js?v=20260904-weather1';
import { routeCost } from '../economy/trade.js?v=20260905-infra1';
import { availableResidentHousing } from '../economy/housing.js?v=20260916-housing1';
import { knownRegionIds } from '../core/knowledge.js?v=20260904-weather1';
import { nationalReputationEffects } from '../technology/spaceRace.js?v=20260920-space-race1';

const DENSITY_REFERENCE = 6; // people/km² — same "crowded" threshold gathering uses
const MAX_MIGRATION_DESTINATIONS = 4;
const MIN_MIGRANT_COHORT = 5;

// How attractive is `dest` to someone fleeing famine? Peace = stability.
// Land = room to actually settle (inverse of how crowded it already is).
// Bread = how cheap food is there right now, read straight off the same
// price signal trade uses. International reputation is deliberately a soft
// preference, never enough to override famine, instability or no housing.
function attractiveness(dest) {
  const density = dest.areaSqKm > 0 ? dest.population / dest.areaSqKm : Infinity;
  const landScore = Math.max(0.1, 1 - density / DENSITY_REFERENCE);
  const breadScore = 1 / (localPrice(dest, 'food') + 0.2);
  const reputation = nationalReputationEffects(dest);
  return Math.max(0.01, dest.stability) * landScore * breadScore * reputation.migrationPull;
}

// Splits `emigrantCount` people leaving `region` across destinations present
// in that region's knowledge ledger, weighted by attractiveness and discounted
// by distance/route cost. Knowledge creates a natural local horizon early on,
// then permits longer migrations as exploration and trade spread information.
// Housing capacity can leave some would-be emigrants in place when every known
// destination is full; callers already distinguish people who found a route.
export function chooseEmigrationDestinations(region, regionsById, emigrantCount) {
  const scored = [...knownRegionIds(region)]
    .map((id) => regionsById.get(id))
    .filter((dest) => dest && dest.id !== region.id)
    .map((dest) => {
      const cost = routeCost(region, dest);
      return { dest, score: attractiveness(dest) / (1 + cost), room: availableResidentHousing(dest) };
    })
    .filter((s) => s.score > 0 && s.room >= MIN_MIGRANT_COHORT);

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, MAX_MIGRATION_DESTINATIONS);
  if (!selected.length || emigrantCount <= 0) return [];

  const allocations = new Map(selected.map((s) => [s.dest.id, 0]));
  let remaining = emigrantCount;
  for (let pass = 0; pass < 4 && remaining >= MIN_MIGRANT_COHORT; pass++) {
    const open = selected.filter((s) => s.room - allocations.get(s.dest.id) >= MIN_MIGRANT_COHORT);
    const totalScore = open.reduce((sum, s) => sum + s.score, 0);
    if (!open.length || totalScore <= 0) break;
    let allocatedThisPass = 0;
    for (const s of open) {
      const already = allocations.get(s.dest.id);
      const room = Math.max(0, s.room - already);
      const share = Math.min(room, remaining * (s.score / totalScore));
      if (share <= 0) continue;
      allocations.set(s.dest.id, already + share);
      allocatedThisPass += share;
    }
    if (allocatedThisPass <= 0.001) break;
    remaining = Math.max(0, remaining - allocatedThisPass);
  }

  let routes = selected
    .map((s) => ({ dest: s.dest, count: Math.min(s.room, allocations.get(s.dest.id) || 0) }))
    .filter((route) => route.count >= MIN_MIGRANT_COHORT);
  if (!routes.length && selected.length) {
    const first = selected[0];
    const count = Math.min(emigrantCount, first.room);
    if (count >= MIN_MIGRANT_COHORT) routes = [{ dest: first.dest, count }];
  }
  return routes;
}
