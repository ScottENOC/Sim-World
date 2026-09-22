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
const polities=[polityA,polityB,polityC];
const regions=[region('a1','a'),region('a2','a'),region('b1','b'),region('c1','c')];

let events=tickWarSociety(polities,regions,[],10,7,{activeCampaigns:[]});
assert(Array.isArray(events),'peaceful indexed tick should return an event array');
for(const polity of polities){
  const summary=warSocietySummary(polity);
  assert(Number.isFinite(summary.warWeariness),'every indexed polity should receive a finite peaceful assessment');
  assert(Number.isFinite(summary.warLegitimacy),'every indexed polity should receive a finite legitimacy assessment');
}

const war={active:true,participants:[{actorId:'a',warAim:'defend'},{actorId:'b',warAim:'attack'}]};
regions[0].report.conflict.pressure=.8;
regions[0].report.conflict.recentCasualties=1200;
const standalone=assessWarSociety(polityA,regions,[war],[]);
assert(Number.isFinite(standalone.weariness),'standalone helper must preserve its non-indexed fallback behaviour');
assert(Number.isFinite(standalone.legitimacy),'standalone helper should still produce a complete assessment');

events=tickWarSociety(polities,regions,[war],20,7,{activeCampaigns:[]});
assert(Array.isArray(events),'indexed wartime tick should execute and return an event array');
for(const polity of polities){
  assert(Number.isFinite(warSocietySummary(polity).warWeariness),'indexed wartime state should remain finite');
}

console.log('war society indexed-path regressions passed');
