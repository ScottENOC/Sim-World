import assert from 'node:assert/strict';
import { tickWarSociety } from '../js/society/warSociety.js';
import { ensureInformationIntegrity } from '../js/diplomacy/informationIntegrity.js';

function region(id,polityId,overrides={}){
  return {
    id,name:id,polityId,population:1_000_000,
    governance:{sovereignPolityId:polityId},
    demographics:{workingAge:550_000},army:{personnel:10_000,away:0},
    publicEducation:{literacy:.9},earlyModernReform:{printDensity:.8},
    unlockedTechIds:new Set(['printing_press','electrical_telegraphy','telephone_networks','photography','motion_picture','radio_broadcasting']),
    report:{conflict:{}},
    ...overrides,
  };
}

const attackerPolity={id:'a',name:'Attacker'};
const defenderPolity={id:'d',name:'Defender'};
const attacker=region('front-a','a');
const defender=region('city-d','d');
const info=ensureInformationIntegrity(defender);
Object.assign(info,{provenanceCoverage:.72,mediaForensics:.68,independentCorroboration:.75,syntheticMediaPressure:.72});
const campaign={
  id:42,attackerId:attacker.id,defenderId:defender.id,civilianDeaths:18,
  attackerCasualties:20,defenderCasualties:30,weeksEngaged:3,lastWeek:{},
};

tickWarSociety([attackerPolity,defenderPolity],[attacker,defender],[],100,7,{activeCampaigns:[campaign]});
let claim=ensureInformationIntegrity(defender).incidents.find(i=>i.id==='war-civilian-harm-42');
assert(claim,'civilian deaths in an active campaign should generate a contested public claim');
assert.equal(claim.type,'civilian_harm');
assert.equal(claim.subjectRegionId,defender.id);
assert.equal(claim.allegedActorId,'a','an overt attacking polity may be identified while responsibility for specific harm remains contestable');
assert(claim.evidence.length>=1,'the claim should begin with observed reporting evidence');
assert(claim.narratives.some(n=>n.kind==='denial_responsibility'),'the alleged attacker can deny responsibility for the civilian harm');
assert(claim.narratives.some(n=>n.kind==='denial_synthetic'),'high synthetic-media pressure should permit an AI-fake denial of real-looking evidence');

const initialEvidence=claim.evidence.length;
campaign.civilianDeaths=37;
tickWarSociety([attackerPolity,defenderPolity],[attacker,defender],[],105,7,{activeCampaigns:[campaign]});
claim=ensureInformationIntegrity(defender).incidents.find(i=>i.id==='war-civilian-harm-42');
assert.equal(ensureInformationIntegrity(defender).incidents.filter(i=>i.id==='war-civilian-harm-42').length,1,'continuing civilian harm should update one evolving claim rather than spam duplicate incidents');
assert(claim.evidence.length>initialEvidence,'later casualty reporting should add evidence to the existing claim');

campaign.civilianDeaths=37;
tickWarSociety([attackerPolity,defenderPolity],[attacker,defender],[],106,7,{activeCampaigns:[campaign]});
assert.equal(claim.evidence.length,initialEvidence+1,'unchanged cumulative civilian deaths should not manufacture new evidence');

console.log('War information incident regressions passed.');
