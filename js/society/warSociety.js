import { addInformationEvidence, ensureInformationIntegrity, publishCompetingNarrative, recordInformationIncident } from '../diplomacy/informationIntegrity.js?v=20260922-info3';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const WAR_INFORMATION_POLICIES=Object.freeze({
  open:{id:'open',label:'Open war reporting',visibility:1,control:0.02,credibilityRisk:0},
  accredited:{id:'accredited',label:'Accredited correspondents',visibility:0.78,control:0.18,credibilityRisk:0.05},
  censored:{id:'censored',label:'Military censorship',visibility:0.50,control:0.42,credibilityRisk:0.16},
  strict:{id:'strict',label:'Strict wartime censorship',visibility:0.26,control:0.68,credibilityRisk:0.32},
  total:{id:'total',label:'Total information control',visibility:0.10,control:0.86,credibilityRisk:0.52},
});

function polityId(r){return r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||null;}
function territories(polity,regions){return (regions||[]).filter(r=>polityId(r)===polity.id);}
function avg(rs,fn){let w=0,s=0;for(const r of rs){const p=Math.max(1,Number(r.population)||1);w+=p;s+=clamp(fn(r))*p;}return w?s/w:0;}
function smooth(current,target,days,rate=1){const years=Math.max(0,Number(days)||0)/DAYS_PER_YEAR;const k=1-Math.exp(-rate*years);return clamp((Number(current)||0)+(target-(Number(current)||0))*k);}
function literacy(r){return clamp(r.massEducation?.literacy??r.publicEducation?.literacy??r.education?.literacy??r.educationLevel??0);}
function printReach(r){return clamp(r.earlyModernReform?.printDensity??r.renaissance?.informationDensity??0);}
function hasTech(r,id){return Boolean(r.unlockedTechIds?.has?.(id));}
function communications(r){return clamp((hasTech(r,'electrical_telegraphy')?.28:0)+(hasTech(r,'telephone_networks')?.18:0)+(hasTech(r,'printing_press')?.18:0)+printReach(r)*.20);}
function visualMedia(r){return clamp((hasTech(r,'photography')?.34:0)+(hasTech(r,'motion_picture')?.22:0)+(hasTech(r,'radio_broadcasting')?.20:0));}
function underArms(r){return Math.max(0,Number(r.army?.personnel)||0)+Math.max(0,Number(r.army?.away)||0)+Math.max(0,Number(r.navy?.personnel)||0);}
function reportCasualtySignal(r){return clamp((r.report?.conflict?.recentCasualties??r.report?.military?.recentCasualties??0)/Math.max(1,Number(r.population)||1)*60);}
function hardship(r){return clamp(r.employment?.hardship??r.popularWellbeing?.grievance??0);}
function warPressure(r){return clamp(r.report?.conflict?.pressure??r.conflictPressure??0);}
function artilleryTrauma(r){const t=r.modernTactics||{};const exposure=clamp(t.machineGunExposure||0);const shell=clamp(r.report?.conflict?.artilleryIntensity??r.report?.military?.artilleryIntensity??0);return clamp(shell*.6+exposure*.4);}
function participant(war,actorId){return war?.participants?.find?.(p=>p.actorId===actorId)||null;}
function polityCampaignBurden(polity,regions,activeCampaigns=[]){
  const byId=new Map((regions||[]).map(r=>[r.id,r]));let militaryCasualties=0,civilianDeaths=0,weeks=0,artilleryExposure=0;
  for(const c of activeCampaigns||[]){
    const attacker=byId.get(c.attackerId),defender=byId.get(c.defenderId);const attackerMine=polityId(attacker)===polity.id,defenderMine=polityId(defender)===polity.id;if(!attackerMine&&!defenderMine)continue;
    militaryCasualties+=attackerMine?Number(c.attackerCasualties)||0:Number(c.defenderCasualties)||0;civilianDeaths+=defenderMine?Number(c.civilianDeaths)||0:0;weeks+=Number(c.weeksEngaged)||0;
    const artillery=Number(c.lastWeek?.artilleryFireControl?.targetingQuality??c.lastWeek?.modernArtillery?.combatMultiplier??0);artilleryExposure+=clamp(artillery/2);
  }
  const population=Math.max(1,territories(polity,regions).reduce((n,r)=>n+(Number(r.population)||0),0));
  return{casualtySignal:clamp((militaryCasualties+civilianDeaths*.1)/population*18),civilianSignal:clamp(civilianDeaths/population*30),durationSignal:clamp(weeks/156),artillerySignal:clamp(artilleryExposure/Math.max(1,(activeCampaigns||[]).length))};
}

export function ensureWarSociety(polity){
  polity.warSociety||={};const s=polity.warSociety;s.version=1;s.policy||={};
  if(!WAR_INFORMATION_POLICIES[s.policy.information])s.policy.information='accredited';
  if(typeof s.policy.playerLocked!=='boolean')s.policy.playerLocked=false;
  for(const [k,v] of Object.entries({warWeariness:0,combatTraumaBurden:0,publicWarKnowledge:0,warLegitimacy:.5,censorshipPressure:0,credibility:.78,concealedReality:0,mobilisationMemory:0,publicShock:0}))if(!Number.isFinite(s[k]))s[k]=v;
  s.civilianReportState||={};
  return s;
}

export function setWarInformationPolicy(polity,policy,{playerIssued=false}={}){
  if(!WAR_INFORMATION_POLICIES[policy])return{changed:false,reason:'unknown_policy'};
  const s=ensureWarSociety(polity),previous=s.policy.information;s.policy.information=policy;if(playerIssued)s.policy.playerLocked=true;return{changed:previous!==policy,previous,policy};
}

function publishCivilianHarmReports(polity,regions,activeCampaigns,currentTick,s){
  const byId=new Map((regions||[]).map(r=>[r.id,r]));
  const policy=WAR_INFORMATION_POLICIES[s.policy.information];
  for(const campaign of activeCampaigns||[]){
    const defender=byId.get(campaign.defenderId),attacker=byId.get(campaign.attackerId);
    if(!defender||polityId(defender)!==polity.id)continue;
    const deaths=Math.max(0,Math.round(Number(campaign.civilianDeaths)||0));
    if(deaths<=0)continue;
    const key=String(campaign.id);
    const prior=s.civilianReportState[key]||{reportedDeaths:0,lastEvidenceTick:-Infinity,incidentId:null};
    if(deaths<=prior.reportedDeaths)continue;
    const info=ensureInformationIntegrity(defender);
    const mediaReach=clamp(literacy(defender)*.34+communications(defender)*.34+visualMedia(defender)*.32);
    const visibility=clamp(.12+policy.visibility*.55+mediaReach*.33);
    const reliability=clamp(.36+visibility*.36+info.independentCorroboration*.18);
    const attackerActor=polityId(attacker);
    if(!prior.incidentId){
      const incident=recordInformationIncident(defender,{
        id:`war-civilian-harm-${campaign.id}`,
        type:'civilian_harm',
        headline:`Reports of civilian deaths during fighting in ${defender.name||'the region'}`,
        tick:currentTick,receivedTick:currentTick,subjectRegionId:defender.id,
        allegedActorId:attackerActor,
        evidenceType:visualMedia(defender)>.25?'mixed':'report',
        sourceReliability:reliability,
        corroboration:clamp(.14+visibility*.32),
        provenance:clamp(info.provenanceCoverage*.45+visibility*.12),
        forensicSupport:clamp(info.mediaForensics*.38),
        attributionEvidence:attackerActor?.72:.18,
        evidence:[{
          sourceId:`local-war-report-${defender.id}`,
          sourceType:'local_reporting',
          evidenceType:visualMedia(defender)>.25?'image':'report',
          sourceReliability:reliability,
          provenance:clamp(info.provenanceCoverage*.48),
          forensicSupport:clamp(info.mediaForensics*.36),
          forensicPotential:visualMedia(defender)>.25?.72:.40,
          attributionEvidence:attackerActor?.72:.18,
          receivedTick:currentTick,
        }],
      });
      prior.incidentId=incident.id;
      if(attackerActor)publishCompetingNarrative(defender,incident.id,{kind:'denial_responsibility',reach:.38,sourceReliability:.42,evidenceSupport:.12,publishedTick:currentTick});
      if(info.syntheticMediaPressure>.30)publishCompetingNarrative(defender,incident.id,{kind:'denial_synthetic',reach:clamp(.16+info.syntheticMediaPressure*.42),sourceReliability:.35,evidenceSupport:.06,publishedTick:currentTick});
    }else if(currentTick-prior.lastEvidenceTick>=4||deaths>=Math.max(2,prior.reportedDeaths*1.5)){
      addInformationEvidence(defender,prior.incidentId,{
        sourceId:`followup-${defender.id}-${currentTick}`,
        sourceType:'followup_reporting',evidenceType:visualMedia(defender)>.25?'image':'report',
        sourceReliability:reliability,provenance:clamp(info.provenanceCoverage*.52),
        forensicSupport:clamp(info.mediaForensics*.42),forensicPotential:visualMedia(defender)>.25?.78:.45,
        attributionEvidence:attackerActor?.72:.18,receivedTick:currentTick,
      });
    }
    prior.reportedDeaths=deaths;prior.lastEvidenceTick=currentTick;s.civilianReportState[key]=prior;
  }
}

export function assessWarSociety(polity,regions,activeWars=[],activeCampaigns=[]){
  const rs=territories(polity,regions);if(!rs.length)return{};const s=ensureWarSociety(polity);const info=WAR_INFORMATION_POLICIES[s.policy.information];
  const pop=rs.reduce((n,r)=>n+Math.max(1,Number(r.population)||1),0);const working=Math.max(1,rs.reduce((n,r)=>n+(Number(r.demographics?.workingAge)||Number(r.population||0)*.55),0));
  const arms=rs.reduce((n,r)=>n+underArms(r),0);const mobilisation=clamp(arms/working*3.2);const campaign=polityCampaignBurden(polity,regions,activeCampaigns);const casualties=Math.max(avg(rs,reportCasualtySignal),campaign.casualtySignal);const conflict=avg(rs,warPressure);const poverty=avg(rs,hardship);const trauma=clamp(Math.max(avg(rs,artilleryTrauma),campaign.artillerySignal*.7)+campaign.durationSignal*.18+campaign.civilianSignal*.08);
  const mediaReach=clamp(avg(rs,literacy)*.36+avg(rs,communications)*.34+avg(rs,visualMedia)*.30);
  const wars=(activeWars||[]).filter(w=>w.active!==false&&participant(w,polity.id));
  const defensive=wars.some(w=>participant(w,polity.id)?.warAim==='defend');
  const existential=clamp(rs.some(r=>warPressure(r)>.8)?1:0);
  const battlefieldSuccess=clamp(avg(rs,r=>r.report?.conflict?.momentum??.5));
  const legitimacy=clamp(.30+(defensive?.26:0)+existential*.22+battlefieldSuccess*.12-poverty*.12-casualties*.10);
  const reality=clamp(casualties*.26+mobilisation*.18+conflict*.16+poverty*.12+trauma*.20+campaign.civilianSignal*.08);
  const visible=clamp(reality*mediaReach*info.visibility + mobilisation*.08);
  const concealed=clamp(reality-visible);
  const weariness=clamp(reality*.60+visible*.18+s.mobilisationMemory*.10+campaign.durationSignal*.12-legitimacy*.35);
  const traumaTarget=clamp(trauma*.44+casualties*.20+conflict*.16+mobilisation*.08+campaign.durationSignal*.12);
  return{population:pop,mobilisation,casualties,conflict,poverty,traumaTarget,mediaReach,legitimacy,reality,visible,concealed,weariness,campaignDuration:campaign.durationSignal};
}

export function tickWarSociety(polities,regions,activeWars,currentTick=0,elapsedDays=7,{playerPolityId=null,activeCampaigns=[]}={}){
  const events=[];for(const polity of polities||[]){const s=ensureWarSociety(polity),a=assessWarSociety(polity,regions,activeWars,activeCampaigns);if(!Number.isFinite(a.weariness))continue;const info=WAR_INFORMATION_POLICIES[s.policy.information];
    publishCivilianHarmReports(polity,regions,activeCampaigns,currentTick,s);
    s.warLegitimacy=smooth(s.warLegitimacy,a.legitimacy,elapsedDays,.9);s.publicWarKnowledge=smooth(s.publicWarKnowledge,a.visible,elapsedDays,1.4);s.combatTraumaBurden=smooth(s.combatTraumaBurden,a.traumaTarget,elapsedDays,a.traumaTarget>s.combatTraumaBurden?1.2:.18);s.mobilisationMemory=smooth(s.mobilisationMemory,a.mobilisation,elapsedDays,a.mobilisation>s.mobilisationMemory?.8:.14);
    s.concealedReality=smooth(s.concealedReality,a.concealed,elapsedDays,1.1);s.censorshipPressure=clamp(info.control*a.mediaReach);const credibilityTarget=clamp(.86-info.credibilityRisk*s.concealedReality*.9);s.credibility=smooth(s.credibility,credibilityTarget,elapsedDays,.55);
    const revelation=clamp(Math.max(0,s.publicWarKnowledge-s.concealedReality*.15)*Math.max(0,.62-s.credibility));s.publicShock=smooth(s.publicShock,revelation,elapsedDays,1.3);
    s.warWeariness=smooth(s.warWeariness,clamp(a.weariness+s.publicShock*.28),elapsedDays,1.1);
    if(s.warWeariness>.65&&currentTick-(s.lastWearinessEventTick||-1e9)>26){s.lastWearinessEventTick=currentTick;events.push({type:'war_weariness_crisis',polityId:polity.id,weariness:s.warWeariness,legitimacy:s.warLegitimacy,playerRelevant:polity.id===playerPolityId});}
    if(s.publicShock>.45&&currentTick-(s.lastCredibilityEventTick||-1e9)>26){s.lastCredibilityEventTick=currentTick;events.push({type:'wartime_credibility_crisis',polityId:polity.id,credibility:s.credibility,playerRelevant:polity.id===playerPolityId});}
  }return events;
}

export function warSocietySummary(polity){const s=ensureWarSociety(polity);return{informationPolicy:s.policy.information,informationLabel:WAR_INFORMATION_POLICIES[s.policy.information].label,warWeariness:s.warWeariness,combatTraumaBurden:s.combatTraumaBurden,publicWarKnowledge:s.publicWarKnowledge,warLegitimacy:s.warLegitimacy,credibility:s.credibility,publicShock:s.publicShock};}
