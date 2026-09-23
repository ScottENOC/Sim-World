const DAYS_PER_YEAR=365.2425;
const DURABLE_YEARS_REQUIRED=20;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

export const RESOURCE_BOSS_STATES=Object.freeze({
  UNCONTROLLED:'uncontrolled',
  DETERIORATING:'deteriorating',
  STABILISING:'stabilising',
  CONTROLLED:'controlled',
  DEMONSTRATED_DURABLE:'demonstrated_durable',
});

function polityId(region){return region?.governance?.sovereignPolityId||region?.polityId||region?.controllingActorId||region?.id||null;}
function materialActivity(region){
  const c=region?.circularEconomy;if(!c)return 0;
  let total=0;
  for(const key of new Set([...Object.keys(c.inUse||{}),...Object.keys(c.materials||{})])){
    const m=c.materials?.[key]||{};
    total+=Math.log1p(nonNegative(c.inUse?.[key])+nonNegative(c.scrap?.[key])+nonNegative(c.landfill?.[key])+nonNegative(m.added)*8+nonNegative(m.retired)*4+nonNegative(m.recovered)*4);
  }
  return total;
}
function regionWeight(region){return Math.max(.25,Math.log1p(nonNegative(region?.population))/10+materialActivity(region)*.35);}
function activeMaterialRows(region){
  const c=region?.circularEconomy;if(!c)return [];
  return Object.entries(c.materials||{}).filter(([key,m])=>nonNegative(m?.added)>0||nonNegative(m?.retired)>0||nonNegative(m?.recovered)>0||nonNegative(c.inUse?.[key])>0||nonNegative(c.scrap?.[key])>0||nonNegative(c.landfill?.[key])>0||nonNegative(m?.reserveFraction)>0);
}
function weightedAverage(rows,key,fallback=0){
  let total=0,weight=0;
  for(const [,m] of rows){const w=.25+clamp(m?.depletionPressure||0)*.75+clamp(m?.substitutionPotential||0)*.15;total+=clamp(m?.[key]||0)*w;weight+=w;}
  return weight?clamp(total/weight):fallback;
}
function quantile(values,q,fallback=0){
  if(!values.length)return fallback;
  const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*clamp(q),lower=Math.floor(position),upper=Math.ceil(position);
  if(lower===upper)return sorted[lower];
  const mix=position-lower;return sorted[lower]*(1-mix)+sorted[upper]*mix;
}

export function assessRegionalResourceDepletion(region){
  const c=region?.circularEconomy||{};
  const rows=activeMaterialRows(region);
  if(!rows.length)return {active:false,margin:.5,materialSecurity:.5,circularityRate:0,virginDependence:1,criticalSecurityFloor:.5,maxDepletionPressure:0,adaptiveCapacity:0,polymerAlternativeShare:0,controlled:false};
  const materialSecurity=clamp(Number.isFinite(c.materialSecurity)?c.materialSecurity:weightedAverage(rows,'security',.5));
  const circularityRate=clamp(c.circularityRate||0),virginDependence=clamp(c.virginDependence??(1-circularityRate));
  const criticalRows=rows.filter(([,m])=>clamp(m?.depletionPressure||0)>=.12||clamp(m?.security||0)<.62);
  const criticalSecurityFloor=criticalRows.length?Math.min(...criticalRows.map(([,m])=>clamp(m?.security||0))):Math.min(...rows.map(([,m])=>clamp(m?.security||0)));
  const maxDepletionPressure=Math.max(0,...rows.map(([,m])=>clamp(m?.depletionPressure||0)));
  const cap=c.capability||{};
  const adaptiveCapacity=clamp((clamp(cap.closedLoop||0)*.30)+(clamp(cap.urbanMining||0)*.20)+(clamp(cap.substitution||0)*.25)+(clamp(cap.ecodesign||0)*.10)+(clamp(cap.recovery||0)*.15));
  const industrial=region?.industrialMaterials||{};
  const alternative=nonNegative(industrial.cumulativeBiomaterialUse)+nonNegative(industrial.cumulativeConventionalFallback);
  const polymer=nonNegative(industrial.cumulativePolymerUse);
  const polymerAlternativeShare=(alternative+polymer)>0?clamp(alternative/(alternative+polymer)):clamp(c.plasticSubstitution||0);
  const bottleneck=clamp((criticalSecurityFloor-.25)/.55);
  const pressureSafety=clamp(1-maxDepletionPressure/.65);
  const throughputResilience=clamp(materialSecurity*.43+circularityRate*.23+adaptiveCapacity*.18+bottleneck*.10+pressureSafety*.06);
  const existing=clamp(c.durableControlMargin||0);
  const margin=clamp(existing*.35+throughputResilience*.65);
  const controlled=margin>=.68&&materialSecurity>=.60&&criticalSecurityFloor>=.42&&maxDepletionPressure<=.40;
  return {active:true,margin,materialSecurity,circularityRate,virginDependence,criticalSecurityFloor,maxDepletionPressure,adaptiveCapacity,polymerAlternativeShare,controlled};
}

export function assessResourceDepletionScope(regions=[]){
  const assessments=(regions||[]).map(region=>({region,assessment:assessRegionalResourceDepletion(region)})).filter(x=>x.assessment.active);
  if(!assessments.length)return {active:false,margin:.5,materialSecurity:.5,circularityRate:0,virginDependence:1,criticalSecurityFloor:.5,depletionPressure90:.0,adaptiveCapacity:0,polymerAlternativeShare:0,controlledCoverage:0,controlled:false,regionCount:0};
  let weight=0,margin=0,security=0,circularity=0,virgin=0,adaptive=0,polymerAlternatives=0,controlledWeight=0;
  const floors=[],pressures=[];
  for(const {region,assessment:a} of assessments){
    const w=regionWeight(region);weight+=w;margin+=a.margin*w;security+=a.materialSecurity*w;circularity+=a.circularityRate*w;virgin+=a.virginDependence*w;adaptive+=a.adaptiveCapacity*w;polymerAlternatives+=a.polymerAlternativeShare*w;if(a.controlled)controlledWeight+=w;floors.push(a.criticalSecurityFloor);pressures.push(a.maxDepletionPressure);
  }
  const result={
    active:true,
    margin:clamp(margin/weight),materialSecurity:clamp(security/weight),circularityRate:clamp(circularity/weight),virginDependence:clamp(virgin/weight),
    criticalSecurityFloor:quantile(floors,.10,.5),depletionPressure90:quantile(pressures,.90,0),adaptiveCapacity:clamp(adaptive/weight),
    polymerAlternativeShare:clamp(polymerAlternatives/weight),controlledCoverage:clamp(controlledWeight/weight),regionCount:assessments.length,
  };
  result.controlled=result.margin>=.68&&result.materialSecurity>=.60&&result.criticalSecurityFloor>=.42&&result.depletionPressure90<=.40&&result.controlledCoverage>=.72;
  return result;
}

export function ensureResourceDepletionProof(target={}){
  target.resourceDepletion||={};const s=target.resourceDepletion;
  if(!Number.isFinite(s.controlledYears))s.controlledYears=0;
  if(!Number.isFinite(s.bestControlledYears))s.bestControlledYears=0;
  if(typeof s.demonstratedDurable!=='boolean')s.demonstratedDurable=false;
  if(!Object.values(RESOURCE_BOSS_STATES).includes(s.status))s.status=RESOURCE_BOSS_STATES.UNCONTROLLED;
  if(!s.lastAssessment||typeof s.lastAssessment!=='object')s.lastAssessment=null;
  return s;
}

export function advanceResourceDepletionProof(target,assessment,elapsedDays=7){
  const s=ensureResourceDepletionProof(target),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  if(assessment?.controlled)s.controlledYears+=years;else s.controlledYears=Math.max(0,s.controlledYears-years*.75);
  s.bestControlledYears=Math.max(s.bestControlledYears,s.controlledYears);
  s.demonstratedDurable=s.controlledYears>=DURABLE_YEARS_REQUIRED;
  if(s.demonstratedDurable)s.status=RESOURCE_BOSS_STATES.DEMONSTRATED_DURABLE;
  else if(assessment?.controlled)s.status=RESOURCE_BOSS_STATES.CONTROLLED;
  else if((assessment?.margin||0)>=.55)s.status=RESOURCE_BOSS_STATES.STABILISING;
  else if(s.bestControlledYears>0||(assessment?.depletionPressure90??assessment?.maxDepletionPressure??0)>.40)s.status=RESOURCE_BOSS_STATES.DETERIORATING;
  else s.status=RESOURCE_BOSS_STATES.UNCONTROLLED;
  s.lastAssessment=assessment?{...assessment}:null;
  return {...s};
}

export function tickResourceDepletionFinalBoss({regions=[],playerPolityId=null,state={},elapsedDays=7}={}){
  state.finalBosses||={};state.finalBosses.resourceDepletion||={};const boss=state.finalBosses.resourceDepletion;
  boss.humanity||={};boss.player||={};
  const humanityAssessment=assessResourceDepletionScope(regions);
  const humanity=advanceResourceDepletionProof(boss.humanity,humanityAssessment,elapsedDays);
  let player=null;
  if(playerPolityId){
    const playerRegions=(regions||[]).filter(r=>polityId(r)===playerPolityId);
    player=advanceResourceDepletionProof(boss.player,assessResourceDepletionScope(playerRegions),elapsedDays);
  }
  boss.humanity=humanity;if(player)boss.player=player;
  boss.requiredYears=DURABLE_YEARS_REQUIRED;
  boss.ready=Boolean(player?.demonstratedDurable&&humanity.demonstratedDurable);
  return {player,humanity,ready:boss.ready,requiredYears:DURABLE_YEARS_REQUIRED};
}

export function resourceDepletionBossSummary(state={}){
  const boss=state?.finalBosses?.resourceDepletion||{};
  return {requiredYears:DURABLE_YEARS_REQUIRED,ready:Boolean(boss.ready),player:boss.player?{...boss.player}:null,humanity:boss.humanity?{...boss.humanity}:null};
}
