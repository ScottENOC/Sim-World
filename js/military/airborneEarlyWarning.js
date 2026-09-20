const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const AIRBORNE_EARLY_WARNING_TECH_ID='airborne_early_warning';

export function airborneEarlyWarningFrontier(region){
  const c=region?.industrialPlants?.componentCapability||{};
  const radar=clamp(c.radar_set||0),electronics=clamp(c.electronics||0),radio=clamp(c.radio_navigation||electronics),precision=clamp(region?.industrialSupply?.capability?.precision_machining||0);
  const electric=clamp(region?.electricity?.industrialService||region?.electricity?.service||0);
  return {
    radarPower:clamp(.18+radar*.58+electronics*.12+electric*.12),
    radarRange:clamp(.12+radar*.52+radio*.16+precision*.10),
    tracking:clamp(.10+electronics*.42+radar*.28+radio*.14+precision*.06),
    commandAndControl:clamp(.10+radio*.42+electronics*.34+radar*.08),
    endurance:clamp(.28+(c.aircraft_engine||c.engine||0)*.30+precision*.12),
    powerBurden:clamp(.46+radar*.22+electronics*.12),
  };
}

export function canBuildAirborneEarlyWarning(region){
  if(!has(region,AIRBORNE_EARLY_WARNING_TECH_ID))return{available:false,reason:'aew_not_understood'};
  const f=airborneEarlyWarningFrontier(region);
  if(f.radarPower<.42||f.commandAndControl<.34)return{available:false,reason:'radar_or_comms_insufficient',frontier:f};
  return{available:true,frontier:f};
}

export function airborneEarlyWarningSupport(region,fleetId=null){
  const aircraft=(region?.aviation?.aircraft||[]).filter(a=>a.status!=='destroyed'&&a.ownerType==='military'&&a.role==='airborne_early_warning'&&(a.condition??1)>=.42&&(!fleetId||a.baseFleetId===fleetId));
  if(!aircraft.length)return{available:false,count:0,radarCoverage:0,tracking:0,commandAndControl:0};
  let radarCoverage=0,tracking=0,commandAndControl=0;
  for(const a of aircraft){const s=a.aewSystems||airborneEarlyWarningFrontier(region),ready=clamp((a.condition??1)*.6+(a.pilotExperience||0)*.15+.25);radarCoverage+=s.radarRange*ready;tracking+=s.tracking*ready;commandAndControl+=s.commandAndControl*ready;}
  const n=aircraft.length;
  return{available:true,count:n,radarCoverage:clamp(radarCoverage/Math.sqrt(n)),tracking:clamp(tracking/n),commandAndControl:clamp(commandAndControl/n)};
}
