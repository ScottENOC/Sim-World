export function ensureEndgameState(world){
  world.endgame ||= {};
  const s=world.endgame;
  if(typeof s.victoryAchieved!=='boolean')s.victoryAchieved=false;
  if(typeof s.victoryAcknowledged!=='boolean')s.victoryAcknowledged=false;
  if(typeof s.continueAfterVictory!=='boolean')s.continueAfterVictory=false;
  if(!Number.isFinite(s.victoryTick))s.victoryTick=-1;
  if(!s.victorySnapshot||typeof s.victorySnapshot!=='object')s.victorySnapshot=null;
  return s;
}

export function recordVictory(world,{tick=-1,snapshot=null}={}){
  const s=ensureEndgameState(world);
  if(s.victoryAchieved)return false;
  s.victoryAchieved=true;
  s.victoryAcknowledged=false;
  s.continueAfterVictory=false;
  s.victoryTick=Number.isFinite(tick)?tick:-1;
  s.victorySnapshot=snapshot&&typeof snapshot==='object'?structuredCloneSafe(snapshot):null;
  return true;
}

export function acknowledgeVictory(world,{keepPlaying=false}={}){
  const s=ensureEndgameState(world);
  if(!s.victoryAchieved)return s;
  s.victoryAcknowledged=true;
  s.continueAfterVictory=Boolean(keepPlaying);
  return s;
}

export function shouldShowVictoryScreen(world){
  const s=ensureEndgameState(world);
  return s.victoryAchieved&&!s.victoryAcknowledged;
}

// Victory is an achievement, not a terminal simulation state. Loss conditions
// may still end a run separately, but choosing "Keep playing" after victory
// leaves the clock and all world systems active.
export function victoryStopsSimulation(){return false;}

function structuredCloneSafe(value){
  if(typeof structuredClone==='function'){
    try{return structuredClone(value);}catch{}
  }
  try{return JSON.parse(JSON.stringify(value));}catch{return null;}
}
