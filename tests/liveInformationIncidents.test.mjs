import assert from 'node:assert/strict';
import { launchElectionInterference } from '../js/politics/electionInterference.js';
import { harvestCovertIncidents } from '../js/diplomacy/covertIncidentBridge.js';
import { ensureInformationIntegrity, informationIntegritySummary } from '../js/diplomacy/informationIntegrity.js';

function region(id,polityId,overrides={}){
  return {
    id,name:id,population:1_000_000,polityId,
    governance:{sovereignPolityId:polityId,administrativeControl:.75,pendingLeadershipShocks:[]},
    communicationState:{cipherPractice:.15,breakthroughs:['cipher_conventions'],sealPractice:.3,challengePhrasePractice:.2},
    counterIntelligence:{credentialSecurity:.65,codePractice:.55,verificationCaution:.7,compromisedCredentialActors:[],detectedForgeries:[]},
    publicEducation:{literacy:.85,technicalHumanCapital:.65},
    electricity:{industrialService:.9,householdService:.85},
    computingIndustry:{capability:.78,digitalCapability:.82},
    unlockedTechIds:new Set(['electronic_computing','computer_networks','public_key_cryptography']),
    stockpile:{computers:100},treasury:500,report:{},
    ...overrides,
  };
}
function polity(id,capitalRegionId){
  return {id,name:id,capitalRegionId,massPolitics:{policy:{franchise:'universal',associations:'legal'},effectiveElectorateShare:.8,administrativeCapacity:.75}};
}

{
  const sponsor=polity('s','sr'),target=polity('t','tr');
  const sr=region('sr','s'),tr=region('tr','t');
  const draws=[0,.99];let i=0;
  const op=launchElectionInterference(sponsor,target,[sr,tr],50,{mode:'hack_and_leak',amount:25},()=>draws[i++]??.99);
  assert(op.detected,'operation should be detected in fixture');
  assert.equal(op.attributed,false,'detection should not imply attribution');
  const claim=ensureInformationIntegrity(tr).incidents.at(-1);
  assert(claim,'detected interference should enter the contested-information ledger');
  assert.equal(claim.type,'election_interference');
  assert.equal(claim.allegedActorId,null,'hidden sponsor must not leak into an unattributed public claim');
  assert(!JSON.stringify(informationIntegritySummary(tr)).includes('actualActorId'),'public summary must not expose hidden actor fields');
}

{
  const sponsor=polity('s','sr'),target=polity('t','tr');
  const sr=region('sr','s'),tr=region('tr','t');
  const op=launchElectionInterference(sponsor,target,[sr,tr],51,{mode:'propaganda',amount:25},()=>.99);
  assert.equal(op.detected,false);
  assert.equal(ensureInformationIntegrity(tr).incidents.length,0,'undetected interference should not magically become public knowledge');
}

{
  const sponsor=polity('s','sr'),target=polity('t','tr');
  const sr=region('sr','s'),tr=region('tr','t');
  const op=launchElectionInterference(sponsor,target,[sr,tr],52,{mode:'false_flag',amount:25,falseFlagActorId:'third'},()=>0);
  assert(op.detected&&op.attributed,'fixture should detect and attribute the false flag');
  const claim=ensureInformationIntegrity(tr).incidents.at(-1);
  assert.equal(claim.allegedActorId,'third','a successful false flag should publicly implicate the planted actor, not reveal the real sponsor');
  assert.notEqual(claim.allegedActorId,op.actualActorId);
  assert(claim.narratives.some(n=>n.kind==='alternative_actor'),'false flags should leave room for competing attribution narratives');
}

{
  const victim=region('victim','v');
  victim.governance.pendingLeadershipShocks.push({
    operationId:'op-hidden',tick:70,removedBy:'assassination',sourceActorId:'attacker',attributed:false,detected:true,vip:{id:'leader',role:'head_of_state'},
  });
  harvestCovertIncidents([victim],70);
  const claim=ensureInformationIntegrity(victim).incidents.at(-1);
  assert.equal(claim.type,'covert_incident');
  assert.equal(claim.allegedActorId,null,'an observed assassination must not reveal an unattributed covert actor');
}

{
  const victim=region('victim2','v2');
  victim.governance.pendingLeadershipShocks.push({
    operationId:'op-known',tick:71,removedBy:'capture',sourceActorId:'attacker',attributed:true,detected:true,vip:{id:'minister',role:'minister'},
  });
  harvestCovertIncidents([victim],71);
  const claim=ensureInformationIntegrity(victim).incidents.at(-1);
  assert.equal(claim.allegedActorId,'attacker','attributed covert incidents may name the assessed actor');
  assert(claim.narratives.some(n=>n.kind==='denial_actor'),'named actors can publicly deny responsibility');
}

{
  const gridVictim=region('grid','g',{
    militaryThreat:{lastCovertAttackTick:80,lastCovertAttackMission:'cyber_attack',lastCovertAttackActorId:'foreign',lastCovertAttackAttributed:false},
  });
  harvestCovertIncidents([gridVictim],80);
  const claim=ensureInformationIntegrity(gridVictim).incidents.at(-1);
  assert.equal(claim.headline,'Disruptive cyber attack reported');
  assert.equal(claim.allegedActorId,null,'cyber attacks remain unattributed until evidence supports attribution');
  assert(claim.narratives.some(n=>n.kind==='alternative_actor'),'cyber incidents should naturally produce competing attribution narratives');
}

console.log('Live information incident regressions passed.');
