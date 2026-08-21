import { localPrice } from '../economy/prices.js';
import { routeCost } from '../economy/trade.js';

const DENSITY_REFERENCE = 6; // people/km² — same "crowded" threshold gathering uses

// How attractive is `dest` to someone fleeing famine? Peace = stability.
// Land = room to actually settle (inverse of how crowded it already is).
// Bread = how cheap food is there right now, read straight off the same
// price signal trade uses — no need for a second "is there food" concept.
function attractiveness(dest) {
  const density = dest.areaSqKm > 0 ? dest.population / dest.areaSqKm : Infinity;
  const landScore = Math.max(0.1, 1 - density / DENSITY_REFERENCE);
  const breadScore = 1 / (localPrice(dest, 'food') + 0.2);
  return Math.max(0.01, dest.stability) * landScore * breadScore;
}

// Splits `emigrantCount` people leaving `region` across every other region,
// weighted by attractiveness and discounted by distance/route cost — most
// go to the single best nearby option, but desperate populations don't
// coordinate perfectly, so it's a distribution, not a single winner-take-all
// destination. Returns [] if literally nowhere looks better than staying
// (everywhere is equally bad, or unreachable).
export function chooseEmigrationDestinations(region, allRegions, emigrantCount) {
  const scored = allRegions
    .filter((r) => r.id !== region.id)
    .map((dest) => {
      const cost = routeCost(region, dest);
      return { dest, score: attractiveness(dest) / (1 + cost) };
    })
    .filter((s) => s.score > 0);

  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);
  if (totalScore <= 0) return [];

  return scored.map((s) => ({ dest: s.dest, count: emigrantCount * (s.score / totalScore) }));
}
