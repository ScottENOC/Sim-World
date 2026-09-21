const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export function nuclearWinterEffects(region){
  const aftermath=region?.nuclearAftermath||{};
  const soot=clamp(Math.max(aftermath.sootExposure||0,aftermath.globalSootShock||0));
  const solarReduction=clamp(soot*.62,0,.55);
  const coolingC=-soot*8.5;
  const growingSeasonStress=clamp(soot*.82+Math.max(0,-coolingC-1)*.035,0,.85);
  const outdoorYieldMultiplier=clamp((1-solarReduction*.92)*(1-growingSeasonStress*.46),.30,1);
  const pastureMultiplier=clamp((1-solarReduction*.70)*(1-growingSeasonStress*.34),.38,1);
  return {soot,solarReduction,coolingC,growingSeasonStress,outdoorYieldMultiplier,pastureMultiplier};
}
