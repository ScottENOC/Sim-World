import assert from 'node:assert/strict';
import { ensureWarSociety, setWarInformationPolicy, tickWarSociety } from '../js/society/warSociety.js';
import { charterMetrics, proposeInternationalOrganisation, submitInternationalMotion, worldInstitutionReadiness } from '../js/diplomacy/internationalOrganisations.js';

const makeRegion=(id,polity,{pop=1_000_000,wear=0,media=true,climate=true}={})=>({
  id,name:id,polityId:polity,governance:{sovereignPolityId:polity,administrativeControl:.8},population:pop,
  demographics:{workingAge:pop*.58},army:{personnel:120_000},navy:{personnel:15_000},wallet:10000,treasury:8000,
  employment:{hardship:.22},relations:new Map(),communicationState:{messengerExperience:200},
  massEducation:{literacy:.78},earlyModernReform:{printDensity:.75},unlockedTechIds:new Set(media?['printing_press','electrical_telegraphy','photography','telephone_networks',...(climate?['anthropogenic_climate_change']:[])]:[]),
  report:{conflict:{pressure:.82,recentCasualties:5200,artilleryIntensity:.8,momentum:.45}},modernTactics:{machineGunExposure:.8},externalities:{knowledge:{ozone_depletion:{recognised:true}}},
});
const makePolity=(id)=>({id,name:id,administration:{officialdom:.8,recordKeeping:.8,communications:.8},warSociety:null});
const polities=['A','B','C','D','E','F'].map(makePolity);
const regions=polities.map((p,i)=>makeRegion(`r${p.id}`,p.id,{pop:1_000_000+i*180_000}));
for(const a of regions)for(const b of regions)if(a!==b)a.relations.set(b.id,{attitude:.1});
const wars=[{active:true,attackerPolityId:'A',defenderPolityId:'B',participantPolityIds:['A','B','C','D','E']}];
for(const p of polities)ensureWarSociety(p);
for(let i=0;i<160;i++)tickWarSociety(polities,regions,wars,i,7,{});
assert.ok(polities[0].warSociety.warWeariness>.15,'large industrial war should create weariness');
assert.ok(polities[0].warSociety.combatTraumaBurden>.15,'artillery/machine-gun war should create trauma burden');
const openKnowledge=polities[0].warSociety.publicWarKnowledge;
setWarInformationPolicy(polities[0],'total');
for(let i=160;i<220;i++)tickWarSociety(polities,regions,wars,i,7,{});
assert.ok(polities[0].warSociety.concealedReality>0,'strict censorship should conceal some wartime reality');
assert.ok(polities[0].warSociety.publicWarKnowledge<=openKnowledge+.2,'censorship should not improve public knowledge');
assert.ok(polities[0].warSociety.credibility<.86,'concealing a costly war should create credibility risk');

const impartial=charterMetrics({universalMembership:true,hostConcentration:.15,weightedVoting:.05,permanentMemberIds:[],vetoMemberIds:[]},['A','B','C']);
const captured=charterMetrics({hostConcentration:.9,weightedVoting:1,permanentMemberIds:['A','B','C'],vetoMemberIds:['A','B','C'],agendaPrivilege:1,enforcementPrivilege:1},['A','B','C']);
assert.ok(captured.greatPowerBuyIn>impartial.greatPowerBuyIn,'privileges should attract major-power buy-in');
assert.ok(captured.impartiality<impartial.impartiality-.35,'privilege concentration should substantially reduce impartiality');
assert.ok(captured.legitimacy<impartial.legitimacy,'captured institutions should be less legitimate globally');

const readiness=worldInstitutionReadiness(polities,regions,wars);
assert.ok(readiness.connectivity>.3&&readiness.demand>.2,'connected societies scarred by major war should generate institutional demand');
const world={polities,regions,activeWars:wars,internationalOrganisations:[]};
const fair=proposeInternationalOrganisation({proposerPolityId:'A',name:'World Forum',level:'assembly',hostPolityId:'A',charter:{universalMembership:true,hostConcentration:.15,weightedVoting:.05}},world,300);
assert.equal(fair.formed,true,'a connected traumatised world should be able to form an international body');
const fairAcceptance=fair.organisation.metrics.acceptance;
const world2={polities,regions,activeWars:wars,internationalOrganisations:[]};
const rigged=proposeInternationalOrganisation({proposerPolityId:'A',name:'Power Directorate',level:'assembly',hostPolityId:'A',charter:{hostConcentration:.95,weightedVoting:1,permanentMemberIds:['A','B','C'],vetoMemberIds:['A','B','C'],agendaPrivilege:1,enforcementPrivilege:1}},world2,300);
assert.ok(!rigged.formed||rigged.acceptance<fairAcceptance||rigged.organisation?.metrics.acceptance<fairAcceptance,'over-rigging should reduce international acceptance');
const motion=submitInternationalMotion(fair.organisation,{proposerPolityId:'A',type:'climate_action',strength:.7},world,320);
assert.equal(motion.submitted,true,'members should be able to put global motions before the organisation');
if(motion.passed)assert.ok(regions.some(r=>r.internationalPolicy?.climateCommitment>0),'passed climate motions should create member commitments');
console.log('war society and international institutions regression passed');
