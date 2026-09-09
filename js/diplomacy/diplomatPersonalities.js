const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function hash01(text=''){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return ((h>>>0)%10000)/10000;
}

export function ensureDiplomatPersonality(diplomat){
  if(!diplomat) return null;
  const seed=String(diplomat.id||diplomat.name||'diplomat');
  diplomat.personality ||= {
    ambition: clamp(0.2+hash01(seed+'a')*0.65),
    discretion: clamp(0.25+hash01(seed+'d')*0.7),
    avarice: clamp(0.15+hash01(seed+'v')*0.75),
    courage: clamp(0.2+hash01(seed+'c')*0.7),
    independence: clamp(0.15+hash01(seed+'i')*0.75),
  };
  diplomat.reputation ||= { reliability:0.5, discretion:0.5, competence:0.5, foreignTrust:{} };
  diplomat.integrity ??= clamp((diplomat.loyalty ?? 0.7)*0.68 + (1-diplomat.personality.avarice)*0.32);
  diplomat.personalWealth ??= 0;
  diplomat.turnedByActorId ??= null;
  diplomat.suspectedCompromise ??= 0;
  diplomat.authorityBreaches ||= [];
  return diplomat.personality;
}

export function diplomatReliability(diplomat){
  ensureDiplomatPersonality(diplomat);
  return clamp((diplomat.loyalty??0.5)*0.4 + diplomat.integrity*0.26 + diplomat.reputation.reliability*0.22 + diplomat.personality.discretion*0.12 - (diplomat.turnedByActorId?0.35:0));
}

export function briberySusceptibility(diplomat, offeredValue=0, pressure=0){
  ensureDiplomatPersonality(diplomat);
  const wealthNeed=clamp(offeredValue/Math.max(1,10+(diplomat.personalWealth||0)));
  return clamp(diplomat.personality.avarice*0.38 + (1-(diplomat.loyalty??0.5))*0.3 + wealthNeed*0.22 + clamp(pressure)*0.16 + diplomat.personality.ambition*0.1 - diplomat.integrity*0.22);
}

export function attemptTurnDiplomat(diplomat, foreignActorId, offeredValue=0, pressure=0, rng=Math.random){
  if(!diplomat || !foreignActorId) return {attempted:false,reason:'invalid'};
  const susceptibility=briberySusceptibility(diplomat,offeredValue,pressure);
  const chance=clamp((susceptibility-0.28)*0.7,0.01,0.52);
  const success=rng()<chance;
  if(success){
    diplomat.turnedByActorId=foreignActorId;
    diplomat.personalWealth=(diplomat.personalWealth||0)+Math.max(0,offeredValue);
    diplomat.reputation.reliability=clamp(diplomat.reputation.reliability-0.08);
  } else {
    diplomat.suspectedCompromise=clamp(diplomat.suspectedCompromise + 0.1 + chance*0.25);
  }
  return {attempted:true,success,chance,susceptibility};
}

export function recordDiplomatPerformance(diplomat, outcome, hostActorId=null){
  ensureDiplomatPersonality(diplomat);
  const r=diplomat.reputation;
  const delta = outcome==='honoured_commitment'?0.07 : outcome==='accurate_report'?0.035 : outcome==='kept_secret'?0.04 : outcome==='authority_breach'?-0.14 : outcome==='false_report'?-0.11 : outcome==='leak'?-0.18 : 0;
  r.reliability=clamp(r.reliability+delta);
  if(['kept_secret','leak'].includes(outcome)) r.discretion=clamp(r.discretion+(outcome==='kept_secret'?0.05:-0.16));
  if(hostActorId){
    r.foreignTrust[hostActorId] ||= 0.5;
    r.foreignTrust[hostActorId]=clamp(r.foreignTrust[hostActorId]+delta*0.7);
  }
  return r;
}

export function diplomatMayExceedAuthority(diplomat, requestedFraction=0, urgency=0, rng=Math.random){
  ensureDiplomatPersonality(diplomat);
  const mandate=Math.max(0,Number(diplomat.maxMilitaryCommitmentFraction||0));
  const excess=Math.max(0,requestedFraction-mandate);
  if(excess<=0) return false;
  const chance=clamp(diplomat.personality.independence*0.22 + diplomat.personality.ambition*0.18 + clamp(urgency)*0.24 + excess*0.35 - (diplomat.loyalty??0.5)*0.18,0,0.45);
  return rng()<chance;
}

export function recordAuthorityBreach(diplomat, action, requestedFraction, currentTick){
  ensureDiplomatPersonality(diplomat);
  diplomat.authorityBreaches.push({action,requestedFraction,currentTick});
  if(diplomat.authorityBreaches.length>12) diplomat.authorityBreaches.shift();
  recordDiplomatPerformance(diplomat,'authority_breach');
}

export function governmentTrustRecord(region, foreignActorId){
  region.diplomaticTrust ||= {};
  region.diplomaticTrust[foreignActorId] ||= {score:0.5, promisesKept:0, promisesBroken:0, leaks:0, lastUpdatedTick:null};
  return region.diplomaticTrust[foreignActorId];
}

export function recordGovernmentTrust(region, foreignActorId, outcome, currentTick=null){
  const rec=governmentTrustRecord(region,foreignActorId);
  if(outcome==='promise_kept'){rec.promisesKept++;rec.score=clamp(rec.score+0.06);}
  else if(outcome==='promise_broken'){rec.promisesBroken++;rec.score=clamp(rec.score-0.11);}
  else if(outcome==='secret_leaked'){rec.leaks++;rec.score=clamp(rec.score-0.14);}
  else if(outcome==='helped_in_crisis') rec.score=clamp(rec.score+0.09);
  rec.lastUpdatedTick=currentTick;
  return rec;
}

export function diplomaticTrustSummary(region, foreignActorId){
  const rec=governmentTrustRecord(region,foreignActorId);
  const label=rec.score>=0.75?'high':rec.score>=0.55?'moderate':rec.score>=0.35?'low':'very low';
  return { ...rec, label };
}
