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
    militaryPolicy: { armyPermanence: 0.4 },
    construction: { projects: [], completed: {}, assets: [] },
    militaryExperience: { field: 0, institutional: 0, lastFieldTick: 100, engagementWeeks: 0, trainingYears: 0 },
    militaryInstitutions: { officerSchoolProgress: 0, officerSchoolActive: false },
    militaryFormations: { traditions: [], progress: {}, retired: [] },
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

attacker.militaryExperience.field = 0.95;
attacker.militaryExperience.institutional = 0.55;
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

const experienced = region({ militaryExperience: { field: 0.8, institutional: 0, lastFieldTick: 0, engagementWeeks: 0, trainingYears: 0 } });
const twelveYears = 12 * (365.2425 / 7);
const decayed = combatExperience(experienced, twelveYears);
assert.ok(decayed < 0.5 && decayed > 0.25, `field experience should decay substantially without institutions, got ${decayed}`);
const learned = recordCombatExperience(experienced, twelveYears + 1, { intensity: 0.02, casualtyShare: 0.03, defender: true });
assert.ok(learned > decayed, 'real combat should add effective experience after decay');

console.log('battlefield terrain regression tests passed');
