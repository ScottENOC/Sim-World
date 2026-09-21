import assert from 'node:assert/strict';
import { assessForeignLaunchAccess, bestAccessibleLaunchSite } from '../js/technology/foreignLaunchAccess.js';

function region(id,polity,lon,lat,strategy='competitive'){
  return {id,name:id,centroid:[lon,lat],isCoastal:true,eastwardSeaLaunchCorridor:true,governance:{sovereignPolityId:polity},polityId:polity,relations:new Map(),spaceProgramme:{strategy,completedMilestones:['first_satellite']}};
}
function warm(a,b,value){a.relations.set(b.id,{attitude:value,lastCause:'test'});}
const uk=region('uk','UK',0,52,'competitive');
const florida=region('florida','USA',-81,28,'competitive');
const guyana=region('guyana','FR',-53,5,'cooperative');
warm(florida,uk,.65);warm(guyana,uk,.55);warm(uk,florida,.65);warm(uk,guyana,.55);

assert.equal(assessForeignLaunchAccess(uk,florida,{kind:'scientific'}).allowed,true,'friendly host should allow ordinary scientific launch');
assert.equal(assessForeignLaunchAccess(uk,florida,{kind:'commercial'}).allowed,true,'friendly host should allow commercial launch');
assert.equal(assessForeignLaunchAccess(uk,florida,{kind:'prestige',prestigeRace:true}).allowed,false,'competitive host should refuse a rival prestige mission without partnership');
assert.equal(assessForeignLaunchAccess(uk,florida,{worldFirst:true}).allowed,false,'competitive host should refuse a rival historical-first mission');
const best=bestAccessibleLaunchSite([uk],[uk,florida,guyana],{kind:'scientific'});
assert.ok(best?.foreign,'a friendly foreign site should be selectable when geographically better');
assert.equal(best.region.id,'guyana','near-equatorial friendly launch site should beat higher-latitude alternatives');
console.log('foreign launch access regressions passed');
