const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const WAR_INFORMATION_POLICIES=Object.freeze({
  open:{id:'open',label:'Open war reporting',visibility:1,control:0.02,credibilityRisk:0},
  accredited:{id:'accredited',label:'Accredited correspondents',visibility:0.78,control:0.18,credibilityRisk:0.05},
  censored:{id:'censored',label:'Military censorship',visibility:0.50,control:0.42,credibilityRisk:0.16},
  strict:{id:'strict',label:'Strict wartime censorship',visibility:0.26,control:0.68,credibilityRisk:0.32},
  total:{id:'total',label:'Total information control',visibility:0.10,control:0.86,credibilityRisk:0.52},
});

function polityId(r){return r?.governance?.sovereignPolityId||r?.polityId||null;}
function territories(polity,regions){return (regions||[]).filter(r=>polityId(r)===polity.id);}
function avg(rs,fn){let w=0,s=0;for(const r of rs){const p=Math.max(1,Number(r.population)||1);w+=p;s+=clamp(fn(r))*p;}return w?s/w:0;}
function smooth(current,target,days,rate=1){const years=Math.max(0,Number(days)||0)/DAYS_PER_YEAR;const k=1-Math.exp(-rate*years);return clamp((Number(current)||0)+(target-(Number(current)||0))*k);}
function literacy(r){return clamp(r.massEducation?.literacy??r.publicEducation?.literacy??r.education?.literacy??r.educationLevel??0);}
function printReach(r){return clamp(r.earlyModernReform?.printDensity??r.renaissance?.informationDensity??0);}
function communications(r){return clamp((r.unlockedTechIds?.has?.('electrical_telegraphy')?.28:0)+(r.unlockedTechIds?.has?.('telephone_networks')?.18:0)+(r.unlockedTechIds?.has?.('printing_press')?.18:0)+printReach(r)*.20);}
function visualMedia(r){return clamp((r.unlockedTechIds?.has?.('photography')?.34:0)+(r.unlockedTechIds?.has?.('motion_picture')?.22:0)+(r.unlockedTechIds?.has?.('radio_broadcasting')?.20:0));}
function underArms(r){return Math.max(0,Number(r.army?.personnel)||0)+Math.max(0,Number(r.navy?.personnel)||0);}
function casualtySignal(r){return clamp((r.report?.conflict?.recentCasualties??r.report?.military?.recentCasualties??0)/Math.max(1,Number(r.population)||1)*60);}
function hardship(r){return clamp(r.employment?.hardship??r.popularWellbeing?.grievance??0);}
function warPressure(r){return clamp(r.report?.conflict?.pressure??r.conflictPressure??0);}
function artilleryTrauma(r){const t=r.modernTactics||{};const exposure=clamp(t.machineGunExposure||0);const shell=clamp(r.report?.conflict?.artilleryIntensity??r.report?.military?.artilleryIntensity??0);return clamp(shell*.6+exposure*.4);}

export function ensureWarSociety(polity){
  polity.warSociety||={};const s=polity.warSociety;s.version=1;s.policy||={};
  if(!WAR_INFORMATION_POLICIES[s.policy.information])s.policy.information='accredited';
  if(typeof s.policy.playerLocked!=='boolean')s.policy.playerLocked=false;
  for(const [k,v] of Object.entries({warWeariness:0,combatTraumaBurden:0,publicWarKnowledge:0,warLegitimacy:.5,censorshipPressure:0,credibility:.78,concealedReality:0,mobilisationMemory:0,publicShock:0}))if(!Number.isFinite(s[k]))s[k]=v;
  return s;
}

export function setWarInformationPolicy(polity,policy,{playerIssued=false}={}){
  if(!WAR_INFORMATION_POLICIES[policy])return{changed:false,reason:'unknown_policy'};
  const s=ensureWarSociety(polity),previous=s.policy.information;s.policy.information=policy;if(playerIssued)s.policy.playerLocked=true;return{changed:previous!==policy,previous,policy};
}

export function assessWarSociety(polity,regions,activeWars=[]){
  const rs=territories(polity,regions);if(!rs.length)return{};const s=ensureWarSociety(polity);const info=WAR_INFORMATION_POLICIES[s.policy.information];
  const pop=rs.reduce((n,r)=>n+Math.max(1,Number(r.population)||1),0);const working=Math.max(1,rs.reduce((n,r)=>n+(Number(r.demographics?.workingAge)||Number(r.population||0)*.55),0));
  const arms=rs.reduce((n,r)=>n+underArms(r),0);const mobilisation=clamp(arms/working*3.2);const casualties=avg(rs,casualtySignal);const conflict=avg(rs,warPressure);const poverty=avg(rs,hardship);const trauma=avg(rs,artilleryTrauma);
  const mediaReach=clamp(avg(rs,literacy)*.36+avg(rs,communications)*.34+avg(rs,visualMedia)*.30);
  const wars=(activeWars||[]).filter(w=>w.active!==false&&(w.participantPolityIds?.includes?.(polity.id)||w.attackerPolityId===polity.id||w.defenderPolityId===polity.id));
  const defensive=wars.some(w=>w.defenderPolityId===polity.id||w.defenders?.includes?.(polity.id));
  const existential=clamp(rs.some(r=>warPressure(r)>.8)?1:0);
  const battlefieldSuccess=clamp(avg(rs,r=>r.report?.conflict?.momentum??.5));
  const legitimacy=clamp(.30+defensive*.26+existential*.22+battlefieldSuccess*.12-poverty*.12-casualties*.10);
  const reality=clamp(casualties*.28+mobilisation*.20+conflict*.18+poverty*.14+trauma*.20);
  const visible=clamp(reality*mediaReach*info.visibility + mobilisation*.08);
  const concealed=clamp(reality-visible);
  const weariness=clamp(reality*.63+visible*.20+s.mobilisationMemory*.10-legitimacy*.35);
  const traumaTarget=clamp(trauma*.42+casualties*.22+conflict*.20+mobilisation*.10);
  return{population:pop,mobilisation,casualties,conflict,poverty,traumaTarget,mediaReach,legitimacy,reality,visible,concealed,weariness};
}

export function tickWarSociety(polities,regions,activeWars,currentTick=0,elapsedDays=7,{playerPolityId=null}={}){
  const events=[];for(const polity of polities||[]){const s=ensureWarSociety(polity),a=assessWarSociety(polity,regions,activeWars);if(!Number.isFinite(a.weariness))continue;const info=WAR_INFORMATION_POLICIES[s.policy.information];
    s.warLegitimacy=smooth(s.warLegitimacy,a.legitimacy,elapsedDays,.9);s.publicWarKnowledge=smooth(s.publicWarKnowledge,a.visible,elapsedDays,1.4);s.combatTraumaBurden=smooth(s.combatTraumaBurden,a.traumaTarget,elapsedDays,a.traumaTarget>s.combatTraumaBurden?1.2:.18);s.mobilisationMemory=smooth(s.mobilisationMemory,a.mobilisation,elapsedDays,a.mobilisation>s.mobilisationMemory?.8:.14);
    s.concealedReality=smooth(s.concealedReality,a.concealed,elapsedDays,1.1);s.censorshipPressure=clamp(info.control*a.mediaReach);const credibilityTarget=clamp(.86-info.credibilityRisk*s.concealedReality*.9);const prior=s.credibility;s.credibility=smooth(s.credibility,credibilityTarget,elapsedDays,.55);
    const revelation=clamp(Math.max(0,s.publicWarKnowledge-s.concealedReality*.15)*Math.max(0,.62-s.credibility));s.publicShock=smooth(s.publicShock,revelation,elapsedDays,1.3);
    s.warWeariness=smooth(s.warWeariness,clamp(a.weariness+s.publicShock*.28),elapsedDays,1.1);
    if(s.warWeariness>.65&&currentTick-(s.lastWearinessEventTick||-1e9)>26){s.lastWearinessEventTick=currentTick;events.push({type:'war_weariness_crisis',polityId:polity.id,weariness:s.warWeariness,legitimacy:s.warLegitimacy,playerRelevant:polity.id===playerPolityId});}
    if(s.publicShock>.45&&currentTick-(s.lastCredibilityEventTick||-1e9)>26){s.lastCredibilityEventTick=currentTick;events.push({type:'wartime_credibility_crisis',polityId:polity.id,credibility:s.credibility,playerRelevant:polity.id===playerPolityId});}
  }return events;
}

export function warSocietySummary(polity){const s=ensureWarSociety(polity);return{informationPolicy:s.policy.information,informationLabel:WAR_INFORMATION_POLICIES[s.policy.information].label,warWeariness:s.warWeariness,combatTraumaBurden:s.combatTraumaBurden,publicWarKnowledge:s.publicWarKnowledge,warLegitimacy:s.warLegitimacy,credibility:s.credibility,publicShock:s.publicShock};}
