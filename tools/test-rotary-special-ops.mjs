import assert from 'node:assert/strict';
import {
  AIR_MOBILITY_MODES,
  airAssaultOccupationCandidate,
  consumeCampaignAirMobility,
  requestCampaignAirlift,
} from '../js/military/airMobility.js';
import {
  HELIBORNE_SPECIAL_OPERATIONS_TECH_ID,
  SPECIAL_OPERATION_INSERTION,
  SPECIAL_OPERATION_MISSIONS,
  establishSpecialForces,
  launchSpecialOperation,
  specialForcesSummary,
  tickSpecialOperations,
} from '../js/military/specialOperations.js';
import {
  embarkHelicopter,
  fitHelicopterDeck,
  fleetRotaryWingCapacity,
  navalHelicopterLaunchAssessment,
} from '../js/military/navalRotaryWing.js';

function region(id, actor = id) {
  return {
    id,
    name: id,
    population: 1_000_000,
    stability: .7,
    governance: { sovereignPolityId: actor, localRulerId: `ruler-${id}` },
    unlockedTechIds: new Set(['military_aviation', 'rotary_wing_flight', 'air_assault']),
    army: { personnel: 1200, away: 0 },
    militaryProfessionalisation: { institutionalExperience: .7, fieldExperience: .65 },
    militaryFormations: { traditions: [{ readiness: .7 }] },
    militaryStrategy: { readiness: .5 },
    counterIntelligence: { capability: .35 },
    industrialSupply: { capability: { precision_machining: .8 }, inventory: { machine_components: 500 } },
    industrialMarine: { marineEngineering: .75 },
    industrialPlants: { componentCapability: { small_arms: .8, optics: .75, radio_navigation: .7, electronics: .65 } },
    stockpile: { steel: 500, aviation_fuel: 500 },
    treasury: 5000,
    wallet: 0,
    aviation: { aircraft: [] },
    adjacentSeaIds: [],
  };
}

const origin = region('origin', 'blue');
const target = region('target', 'red');
target.adjacentSeaIds = ['sea-1'];

const established = establishSpecialForces(origin, { personnel: 24 });
assert.equal(established.established, true, 'a professional modern army should be able to establish special forces');
assert.equal(origin.specialForces.operators, 24);
origin.unlockedTechIds.add(HELIBORNE_SPECIAL_OPERATIONS_TECH_ID);
origin.specialForces.training = .8;
origin.specialForces.experience = .55;

const helicopter = {
  id: 'helo-1',
  aircraftType: 'helicopter',
  role: 'transport_helicopter',
  ownerActorId: 'blue',
  status: 'serviceable',
  condition: .95,
  pilotExperience: .6,
  designStats: { troopLift: .82, payload: .65, manoeuvrability: .72, reliability: .78, range: .6, battlefieldPersistence: .7 },
};
origin.aviation.aircraft.push(helicopter);

const ship = { id: 'ship-1', designId: 'dreadnought', condition: 1 };
const fitted = fitHelicopterDeck(origin, ship, { capacity: 3 });
assert.equal(fitted.fitted, true, 'large late-industrial ships should accept rotary-wing facilities');
assert.equal(ship.rotaryWingCapacity, 3);
const fleet = { id: 'fleet-1', ownerActorId: 'blue', locationType: 'port', portRegionId: 'origin', seaRegionId: null, ships: [ship] };
assert.equal(fleetRotaryWingCapacity(fleet).capacity, 3);
const embarked = embarkHelicopter(origin, helicopter.id, fleet);
assert.equal(embarked.embarked, true, 'transport helicopter should embark within deck capacity');
fleet.locationType = 'sea';
fleet.portRegionId = null;
fleet.seaRegionId = 'sea-1';
assert.equal(navalHelicopterLaunchAssessment(helicopter, fleet, target).possible, true, 'carrier helicopter should launch against an adjacent littoral target');

const campaign = {
  id: 7,
  attackerId: origin.id,
  defenderId: target.id,
  occupationActorId: 'blue',
  personnel: 90,
  attackerCasualties: 0,
  attackerMorale: .9,
  subregional: { currentNodeId: 'target:rural:1', airMobilityOrders: [] },
};
target.subregionalControl = {
  places: [
    { id: 'target:rural:1', kind: 'village_district', controllerActorId: 'blue', strategicValue: .2 },
    { id: 'target:principal', kind: 'principal_settlement', controllerActorId: 'red', strategicValue: 1 },
  ],
};
const airlift = requestCampaignAirlift(origin, helicopter, campaign, target, {
  mode: AIR_MOBILITY_MODES.AIR_ASSAULT,
  targetNodeId: 'target:principal',
  currentTick: 10,
});
assert.equal(airlift.requested, true, 'campaign should accept a transport-helicopter air-assault order');
target.rotaryWingEffects = { tick: 10, troopLift: .8, rapidRedeployment: 0, closeSupport: 0, antiArmour: 0 };
const consumed = consumeCampaignAirMobility(campaign, target, 11);
assert.equal(consumed.consumed, true, 'surviving helicopter lift should become campaign movement on the following campaign tick');
assert.equal(campaign.subregional.airMobileDetachment.nodeId, 'target:principal');
assert.ok(campaign.subregional.airMobileDetachment.personnel > 0, 'air assault should move actual campaign personnel to the landing node');
const occupation = airAssaultOccupationCandidate(campaign, target, .9);
assert.equal(occupation.node.id, 'target:principal');
assert.ok(occupation.effectivePressure > 0, 'landed detachment should participate in taking the landing objective');

const op = launchSpecialOperation(origin, target, SPECIAL_OPERATION_MISSIONS.VIP_CAPTURE, 20, {
  insertion: SPECIAL_OPERATION_INSERTION.NAVAL_HELICOPTER,
  helicopter,
  fleet,
  teamSize: 8,
  durationWeeks: 1,
});
assert.equal(op.launched, true, 'special forces should launch a ship-based helicopter VIP capture mission');
const events = tickSpecialOperations([origin, target], 21, 7, () => 0);
assert.ok(events.some(e => e.type === 'special_operation_succeeded' && e.mission === SPECIAL_OPERATION_MISSIONS.VIP_CAPTURE), 'high-readiness regression mission should resolve successfully');
assert.equal(origin.specialForces.captives.length, 1, 'successful VIP capture should create a persistent captive');
assert.equal(target.governance.vipStatus['ruler-target'].status, 'captured');
const summary = specialForcesSummary(origin);
assert.ok(summary.operators > 0 && summary.available > 0, 'surviving operators should return to the available pool');

console.log('rotary-wing mobility and special operations regression checks passed');
