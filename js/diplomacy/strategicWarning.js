import { addInformationEvidence, ensureInformationIntegrity, publishCompetingNarrative, recordInformationIncident } from './informationIntegrity.js?v=20260922-info4';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const STRATEGIC_WARNING_TYPES = Object.freeze({
  MISSILE_LAUNCH: 'missile_launch',
  BORDER_INCIDENT: 'border_incident',
  NAVAL_INCIDENT: 'naval_incident',
  AIRSPACE_INCURSION: 'airspace_incursion',
  SENSOR_ANOMALY: 'sensor_anomaly',
});

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||region?.id||null;}
function headline(type, regionName){
  const where=regionName?` near ${regionName}`:'';
  return ({
    missile_launch:`Strategic sensors report a possible missile launch${where}`,
    border_incident:`Reports of an armed border incident${where}`,
    naval_incident:`Reports of a disputed naval encounter${where}`,
    airspace_incursion:`Reports of a disputed airspace incursion${where}`,
    sensor_anomaly:`Strategic warning sensors report an anomalous contact${where}`,
  })[type]||`Ambiguous military warning reported${where}`;
}

export function ensureStrategicWarningState(region){
  region.strategicWarning||={};
  const s=region.strategicWarning;
  if(!Array.isArray(s.incidents))s.incidents=[];
  if(!Array.isArray(s.pendingSignals))s.pendingSignals=[];
  if(!Number.isFinite(s.nextIncidentId))s.nextIncidentId=1;
  if(!Number.isFinite(s.falseAlarmCount))s.falseAlarmCount=0;
  if(!Number.isFinite(s.lastAutomaticWarningTick))s.lastAutomaticWarningTick=-Infinity;
  return s;
}

function publicEvidence(details,currentTick){
  const evidenceType=details.evidenceType||'sensor';
  const sourceReliability=clamp(details.sourceReliability??details.sensorConfidence??.55);
  const provenance=clamp(details.provenance??.52);
  const corroboration=clamp(details.corroboration??.12);
  const forensicSupport=clamp(details.forensicSupport??.18);
  const attributionEvidence=clamp(details.attributionEvidence??(details.allegedActorId?.35:.08));
  return {evidenceType,sourceReliability,provenance,corroboration,forensicSupport,attributionEvidence,
    evidence:[{
      sourceId:details.sourceId||`warning-sensor-${currentTick}`,
      sourceType:details.sourceType||'strategic_sensor',
      evidenceType,
      sourceReliability,
      provenance,
      corroboration,
      forensicSupport,
      forensicPotential:clamp(details.forensicPotential??.68),
      attributionEvidence,
      receivedTick:currentTick,
    }]};
}

export function recordStrategicWarning(observerRegion,details={},currentTick=0){
  if(!observerRegion)return null;
  const s=ensureStrategicWarningState(observerRegion);
  const id=details.id||`strategic-warning-${observerRegion.id}-${s.nextIncidentId++}`;
  const type=details.type||STRATEGIC_WARNING_TYPES.SENSOR_ANOMALY;
  const internal={
    id,type,observerRegionId:observerRegion.id,observerPolityId:polityId(observerRegion),
    actualThreat:typeof details.actualThreat==='boolean'?details.actualThreat:null,
    actualActorId:details.actualActorId||null,
    allegedActorId:details.allegedActorId||null,
    subjectRegionId:details.subjectRegionId||observerRegion.id,
    createdTick:currentTick,status:'unresolved',resolution:null,
    sensorConfidence:clamp(details.sensorConfidence??details.sourceReliability??.55),
    publicClaimId:null,
  };
  const ev=publicEvidence(details,currentTick);
  const publicClaim=recordInformationIncident(observerRegion,{
    id:`public-${id}`,
    type:`strategic_warning_${type}`,
    headline:details.headline||headline(type,details.subjectRegionName||observerRegion.name),
    tick:currentTick,receivedTick:currentTick,
    subjectRegionId:internal.subjectRegionId,
    allegedActorId:details.allegedActorId||null,
    ...ev,
  });
  internal.publicClaimId=publicClaim?.id||null;
  s.incidents.push(internal);
  if(s.incidents.length>60)s.incidents.shift();

  if(publicClaim?.id){
    if((details.corroboration??.12)<.35){
      publishCompetingNarrative(observerRegion,publicClaim.id,{kind:'sensor_fault',reach:.46,sourceReliability:.48,evidenceSupport:.20,publishedTick:currentTick});
      publishCompetingNarrative(observerRegion,publicClaim.id,{kind:'misidentification',reach:.34,sourceReliability:.50,evidenceSupport:.18,publishedTick:currentTick});
    }
    if(details.allegedActorId){
      publishCompetingNarrative(observerRegion,publicClaim.id,{kind:'denial_actor',actorId:details.allegedActorId,reach:.42,sourceReliability:.43,evidenceSupport:.12,publishedTick:currentTick});
    }
  }
  return internal;
}

export function addStrategicWarningEvidence(observerRegion,warningId,evidence={},currentTick=0){
  const s=ensureStrategicWarningState(observerRegion);
  const incident=s.incidents.find(i=>i.id===warningId);
  if(!incident?.publicClaimId)return null;
  return addInformationEvidence(observerRegion,incident.publicClaimId,{...evidence,receivedTick:evidence.receivedTick??currentTick});
}

export function resolveStrategicWarning(observerRegion,warningId,resolution={},currentTick=0){
  const s=ensureStrategicWarningState(observerRegion);
  const incident=s.incidents.find(i=>i.id===warningId);
  if(!incident)return null;
  incident.status='resolved';
  incident.resolution=resolution.kind||'resolved';
  incident.resolvedTick=currentTick;
  if(incident.publicClaimId&&resolution.publicEvidence){
    addInformationEvidence(observerRegion,incident.publicClaimId,{...resolution.publicEvidence,receivedTick:currentTick});
  }
  return incident;
}

export function queueStrategicSignal(observerRegion,signal={}){
  const s=ensureStrategicWarningState(observerRegion);
  s.pendingSignals.push({...signal});
  return s.pendingSignals.length;
}

export function recordMilitaryProvocation(observerRegion,details={},currentTick=0){
  const type=details.type||STRATEGIC_WARNING_TYPES.BORDER_INCIDENT;
  return recordStrategicWarning(observerRegion,{...details,type,
    evidenceType:details.evidenceType||'mixed',
    sourceType:details.sourceType||'military_observer',
    sourceReliability:details.sourceReliability??.58,
    corroboration:details.corroboration??.20,
    forensicPotential:details.forensicPotential??.55,
  },currentTick);
}

function automaticFalseAlarmProbability(region,elapsedDays){
  const risk=region.nuclearRisk||{};
  if(!risk.nuclearPower)return 0;
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const policy=risk.policy||{};
  const alert=({low:.10,normal:.28,high:.62,hair_trigger:1})[policy.alertPosture]??.28;
  const warning=clamp(policy.earlyWarningQuality??.55);
  const filtering=clamp(region.strategicAi?.effects?.falseAlarmFiltering||0);
  const crisis=clamp(risk.crisisPressure||0);
  const annualRate=clamp(.002+.030*alert+.050*crisis+.045*(1-warning)+.035*(1-filtering),0,.16);
  return clamp(1-Math.exp(-annualRate*years));
}

export function tickStrategicWarnings(regions,currentTick=0,elapsedDays=7,rng=Math.random){
  const events=[];
  for(const region of regions||[]){
    const s=ensureStrategicWarningState(region);
    while(s.pendingSignals.length){
      const signal=s.pendingSignals.shift();
      const incident=recordStrategicWarning(region,signal,signal.tick??currentTick);
      if(incident)events.push({type:'strategic_warning',regionId:region.id,polityId:polityId(region),warningId:incident.id,warningType:incident.type,tick:signal.tick??currentTick});
    }
    const p=automaticFalseAlarmProbability(region,elapsedDays);
    const cooldown=currentTick-s.lastAutomaticWarningTick>=4;
    if(p>0&&cooldown&&(rng?.()??Math.random())<p){
      const risk=region.nuclearRisk||{};
      const quality=clamp(risk.policy?.earlyWarningQuality??.55);
      const filtering=clamp(region.strategicAi?.effects?.falseAlarmFiltering||0);
      const incident=recordStrategicWarning(region,{
        type:STRATEGIC_WARNING_TYPES.MISSILE_LAUNCH,
        actualThreat:false,
        sensorConfidence:clamp(.30+.30*quality-.16*filtering),
        sourceReliability:clamp(.40+.28*quality),
        provenance:clamp(.58+.22*quality),
        corroboration:clamp(.05+.10*quality),
        forensicSupport:clamp(.12+.20*filtering),
        forensicPotential:.82,
        headline:'Early-warning system reports a possible incoming missile attack',
      },currentTick);
      s.falseAlarmCount++;
      s.lastAutomaticWarningTick=currentTick;
      events.push({type:'strategic_warning_alert',regionId:region.id,polityId:polityId(region),warningId:incident.id,warningType:incident.type,tick:currentTick,
        title:'Ambiguous strategic warning',message:'Early-warning systems have reported a possible incoming attack, but the indication is not yet independently confirmed.'});
    }
    region.report||={};
    region.report.strategicWarning=strategicWarningSummary(region);
  }
  return events;
}

export function strategicWarningSummary(region){
  const s=ensureStrategicWarningState(region);
  return {
    unresolved:s.incidents.filter(i=>i.status==='unresolved').slice(-8).map(i=>({
      id:i.id,type:i.type,createdTick:i.createdTick,allegedActorId:i.allegedActorId,publicClaimId:i.publicClaimId,sensorConfidence:i.sensorConfidence,
    })),
    recent:s.incidents.slice(-12).map(i=>({id:i.id,type:i.type,status:i.status,createdTick:i.createdTick,resolvedTick:i.resolvedTick??null,allegedActorId:i.allegedActorId,publicClaimId:i.publicClaimId})),
    falseAlarmCount:s.falseAlarmCount,
  };
}
