import assert from 'node:assert/strict';
import { startCombinedExercise, tickCombinedExercises, combinedExerciseSummary, interoperabilityWith, exerciseMissionCompetence } from '../js/military/combinedExercises.js';
import { shipCombatMultiplier } from '../js/military/navalDamage.js';

const region=(id,actor,{coastal=false,seaIds=[]}={})=>({
  id,name:id,governance:{sovereignPolityId:actor},controllingActorId:id,population:100000,
  neighbors:[],adjacentSeaIds:seaIds,isCoastal:coastal,treasury:5000,
  army:{personnel:1000,away:0},navy:{personnel:100},relations:new Map(),
  militaryExperience:{field:.12,institutional:.14,lastFieldTick:0,engagementWeeks:0,trainingYears:0},
  modernTactics:{dispersion:.08,fireAndMovement:.08,suppression:.05,artilleryCoordination:.05,juniorInitiative:.05,defensiveFireDiscipline:.05},
  experience:{},
});
const a=region('a','A',{coastal:true,seaIds:['sea']});
const b=region('b','B',{coastal:true,seaIds:['sea']});
const rival=region('rival','R',{coastal:true,seaIds:['sea']});
const distant=region('distant','D');
b.militaryExperience.field=.72;b.militaryExperience.institutional=.68;b.modernTactics.fireAndMovement=.72;b.modernTactics.artilleryCoordination=.70;b.modernTactics.juniorInitiative=.66;
rival.relations.set('a',{attitude:-.35});
distant.relations.set('a',{attitude:-.35});
const sea={id:'sea',name:'Test Sea',isSea:true,type:'sea',combinedExercises:[]};
const agreements=[{id:1,type:'alliance',active:true,fromId:'a',toId:'b'}];
const fleets=[
 {ownerRegionId:'a',ships:[{id:'a-ship',designId:'basic_war_boat',condition:1,damageState:{sinking:false}}]},
 {ownerRegionId:'b',ships:[{id:'b-ship',designId:'basic_war_boat',condition:1,damageState:{sinking:false}}]},
];
const beforeArmyA=a.army.personnel,beforeArmyB=b.army.personnel,beforeSkill=exerciseMissionCompetence(a,'coastal_assault');
const started=startCombinedExercise({organiserRegionId:'a',hostRegionId:'sea',participantRegionIds:['b'],missionType:'coastal_assault',durationWeeks:8,scale:.2},[a,b,rival,distant],[sea],agreements,10,fleets);
assert.equal(started.started,true,'allied exercise should start');
assert.ok(a.army.personnel<beforeArmyA&&b.army.personnel<beforeArmyB,'coastal exercise should deploy land forces');
assert.equal(fleets[0].ships[0].exerciseDeploymentId,started.exercise.id,'naval forces should be committed to the exercise');
assert.equal(shipCombatMultiplier(fleets[0].ships[0]),0,'exercise-deployed ships should be unavailable for unrelated combat');
for(let w=0;w<8;w++)tickCombinedExercises([a,b,rival,distant],[sea],fleets,agreements,11+w,7);
assert.equal(started.exercise.active,false,'exercise should finish after its duration');
assert.equal(a.army.personnel,beforeArmyA,'deployed army should return after exercise');
assert.equal(b.army.personnel,beforeArmyB,'allied army should return after exercise');
assert.equal(fleets[0].ships[0].exerciseDeploymentId,undefined,'naval commitment should be released');
assert.ok(shipCombatMultiplier(fleets[0].ships[0])>0,'returned exercise ships should become combat-capable again');
assert.ok(exerciseMissionCompetence(a,'coastal_assault')>beforeSkill,'less experienced participant should learn the exercised mission');
assert.ok(interoperabilityWith(a,b)>0,'combined training should build pairwise interoperability');
assert.ok((a.relations.get('b')?.attitude||0)>0,'participants should warm diplomatically');
assert.ok((rival.relations.get('a')?.attitude||0)<-.35,'nearby wary rival should be irritated by a large coastal exercise');
assert.equal(distant.relations.get('a')?.attitude,-.35,'distant rival should not react to a local exercise');
assert.ok((a.experience?.maritimeCombat||0)>0,'coastal exercise should build naval-combat practice');

const noAlliance=startCombinedExercise({organiserRegionId:'a',hostRegionId:'a',participantRegionIds:['distant'],missionType:'defence'},[a,b,rival,distant],[sea],agreements,30,fleets);
assert.equal(noAlliance.started,false,'non-allies should not join combined exercises');

const summary=combinedExerciseSummary(a);
assert.ok(summary.skills.coastal_assault>0&&summary.interoperability.B>0,'summary should expose mission training and interoperability');
console.log('combined exercise regression passed');
