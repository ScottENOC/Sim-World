import assert from 'node:assert/strict';
import { SPACE_MILESTONES, SPACE_TECH_IDS, nationalReputationEffects, spaceMilestoneCost, tickSpaceRace } from '../js/technology/spaceRace.js';

function region(id, polity, treasury=5000){
  return {
    id,name:id,population:2_000_000,treasury,stability:.85,areaSqKm:100_000,
    governance:{sovereignPolityId:polity,relationship:'core'},polityId:polity,
    stockpile:{steel:1000,petrol:1000},
    unlockedTechIds:new Set(['strategic_missile_systems']),
    industrialSupply:{capability:{precision_machining:.9}},
    structuralTransformation:{capability:{manufacture:.9}},
    industrialPlants:{componentCapability:{electronics:.8,engine:.85}},
    electricity:{industrialService:.9},
  };
}

const a=region('A','pA');
const b=region('B','pB');
const regions=[a,b];
let events=[];
for(let tick=1;tick<=30;tick++) events.push(...tickSpaceRace(regions,tick,()=>.5,7));

assert.ok(a.spaceProgramme.completedMilestones.includes('first_rocket_space'));
assert.ok(b.spaceProgramme.completedMilestones.includes('first_rocket_space'));
const rocketFirsts=[...a.spaceProgramme.history,...b.spaceProgramme.history].filter(x=>x.milestoneId==='first_rocket_space'&&x.worldFirst);
assert.equal(rocketFirsts.length,1,'exactly one country should own the historical first');
assert.ok(events.some(e=>e.type==='historical_world_first'&&e.milestoneId==='first_rocket_space'));
assert.ok((rocketFirsts[0].prestige||0)>0);
const winner=rocketFirsts[0].polityId==='pA'?a:b;
assert.ok(nationalReputationEffects(winner).migrationPull>1,'historical prestige should have a real migration pull');
assert.ok(nationalReputationEffects(winner).cooperationPull>1,'historical prestige should expose a cooperation benefit for diplomacy');
assert.deepEqual(spaceMilestoneCost('first_rocket_space'),{cash:120,steel:18,fuel:10});
assert.ok(winner.spaceProgramme.totalSpent>0,'space programmes must consume concrete resources');
assert.ok(winner.treasury<5000);

// National capability continues after a rival has taken the first, and early
// milestones unlock the next spaceflight capability rather than ending the race.
assert.ok(a.unlockedTechIds.has(SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY));
assert.ok(b.unlockedTechIds.has(SPACE_TECH_IDS.SPACEFLIGHT_ROCKETRY));
assert.ok(SPACE_MILESTONES.some(m=>m.id==='first_human_moon'));
assert.ok(SPACE_MILESTONES.some(m=>m.id==='first_moon_base'));
assert.ok(SPACE_MILESTONES.some(m=>m.id==='first_human_mars'));
assert.ok(SPACE_MILESTONES.some(m=>m.id==='first_mars_base'));

console.log('space race regressions passed');
