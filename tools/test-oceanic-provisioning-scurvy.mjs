import assert from 'node:assert/strict';
import {
  ensureFleetProvisioning,
  provisioningCombatMultiplier,
  provisioningPractice,
  serviceProvisioningInPort,
  shouldReturnForProvisioning,
  tickProvisioningAtSea,
} from '../js/military/oceanicProvisioning.js';

function makeRegion(overrides = {}) {
  return {
    id: 'port', population: 20000, landQuality: 0.75,
    stockpile: { food: 10000, salt: 100 },
    maritimeProvisioning: { antiScurvyPractice: 0, longVoyageExperience: 0, outbreaksObserved: 0 },
    ...overrides,
  };
}

function makeFleet() {
  return {
    id: 'fleet-1', ownerRegionId: 'port', ownerActorId: 'p1', mission: 'transit',
    ships: [{}, {}, {}], supply: 0.95, fatigue: 0.05, morale: 1, weeksAtSea: 0,
  };
}

const owner = makeRegion();
const fleet = makeFleet();
ensureFleetProvisioning(fleet);
for (let week = 0; week < 14; week++) {
  fleet.weeksAtSea += 1;
  tickProvisioningAtSea(fleet, owner, 1);
}
assert.ok(fleet.supply > 0.8, 'test fleet should still have conventional calories/supply');
assert.ok(fleet.provisioning.freshProvisionQuality < 0.1, 'fresh provisions should spoil before preserved calories run out');
assert.ok(fleet.provisioning.deficiencyWeeks > 3.5, 'long voyage should accumulate dietary deficiency');
assert.ok(fleet.provisioning.scurvyBurden > 0.05, 'prolonged poor diet should produce scurvy burden');
assert.ok(provisioningCombatMultiplier(fleet) < 1, 'scurvy should reduce crew effectiveness');
assert.equal(shouldReturnForProvisioning(fleet), true, 'AI should eventually return a sick fleet to port');

const burdenBefore = fleet.provisioning.scurvyBurden;
const saltBefore = owner.stockpile.salt;
serviceProvisioningInPort(fleet, owner, owner, 3, 36);
assert.ok(fleet.provisioning.freshProvisionQuality > 0.5, 'a food-rich port should restore fresh provisions');
assert.ok(fleet.provisioning.scurvyBurden < burdenBefore, 'fresh port provisions should allow recovery');
assert.ok(owner.stockpile.salt < saltBefore, 'preserved ship provisions should consume salt');
assert.ok(provisioningPractice(owner).antiScurvyPractice > 0, 'societies should learn empirically from scurvy outbreaks and recovery');

const experiencedOwner = makeRegion({
  id: 'experienced',
  maritimeProvisioning: { antiScurvyPractice: 0.85, longVoyageExperience: 500, outbreaksObserved: 3 },
});
const experiencedFleet = makeFleet();
experiencedFleet.ownerRegionId = experiencedOwner.id;
for (let week = 0; week < 14; week++) {
  experiencedFleet.weeksAtSea += 1;
  tickProvisioningAtSea(experiencedFleet, experiencedOwner, 1);
}
assert.ok(experiencedFleet.provisioning.scurvyBurden < fleet.provisioning.scurvyBurden,
  'experienced anti-scurvy provisioning should materially extend voyage endurance');

const poorPort = makeRegion({ id: 'poor', landQuality: 0.2, stockpile: { food: 0, salt: 0 } });
const sickFleet = makeFleet();
sickFleet.provisioning = { freshProvisionQuality: 0, preservedRationQuality: 0.4, deficiencyWeeks: 10, scurvyBurden: 0.5, crewReadiness: 0.76 };
serviceProvisioningInPort(sickFleet, poorPort, poorPort, 2, 36);
assert.ok(sickFleet.provisioning.scurvyBurden >= 0.49, 'a starving harbour should not magically cure scurvy');

console.log('Oceanic provisioning and scurvy regression passed');
