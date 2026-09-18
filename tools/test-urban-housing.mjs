import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ensureUrbanHousing, setUrbanHousingPolicy, tickUrbanHousing, urbanHousingEligibility } from '../js/society/urbanHousing.js?v=test';

function region(){return {id:'city',name:'Industrial City',population:10000,treasury:100,wallet:300,stockpile:{wood:1000,stone:1000,clay:500},
  demographics:{workingAge:6000},occupations:{general:1000,industrialSupport:1800,services:1200},
  urbanisation:{urbanPopulation:6500},governance:{administrativeControl:.8},militaryFinance:{stateCapacity:.8},publicEducation:{literacy:.45},
  housing:{version:1,residentCapacity:9300,jobCapacity:{urban:2500,farm:1000,logging:100,mining:100,fishing:100},pendingJobCapacity:{urban:300,farm:0,logging:0,mining:0,fishing:0},ownerShares:{households:1,domesticCorporations:0,foreignCorporations:0,state:0},rentPaidLastTick:0,foreignRentPaidLastTick:0,builtLastTick:0},report:{housing:{blockedWorkers:250}}};}

const stressed=region();
const first=tickUrbanHousing(stressed,10,7,{isPlayer:true});
assert.ok(first.overcrowding>0.1,'housing shortage and blocked workers should create overcrowding');
assert.ok(first.slumPressure>0.1,'urban pressure should create slum pressure');
assert.ok(first.hardshipPenalty>0,'poor housing must feed household hardship');

const eligibility=urbanHousingEligibility(stressed);
assert.equal(eligibility.socialHousing,true,'mature urban state should be able to build social housing');
setUrbanHousingPolicy(stressed,{sanitationLevel:1,buildingStandards:.6,socialHousingBudgetShare:.08},{playerChoice:true});
const treasuryBefore=stressed.treasury,capacityBefore=stressed.housing.residentCapacity,woodBefore=stressed.stockpile.wood;
const improved=tickUrbanHousing(stressed,11,7,{isPlayer:true});
assert.ok(stressed.treasury<treasuryBefore,'municipal policy must spend real treasury funds');
assert.ok(stressed.housing.residentCapacity>capacityBefore,'social housing must add to the existing housing stock');
assert.ok(stressed.stockpile.wood<woodBefore,'social housing must consume real construction materials');
assert.ok(improved.healthRisk<first.healthRisk,'funded sanitation should reduce urban health risk');
assert.ok(stressed.housing.ownerShares.state>0,'public housing should appear in housing ownership');

const village={...region(),population:1000,treasury:20,urbanisation:{urbanPopulation:20},governance:{administrativeControl:.25},militaryFinance:{stateCapacity:.25},publicEducation:{literacy:.02},housing:{...region().housing,residentCapacity:1100,jobCapacity:{urban:20,farm:500,logging:20,mining:20,fishing:20},pendingJobCapacity:{urban:0,farm:0,logging:0,mining:0,fishing:0}}};
assert.equal(urbanHousingEligibility(village).socialHousing,false,'social housing must not appear in a pre-urban low-capacity society');

const employmentSource=fs.readFileSync(new URL('../js/economy/employmentAndHardship.js',import.meta.url),'utf8');
assert.match(employmentSource,/tickUrbanHousing/,'employment and hardship tick must consume urban housing conditions');
assert.match(employmentSource,/urbanHousing/,'urban housing must be reported as a hardship cause');
console.log('urban housing and living conditions regression passed');
