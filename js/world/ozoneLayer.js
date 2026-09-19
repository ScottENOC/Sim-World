const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const YEARS=365.2425;

function canonicalWorldState(regions){
  const anchor=regions?.[0];
  if(!anchor)return null;
  anchor.worldEnvironment||={};
  anchor.worldEnvironment.ozoneLayer||={};
  const s=anchor.worldEnvironment.ozoneLayer;
  s.ozoneIndex=clamp(s.ozoneIndex??1,.35,1);
  s.atmosphericCfcBank=Math.max(0,Number(s.atmosphericCfcBank)||0);
  s.cumulativeOzoneDepletingEmissions=Math.max(0,Number(s.cumulativeOzoneDepletingEmissions)||0);
  s.lastReportedRegionalDamage=typeof s.lastReportedRegionalDamage==='object'&&s.lastReportedRegionalDamage?s.lastReportedRegionalDamage:{};
  s.uvBurden=clamp(s.uvBurden||0);
  s.healthBurden=clamp(s.healthBurden||0);
  s.ecosystemBurden=clamp(s.ecosystemBurden||0);
  return s;
}

export function ozoneLayerState(regions){return canonicalWorldState(regions);}

function newRegionalOzoneDamage(regions,state){
  let newlyReleased=0;
  for(const r of regions||[]){
    const total=Math.max(0,Number(r.environmentalHealth?.ozoneDamageContribution)||0);
    const previous=Math.max(0,Number(state.lastReportedRegionalDamage[r.id])||0);
    if(total>previous)newlyReleased+=total-previous;
    state.lastReportedRegionalDamage[r.id]=total;
  }
  return newlyReleased;
}

export function tickWorldOzoneLayer(regions,elapsedDays=7){
  const s=canonicalWorldState(regions);if(!s)return null;
  const years=Math.max(0,Number(elapsedDays)||0)/YEARS;
  const released=newRegionalOzoneDamage(regions,s);
  s.atmosphericCfcBank+=released;
  s.cumulativeOzoneDepletingEmissions+=released;

  // Ozone-depleting compounds are long-lived. Their atmospheric burden declines
  // on a multi-decade timescale, and the ozone layer responds/rebuilds gradually.
  const atmosphericRetention=Math.pow(.5,years/52);
  s.atmosphericCfcBank*=atmosphericRetention;
  const targetOzone=clamp(1-s.atmosphericCfcBank*.018,.35,1);
  const response=1-Math.exp(-years/7.5);
  s.ozoneIndex=clamp(s.ozoneIndex+(targetOzone-s.ozoneIndex)*response,.35,1);

  const depletion=1-s.ozoneIndex;
  s.uvBurden=clamp(Math.pow(depletion,1.12)*1.35);
  // These are deliberately modest aggregate effects, not country-specific disease
  // simulations. Ozone depletion matters, but diplomacy and technology response
  // should usually be the more visible gameplay consequence.
  s.healthBurden=clamp(s.uvBurden*.16);
  s.ecosystemBurden=clamp(s.uvBurden*.055);
  return {...s,newOzoneDepletingEmissions:released};
}

export function ozoneImpactMultipliers(regions){
  const s=canonicalWorldState(regions);
  if(!s)return {health:1,crops:1,ecosystems:1};
  return {health:1-s.healthBurden*.025,crops:1-s.ecosystemBurden*.018,ecosystems:1-s.ecosystemBurden*.04};
}

export function ozoneDiplomaticSignal(region,regions){
  const s=canonicalWorldState(regions),h=region?.environmentalHealth||{};
  const scienceKnown=(region?.unlockedTechIds?.has?.('cfc_ozone_harm'))||false;
  if(!s||!scienceKnown)return {known:false,responsibility:0,solutionLeadership:0,ozoneIndex:s?.ozoneIndex??1};
  const worldDamage=Math.max(.000001,s.cumulativeOzoneDepletingEmissions);
  const responsibility=clamp((Number(h.ozoneDamageContribution)||0)/worldDamage*4);
  const solutionLeadership=region?.unlockedTechIds?.has?.('alternative_refrigerants')?clamp(.45+(Number(h.cfcUse)||0)/(1+(Number(h.cfcUse)||0))*.35):0;
  return {known:true,responsibility,solutionLeadership,ozoneIndex:s.ozoneIndex};
}
