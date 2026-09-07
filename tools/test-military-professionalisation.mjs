import assert from 'node:assert/strict';
import {
  militaryExperienceProfile,
  moraleShockMultiplier,
  professionalCombatMultiplier,
  professionalLogisticsMultiplier,
  recordBattleExperience,
  retreatLossMultiplier,
  tickMilitaryProfessionalisation,
} from '../js/military/professionalisation.js';
import {
  formationCombatMultiplier,
  formationSummary,
  tickMilitaryFormations,
} from '../js/military/formations.js';
import { armyCohesionMultiplier } from '../js/military/policies.js';

function construction(...types) {
  return { projects: [], completed: {}, workersReserved: 0, maintenanceWorkersReserved: 0,
    assets: types.map((typeId, i) => ({ id:`a${i}`, typeId, condition:1, scale:1 })) };
}

function baseRegion(overrides={}) {
  return {
    id:'r-test', name:'Testland', population:30000, treasury:50000, wallet:10000,
    army:{personnel:2000,away:0}, navy:{personnel:0,boats:0,advancedBoats:0},
    horseEconomy:{war:0}, chariotry:{chariots:0,condition:1},
    militaryPolicy:{armyPermanence:0.3,defensivePosture:'settlements',raiderTreatment:'reintegrate',navalPriority:'trade',warHorseAllocation:.5},
    unlockedTechIds:new Set(), construction:construction(),
    stockpile:{iron:10000,bronze:10000,wood:10000,textiles:10000},
    siegeEquipment:{experience:0,inventory:{ram:{bronze:0,iron:0},catapult:{bronze:0,iron:0}}},
    culturalMemory:{memories:[],effects:{}},
    militaryFormations:{traditions:[],progress:{},retired:[]},
    militaryExperience:{field:0,institutional:0,lastFieldTick:0,engagementWeeks:0,trainingYears:0},
    militaryInstitutions:{officerSchoolProgress:0,officerSchoolActive:false},
    settlements:{places:[],principalId:null},
    ...overrides,
  };
}

const bronze = baseRegion();
const bronzeCombat = professionalCombatMultiplier(bronze);
const bronzeLogistics = professionalLogisticsMultiplier(bronze);
const bronzeCohesion = armyCohesionMultiplier(bronze);
assert.equal(bronzeCombat, 1);
assert.equal(bronzeLogistics, 1);

const classical = baseRegion({
  id:'r-classical',
  militaryPolicy:{armyPermanence:.82,defensivePosture:'borders',raiderTreatment:'reintegrate',navalPriority:'war',warHorseAllocation:.7},
  unlockedTechIds:new Set(['mass_heavy_infantry','military_drill','standard_weights','formal_taxation','mounted_cavalry','naval_warfare']),
  construction:construction('royal_arsenal','drill_ground','administrative_centre','harbour','naval_base'),
  horseEconomy:{war:400},
  navy:{personnel:350,boats:15,advancedBoats:5},
  siegeEquipment:{experience:.35,inventory:{ram:{bronze:2,iron:2},catapult:{bronze:1,iron:1}}},
});

// Thirty years of maintained institutions should create durable competence even in peace.
for (let y=0;y<30;y++) tickMilitaryProfessionalisation(classical, 365.2425);
let profile = militaryExperienceProfile(classical, 30 * 365.2425 / 7);
assert.ok(profile.institutional > .30, `expected institutional experience, got ${profile.institutional}`);
assert.ok(classical.militaryInstitutions.officerSchoolActive, 'mature drill/admin system should eventually produce an officer school/corps');

// Real fighting adds field experience; losses also prevent it becoming a free permanent stat.
let week = Math.round(30 * 365.2425 / 7);
for (let i=0;i<80;i++) {
  recordBattleExperience(classical, week+i, {intensity:.018, casualtyShare:.006, defender:i%3===0});
}
profile = militaryExperienceProfile(classical, week+80);
assert.ok(profile.field > .20, `expected veteran field experience, got ${profile.field}`);
assert.ok(professionalCombatMultiplier(classical) > bronzeCombat);
assert.ok(professionalCombatMultiplier(classical) <= 1.12, 'direct experience combat multiplier should remain modest');
assert.ok(professionalLogisticsMultiplier(classical) > 1.10, 'professional institutions should materially improve logistics');
assert.ok(moraleShockMultiplier(classical) < .90, 'experienced armies should absorb casualty shocks better');
assert.ok(retreatLossMultiplier(classical) < .85, 'experienced armies should retreat more cleanly');
assert.ok(armyCohesionMultiplier(classical) > bronzeCohesion, 'professional army should be more cohesive than an equivalent levy');

// Formation discovery remains emergent and costly rather than an instant tech unlock.
for (let y=0;y<35;y++) tickMilitaryFormations(classical, 365.2425);
const summary = formationSummary(classical);
const ids = new Set(summary.active.map(f=>f.archetypeId));
assert.ok(ids.has('standardised_heavy_infantry'), 'heavy infantry formation should emerge');
assert.ok(ids.has('cavalry_corps'), 'cavalry corps should emerge where horses and institutions support it');
assert.ok(ids.has('siege_engineer_corps'), 'siege corps should emerge from siege practice and arsenals');
assert.ok(ids.has('naval_infantry'), 'naval infantry should emerge from a real naval establishment');
assert.ok(ids.has('professional_cohorts'), 'late professional cohort organisation should be possible but institution-gated');
assert.ok(formationCombatMultiplier(classical,'plains') > 1, 'active formations must now affect campaign combat');
assert.ok(formationCombatMultiplier(classical,'plains') <= 1.34, 'formation stacking must remain bounded');

console.log(JSON.stringify({
  bronze:{combat:bronzeCombat,logistics:bronzeLogistics,cohesion:bronzeCohesion},
  classical:{profile,combat:professionalCombatMultiplier(classical),logistics:professionalLogisticsMultiplier(classical),
    moraleShock:moraleShockMultiplier(classical),retreatLoss:retreatLossMultiplier(classical),cohesion:armyCohesionMultiplier(classical),
    formations:[...ids]},
},null,2));
console.log('military professionalisation regression tests passed');
