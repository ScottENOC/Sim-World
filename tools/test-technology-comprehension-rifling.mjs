import assert from 'node:assert/strict';
import { technologyComprehension, boundedDiffusionChance, observeTechnology, technologyObservation } from '../js/technology/technologyComprehension.js';
import { riflingComprehension, riflingBreakthroughChance, RIFLING_TECH_ID, GUNPOWDER_TECH_ID } from '../js/technology/breakthroughs.js';
import { tickGunpowderIndustry, firearmCombatProfile } from '../js/military/firearms.js';

function region(id) {
  return {
    id, name:id, neighbors:[], tradePartnerIds:new Set(), recentTradePartners:new Map(),
    unlockedTechIds:new Set(), stockpile:{ firearms:0, iron:1000, bronze:100, wood:1000, gunpowder:100, saltpetre:100, sulfur:100 },
    marketDemand:{}, army:{ personnel:1000, away:0 }, firearms:{ readiness:0, combatExperience:0, totalBuilt:0 },
    learning:{ experience:{ smithing:0 } }, occupations:{},
  };
}

assert.equal(technologyComprehension({ prerequisitesMet:false, practice:1, observation:1 }), 0,
  'missing conceptual prerequisites hard-gate comprehension');
assert.equal(boundedDiffusionChance(0.5, 5, 0), 0, 'diffusion cannot cross a zero-comprehension gap');

{
  const isolated = region('isolated');
  observeTechnology(isolated, RIFLING_TECH_ID, 0.8, 'invasion');
  assert.ok(technologyObservation(isolated, RIFLING_TECH_ID).familiarity > 0.7, 'advanced technology can be observed');
  assert.equal(riflingComprehension(isolated), 0, 'observation alone cannot teach rifling without gunpowder/firearm practice');
}

{
  const novice = region('novice');
  const advanced = region('advanced');
  advanced.unlockedTechIds.add(RIFLING_TECH_ID);
  novice.neighbors.push('advanced');
  const map = new Map([[novice.id, novice], [advanced.id, advanced]]);
  assert.equal(riflingBreakthroughChance(novice, map, 1000), 0,
    'a neighbour with rifles cannot teach a society that has never made firearms');
}

{
  const learner = region('learner');
  const neighbour = region('neighbour');
  learner.unlockedTechIds.add(GUNPOWDER_TECH_ID);
  learner.firearms.readiness = 0.5;
  learner.firearms.totalBuilt = 350;
  learner.stockpile.firearms = 180;
  learner.learning.experience.smithing = 150000;
  neighbour.unlockedTechIds.add(RIFLING_TECH_ID);
  learner.neighbors.push('neighbour');
  const map = new Map([[learner.id, learner], [neighbour.id, neighbour]]);
  const withNeighbour = riflingBreakthroughChance(learner, map, 1000);
  learner.neighbors.length = 0;
  const withoutNeighbour = riflingBreakthroughChance(learner, map, 1000);
  assert.ok(withNeighbour > withoutNeighbour, 'a comprehensible neighbouring technology strongly accelerates learning');
  assert.ok(withoutNeighbour > 0, 'experienced gunmakers can independently discover rifling');
}

{
  const maker = region('maker');
  maker.unlockedTechIds.add(GUNPOWDER_TECH_ID);
  maker.firearms.readiness = 0.5;
  tickGunpowderIndustry([maker], 30);
  assert.ok(maker.firearms.totalBuilt > 0, 'firearm manufacture accumulates practical experience for later breakthroughs');
}

{
  const rifle = region('rifle');
  const musket = region('musket');
  const opponent = region('opponent');
  for (const r of [rifle,musket]) {
    r.unlockedTechIds.add(GUNPOWDER_TECH_ID);
    r.stockpile.firearms = 1000;
    r.stockpile.gunpowder = 1000;
    r.firearms.readiness = 0.7;
  }
  rifle.unlockedTechIds.add(RIFLING_TECH_ID);
  rifle.firearms.riflingReadiness = 0.8;
  const rifleProfile = firearmCombatProfile(rifle, opponent, 1000, { consumeSupplies:false });
  const musketProfile = firearmCombatProfile(musket, opponent, 1000, { consumeSupplies:false });
  assert.ok(rifleProfile.riflingBonus > 0 && rifleProfile.multiplier > musketProfile.multiplier,
    'mature rifling improves effective firearm combat performance');
}

console.log('technology comprehension and rifling tests passed');
