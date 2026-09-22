import assert from 'node:assert/strict';
import { assessWarSociety, tickWarSociety, warSocietySummary } from '../js/society/warSociety.js';

function region(id, polityId, population=100000) {
  return {
    id,
    name:id,
    population,
    governance:{sovereignPolityId:polityId},
    demographics:{workingAge:population*.55},
    unlockedTechIds:new Set(),
    report:{conflict:{pressure:0,momentum:.5,recentCasualties:0}},
    employment:{hardship:.1},
    army:{personnel:1000,away:0},
    navy:{personnel:0},
  };
}

const polityA={id:'a'},polityB={id:'b'},polityC={id:'c'};
const regions=[region('a1','a'),region('a2','a'),region('b1','b'),region('c1','c')];

let events=tickWarSociety([polityA,polityB,polityC],regions,[],10,7,{activeCampaigns:[]});
assert.deepEqual(events,[],'peaceful zero-campaign world should not emit war-society crises');
for(const polity of [polityA,polityB,polityC]){
  const summary=warSocietySummary(polity);
  assert(Number.isFinite(summary.warWeariness),'every polity should still receive a valid peaceful assessment');
}

const war={active:true,participants:[{actorId:'a',warAim:'defend'},{actorId:'b',warAim:'attack'}]};
regions[0].report.conflict.pressure=.8;
regions[0].report.conflict.recentCasualties=1200;
const standalone=assessWarSociety(polityA,regions,[war],[]);
assert(standalone.weariness>0,'standalone helper must preserve its non-indexed fallback behaviour');

events=tickWarSociety([polityA,polityB,polityC],regions,[war],20,7,{activeCampaigns:[]});
assert(Array.isArray(events));
assert(warSocietySummary(polityA).warLegitimacy>=warSocietySummary(polityB).warLegitimacy,
  'defensive war aim should preserve the existing legitimacy advantage');

console.log('war society indexed-path regressions passed');
