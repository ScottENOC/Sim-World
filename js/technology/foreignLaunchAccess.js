import { attitudeToward, changeAttitude } from '../diplomacy/relations.js?v=20260921-space-access1';
import { bestLaunchSite, launchSiteScore } from './spaceLaunchGeography.js?v=20260921-space-cooperation1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const polityId=r=>r?.governance?.sovereignPolityId||r?.polityId||r?.id;

export const SPACE_MISSION_SENSITIVITY=Object.freeze({
  routine:0,
  scientific:.12,
  commercial:.08,
  strategic:.55,
  prestige:.72,
  historic_first:.92,
});

function programmeRegion(members){return members.filter(r=>r.spaceProgramme).sort((a,b)=>(b.spaceProgramme?.completedMilestones?.length||0)-(a.spaceProgramme?.completedMilestones?.length||0))[0]||members[0];}
function groupedPolities(regions){const out=new Map();for(const r of regions||[]){const id=polityId(r);if(!out.has(id))out.set(id,[]);out.get(id).push(r);}return out;}

export function missionSensitivity(mission={}){
  if(mission.worldFirst===true)return SPACE_MISSION_SENSITIVITY.historic_first;
  if(mission.prestigeRace===true)return SPACE_MISSION_SENSITIVITY.prestige;
  return SPACE_MISSION_SENSITIVITY[mission.kind]??SPACE_MISSION_SENSITIVITY.routine;
}

export function assessForeignLaunchAccess(requesterCarrier,hostCarrier,mission={}){
  if(!requesterCarrier||!hostCarrier)return{allowed:false,reason:'missing_party'};
  if(polityId(requesterCarrier)===polityId(hostCarrier))return{allowed:true,reason:'domestic'};
  const attitude=attitudeToward(hostCarrier,requesterCarrier.id);
  const sensitivity=missionSensitivity(mission);
  const hostStrategy=hostCarrier.spaceProgramme?.strategy||'competitive';
  const requesterStrategy=requesterCarrier.spaceProgramme?.strategy||'competitive';
  const partnership=Boolean(hostCarrier.spaceProgramme?.cooperation?.partners?.some?.(p=>p.polityId===polityId(requesterCarrier))||requesterCarrier.spaceProgramme?.cooperation?.partners?.some?.(p=>p.polityId===polityId(hostCarrier)));
  let threshold=-.15+sensitivity*.95;
  if(partnership)threshold-=.35;
  if(hostStrategy==='cooperative')threshold-=.16;
  if(hostStrategy==='security_focused')threshold+=.22;
  if(requesterStrategy==='security_focused'&&sensitivity>.4)threshold+=.12;
  const rivalry=hostStrategy==='competitive'&&sensitivity>=SPACE_MISSION_SENSITIVITY.prestige;
  if(rivalry&&!partnership)return{allowed:false,reason:'prestige_rivalry',attitude,sensitivity,threshold};
  const allowed=attitude>=threshold;
  return{allowed,reason:allowed?'accepted':'insufficient_trust',attitude,sensitivity,threshold,partnership};
}

export function bestAccessibleLaunchSite(requesterMembers,allRegions,mission={}){
  const requesterCarrier=programmeRegion(requesterMembers);if(!requesterCarrier)return null;
  let best={region:bestLaunchSite(requesterMembers),hostCarrier:requesterCarrier,foreign:false,access:{allowed:true,reason:'domestic'}};
  let bestScore=best.region?launchSiteScore(best.region):-Infinity;
  for(const [,members] of groupedPolities(allRegions)){
    const hostCarrier=programmeRegion(members);if(!hostCarrier||polityId(hostCarrier)===polityId(requesterCarrier))continue;
    const access=assessForeignLaunchAccess(requesterCarrier,hostCarrier,mission);if(!access.allowed)continue;
    const candidate=bestLaunchSite(members);if(!candidate)continue;
    const score=launchSiteScore(candidate)-.015; // small coordination/friction cost for foreign operations
    if(score<=bestScore)continue;
    best={region:candidate,hostCarrier,foreign:true,access};bestScore=score;
  }
  return best;
}

export function recordForeignLaunch(hostCarrier,requesterCarrier,mission={},currentTick=null){
  if(!hostCarrier||!requesterCarrier||polityId(hostCarrier)===polityId(requesterCarrier))return;
  const sensitivity=missionSensitivity(mission);
  const goodwill=clamp(.008+(1-sensitivity)*.012,0,.02);
  changeAttitude(requesterCarrier,hostCarrier.id,goodwill,'foreign_space_launch_access',currentTick);
  changeAttitude(hostCarrier,requesterCarrier.id,goodwill*.55,'foreign_space_launch_access',currentTick);
  hostCarrier.spaceProgramme||={};hostCarrier.spaceProgramme.launchServices||={hosted:0,rejected:0};hostCarrier.spaceProgramme.launchServices.hosted+=1;
}

export function recordForeignLaunchRefusal(hostCarrier,requesterCarrier,reason,currentTick=null){
  if(!hostCarrier||!requesterCarrier)return;
  hostCarrier.spaceProgramme||={};hostCarrier.spaceProgramme.launchServices||={hosted:0,rejected:0};hostCarrier.spaceProgramme.launchServices.rejected+=1;
  if(reason==='prestige_rivalry')changeAttitude(requesterCarrier,hostCarrier.id,-.01,'space_launch_refused_for_rivalry',currentTick);
}
