import assert from 'node:assert/strict';
import {
  battlefieldWeights,
  combatExperience,
  currentTerrainMix,
  forceTerrainProfile,
  recordCombatExperience,
} from '../js/military/terrain.js';

function region(overrides = {}) {
  return {
    terrain: { plains: 0.45, hills: 0.28, mountains: 0.10, forest: 0.14, wetland: 0.03, forestPotential: 0.28 },
    forest: { currentStock: 0.5, K: 1 },
    unlockedTechIds: new Set(),
    horseEconomy: { war: 0 },
    chariotry: { chariots: 0, condition: 1 },
    army: { personnel: 1000, away: 0 },
    militaryExperience: { combat: 0, lastTick: 100, engagementWeeks: 0 },
    ...overrides,
  };
}

const attacker = region();
const defender = region();
const baseline = battlefieldWeights({ attacker, defender, currentTick: 100, attackerMobility: 0.35, defenderMobility: 0.35 });
assert.ok(baseline.defenderSelection > baseline.attackerSelection, 'defender should have baseline terrain-selection advantage');
const naturalBroken = baseline.natural.hills + baseline.natural.mountains + baseline.natural.forest;
const chosenBroken = baseline.weights.hills + baseline.weights.mountains + baseline.weights.forest;
assert.ok(chosenBroken > naturalBroken, 'defender advantage should bias otherwise-even forces toward defensible broken ground');

attacker.militaryExperience.combat = 0.95;
const veteranAttack = battlefieldWeights({ attacker, defender, currentTick: 100, attackerMobility: 1, defenderMobility: 0.1 });
assert.ok(veteranAttack.attackerSelection > veteranAttack.defenderSelection,
  'a very experienced fast attacker should sometimes gain more terrain choice than an inexperienced slow defender');

const chariotArmy = region({
  unlockedTechIds: new Set(['light_chariotry']),
  horseEconomy: { war: 500 },
  chariotry: { chariots: 120, condition: 1 },
});
const chariotProfile = forceTerrainProfile(chariotArmy);
assert.ok(chariotProfile.plains > chariotProfile.hills);
assert.ok(chariotProfile.hills > chariotProfile.mountains);
assert.ok(chariotProfile.plains > chariotProfile.forest);

const wooded = region();
const beforeClear = currentTerrainMix(wooded);
wooded.forest.currentStock = 0.1;
const afterClear = currentTerrainMix(wooded);
assert.ok(afterClear.forest < beforeClear.forest, 'forest clearing should change terrain only when terrain is queried');
assert.ok(afterClear.plains > beforeClear.plains, 'cleared forest should become mostly open ground');

const experienced = region({ militaryExperience: { combat: 0.8, lastTick: 0, engagementWeeks: 0 } });
const halfLifeWeeks = 30 * (365.2425 / 7);
const decayed = combatExperience(experienced, halfLifeWeeks);
assert.ok(Math.abs(decayed - 0.4) < 0.01, `30-year half-life should reduce 0.8 experience to about 0.4, got ${decayed}`);
const learned = recordCombatExperience(experienced, halfLifeWeeks + 1, { intensity: 0.02, casualtyShare: 0.03, defender: true });
assert.ok(learned > decayed, 'real combat should add experience');

console.log('battlefield terrain regression tests passed');
