import assert from 'node:assert/strict';
import { artilleryFireControlProfile, ensureArtilleryFireControl, recordArtilleryFireControlLessons, resolveArtilleryTargeting } from '../js/military/artilleryFireControl.js';
import { BREECH_ARTILLERY_TECH_ID, QUICK_FIRE_ARTILLERY_TECH_ID, HEAVY_HOWITZER_TECH_ID, MACHINE_GUN_TECH_ID } from '../js/military/modernLandWarfare.js';
import { ensureModernTactics, recordModernCombatLessons } from '../js/military/modernTactics.js';
import { ensureCurrentArtilleryDesign, stampEquipment } from '../js/military/equipmentGenerations.js';

function region(id,{advanced=false,machineGuns=false}={}){
  const unlockedTechIds=new Set(['military_drill','gunpowder']);
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
    industrialSupply:{capability:{precision_machining:.15}},structuralTransformation:{capability:{manufacture:.2}},steelIndustry:{readiness:.1},
    earlyModernMilitary:{artillery:{inventory:[],away:[]}},warDamage:{infrastructureDamage:0,bombardmentWeeks:0},
  };
}

const attacker=region('attacker');
const defender=region('defender',{machineGuns:true});
const oldDesign=ensureCurrentArtilleryDesign(attacker,'bombard',1);
const oldGun=stampEquipment({kind:'bombard',metal:'iron',condition:1},oldDesign);
const oldRange=oldGun.designStats.rangeKm;

attacker.unlockedTechIds.add(BREECH_ARTILLERY_TECH_ID);
attacker.unlockedTechIds.add(QUICK_FIRE_ARTILLERY_TECH_ID);
attacker.unlockedTechIds.add(HEAVY_HOWITZER_TECH_ID);
attacker.unlockedTechIds.add('steelmaking');
attacker.industrialSupply.capability.precision_machining=.85;
attacker.structuralTransformation.capability.manufacture=.8;
attacker.steelIndustry.readiness=.75;
const newDesign=ensureCurrentArtilleryDesign(attacker,'bombard',2);
const newGun=stampEquipment({kind:'bombard',metal:'steel',condition:1},newDesign);
assert.notEqual(newDesign.id,oldDesign.id,'a meaningful physical improvement should create a new artillery model');
assert.equal(oldGun.designStats.rangeKm,oldRange,'introducing a new design must not upgrade an existing gun');
assert(newGun.designStats.rangeKm>oldGun.designStats.rangeKm*1.5,'new-production artillery should preserve a materially better physical range envelope');

let base=artilleryFireControlProfile(attacker,defender,{currentTick:10,weeksEngaged:2,train:[newGun]});
assert(base.effectiveRangeKm>=newGun.designStats.rangeKm,'usable range should begin from the actual deployed gun design');
assert(base.commandStrikeChance<.2,'long-range guns should not automatically equal precision targeting');

for(let i=0;i<80;i++) recordArtilleryFireControlLessons(attacker,defender,{currentTick:10+i,intensity:.04,bombardment:.6,enemyArtillery:3});
let learned=artilleryFireControlProfile(attacker,defender,{currentTick:90,weeksEngaged:8,train:[newGun]});
assert(learned.effectiveRangeKm>base.effectiveRangeKm*1.08,'practice should extend effective usable range within the gun design envelope');
assert(learned.precision>base.precision+.12,'survey and fire-control practice should materially improve precision');

const oldGunLearned=artilleryFireControlProfile(attacker,defender,{currentTick:90,weeksEngaged:8,train:[oldGun]});
assert(oldGunLearned.effectiveRangeKm<learned.effectiveRangeKm*.72,'excellent doctrine should not turn an old artillery model into new hardware');

attacker.airRecon={defender:{observedTick:90,confidence:.85}};
const withAir=artilleryFireControlProfile(attacker,defender,{currentTick:90,weeksEngaged:8,train:[newGun]});
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

console.log('artillery fire-control, equipment generations and observed-enemy-learning regression passed');
