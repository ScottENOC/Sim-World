import assert from 'node:assert/strict';
import { MACHINE_GUN_TECH_ID, FIELD_ENTRENCHMENT_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID } from '../js/military/modernLandWarfare.js';
import { ensureModernTactics, modernTacticalProfile, recordModernCombatLessons, tickModernTactics } from '../js/military/modernTactics.js';

function region(id, { veteran = false, machineGuns = false, entrenched = false } = {}) {
  const unlockedTechIds = new Set(['military_drill']);
  if (machineGuns) unlockedTechIds.add(MACHINE_GUN_TECH_ID);
  if (entrenched) unlockedTechIds.add(FIELD_ENTRENCHMENT_TECH_ID);
  return {
    id, name:id, population:100000, unlockedTechIds,
    army:{personnel:10000,away:0}, militaryPolicy:{armyPermanence:veteran?.8:.25},
    militaryExperience:{field:veteran?.85:.08,institutional:veteran?.8:.08,lastFieldTick:0,engagementWeeks:veteran?80:2,trainingYears:veteran?20:1},
    militaryInstitutions:{officerSchoolActive:veteran,officerSchoolProgress:veteran?1:0},
    militaryFormations:{traditions:veteran?[{archetypeId:'professional_cohorts',status:'active',coverage:.5,readiness:.9}]:[],progress:{},retired:[]},
    medievalDoctrine:{composition:{},practice:{combinedArms:veteran?.7:.08,antiCavalry:0,missileDiscipline:0,cavalryShock:veteran?.75:.05,mountedSkirmish:0,firearmDrill:veteran?.9:.08},fortress:{}},
    massEducation:{literacy:veteran?.65:.25}, governance:{administrativeControl:veteran?.8:.25},
  };
}

const mgDefender=region('mg-defender',{veteran:true,machineGuns:true,entrenched:true});
const oldVeterans=region('old-veterans',{veteran:true});
const greenArmy=region('green',{veteran:false});

const veteranInitial=modernTacticalProfile(oldVeterans,mgDefender,{role:'attacker',weeksEngaged:6,terrain:'plains'});
const greenInitial=modernTacticalProfile(greenArmy,mgDefender,{role:'attacker',weeksEngaged:6,terrain:'plains'});
assert(veteranInitial.obsoleteExperiencePenalty>greenInitial.obsoleteExperiencePenalty+.08,
  'deeply learned old assault doctrine should create substantially more negative transfer against machine guns');
assert(veteranInitial.combatMultiplier<greenInitial.combatMultiplier,
  'an experienced army committed to obsolete doctrine can initially attack worse than a greener force');
assert(veteranInitial.casualtyMultiplier>1.25,
  'unadapted assaults across open ground into prepared machine guns should be exceptionally costly');

const defenderProfile=modernTacticalProfile(mgDefender,oldVeterans,{role:'defender',weeksEngaged:6,terrain:'plains'});
assert(defenderProfile.defensiveMultiplier>1.3,'machine-gun tactical employment should strongly amplify prepared defence');

const before={...ensureModernTactics(oldVeterans)};
for(let week=0;week<30;week++) {
  recordModernCombatLessons(oldVeterans,mgDefender,{role:'attacker',casualtyShare:.035,intensity:.05,weeksEngaged:week+1,currentTick:week});
}
oldVeterans.unlockedTechIds.add(QUICK_FIRE_ARTILLERY_TECH_ID);
for(let i=0;i<10;i++) tickModernTactics([oldVeterans],30);
const after=ensureModernTactics(oldVeterans);
const adapted=modernTacticalProfile(oldVeterans,mgDefender,{role:'attacker',weeksEngaged:6,terrain:'plains'});
assert(after.dispersion>.25 && after.fireAndMovement>.2,'repeated costly combat should teach dispersion and fire-and-movement');
assert(after.legacyAssaultInertia<before.legacyAssaultInertia || adapted.adaptation>.25,
  'battlefield lessons should erode obsolete doctrine or overtake it with modern practice');
assert(adapted.combatMultiplier>veteranInitial.combatMultiplier+.12,
  'an army that learns modern tactics should recover meaningful offensive effectiveness');
assert(adapted.casualtyMultiplier<veteranInitial.casualtyMultiplier,
  'modern tactics should reduce exposure to defensive automatic fire');

const isolated=region('isolated',{veteran:true});
const untouchedBefore={...ensureModernTactics(isolated)};
for(let i=0;i<20;i++) tickModernTactics([isolated],30);
const untouchedAfter=ensureModernTactics(isolated);
assert.equal(untouchedAfter.dispersion,untouchedBefore.dispersion,'peacetime should not invent machine-gun tactics without exposure or captured lessons');
assert.equal(untouchedAfter.fireAndMovement,untouchedBefore.fireAndMovement,'modern assault doctrine requires a learning signal, not a calendar unlock');

console.log('machine gun tactical revolution regression passed');
