import assert from 'node:assert/strict';
import { artilleryFireControlProfile, ensureArtilleryFireControl, recordArtilleryFireControlLessons, resolveArtilleryTargeting } from '../js/military/artilleryFireControl.js';
import { BREECH_ARTILLERY_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID, HEAVY_HOWITZER_TECH_ID, MACHINE_GUN_TECH_ID } from '../js/military/modernLandWarfare.js';
import { ensureModernTactics, recordModernCombatLessons } from '../js/military/modernTactics.js';

function region(id,{advanced=false,machineGuns=false}={}){
  const unlockedTechIds=new Set(['military_drill']);
  if(advanced){ unlockedTechIds.add(BREECH_ARTILLERY_TECH_ID); unlockedTechIds.add(QUICK_FIRE_ARTILLERY_TECH_ID); unlockedTechIds.add(HEAVY_HOWITZER_TECH_ID); }
  if(machineGuns) unlockedTechIds.add(MACHINE_GUN_TECH_ID);
  return {
    id,name:id,unlockedTechIds,population:100000,
    army:{personnel:10000,away:0},militaryPolicy:{armyPermanence:.7},
    militaryExperience:{field:.6,institutional:.7,lastFieldTick:0,engagementWeeks:30,trainingYears:15},
    militaryInstitutions:{officerSchoolActive:true,officerSchoolProgress:1},
    militaryFormations:{traditions:[],progress:{},retired:[]},
    medievalDoctrine:{composition:{},practice:{combinedArms:.5,antiCavalry:0,missileDiscipline:0,cavalryShock:.5,mountedSkirmish:0,firearmDrill:.7},fortress:{}},
    massEducation:{literacy:.7},governance:{administrativeControl:.8},telephone:{militaryCoordination:.7},
    earlyModernMilitary:{artillery:{inventory:[{},{},{}],away:[]}},warDamage:{infrastructureDamage:0,bombardmentWeeks:0},
  };
}

const attacker=region('attacker',{advanced:true});
const defender=region('defender',{machineGuns:true});
let base=artilleryFireControlProfile(attacker,defender,{currentTick:10,weeksEngaged:2});
assert(base.effectiveRangeKm>=12,'heavy modern artillery should begin with materially longer range');
assert(base.commandStrikeChance<.2,'long-range guns should not automatically equal precision targeting');

for(let i=0;i<80;i++) recordArtilleryFireControlLessons(attacker,defender,{currentTick:10+i,intensity:.04,bombardment:.6,enemyArtillery:3});
let learned=artilleryFireControlProfile(attacker,defender,{currentTick:90,weeksEngaged:8});
assert(learned.effectiveRangeKm>base.effectiveRangeKm*1.15,'practice should extend effective usable range');
assert(learned.precision>base.precision+.15,'survey and fire-control practice should materially improve precision');

attacker.airRecon={defender:{observedTick:90,confidence:.85}};
const withAir=artilleryFireControlProfile(attacker,defender,{currentTick:90,weeksEngaged:8});
assert(withAir.observation.aerial>.8,'fresh aerial reconnaissance should provide strong observation');
assert(withAir.commandStrikeChance>learned.commandStrikeChance+.12,'aerial observation should substantially improve precision-target opportunities');

const targeted=resolveArtilleryTargeting(attacker,defender,{...withAir,commandStrikeChance:1,commandDisruption:.7,logisticsInterdiction:.7,counterBatteryEffect:.5},{bombardment:1,rng:()=>0,currentTick:91});
assert(targeted.commandHit,'high-quality observed artillery should be capable of striking a command post');
assert(targeted.commandMultiplier<.75,'a command-post strike should be a qualitative command disruption, not only generic damage');
assert(targeted.logisticsMultiplier<.9,'precision artillery should be able to interdict logistics');

const observer=region('observer',{machineGuns:true});
const victim=region('victim');
const before={...ensureModernTactics(observer)};
recordModernCombatLessons(observer,victim,{role:'defender',casualtyShare:.001,opponentCasualtyShare:.12,intensity:.05,currentTick:1});
const after=ensureModernTactics(observer);
assert(after.lessonsCaptured>before.lessonsCaptured,'an army should learn from observing an enemy failure even when its own losses are tiny');
assert(after.dispersion>before.dispersion,'observed enemy mistakes should feed future tactical adaptation');

console.log('artillery fire-control and observed-enemy-learning regression passed');
