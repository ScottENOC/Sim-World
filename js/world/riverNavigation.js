// Graded inland/coastal navigation. Physical river capacity is immutable data;
// weather, season, vessel size and engineering turn it into a current transport
// impedance. Trade/military systems may consume these factors without creating
// a second transport simulation.

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function dayOfYear(currentDay){return ((Number(currentDay)||0)%365.2425+365.2425)%365.2425;}
function winterStrength(latitude,currentDay){
  const lat=Number(latitude)||0;
  if(Math.abs(lat)<20)return 0;
  const peak=lat<0?182.6:0;
  const phase=Math.cos(2*Math.PI*(dayOfYear(currentDay)-peak)/365.2425);
  return clamp((phase+0.25)/1.25);
}

export function riverIceState(river,{currentDay=0,latitude=0,weatherIndex=0,climateShift=0,iceManagement=0}={}){
  const propensity=clamp(river?.navigation?.freezePropensity||0);
  if(propensity<=0.001)return {iceFraction:0,navigationMultiplier:1,landCrossingMultiplier:1};
  const winter=winterStrength(latitude,currentDay);
  const coldWeather=clamp((-Number(weatherIndex||0)+Number(climateShift||0)+0.35)/2.15);
  const management=clamp(iceManagement);
  const ice=clamp(propensity*winter*(0.52+0.78*coldWeather)*(1-management*0.55));
  // Thin/patchy ice inconveniences boats; extensive ice can make navigation
  // practically impossible. It only helps land crossings once well established.
  const navigationMultiplier=clamp(1-Math.pow(ice,1.25)*1.18,0.04,1);
  const crossingBoost=ice<0.42?0:clamp((ice-0.42)/0.45)*0.55;
  return {iceFraction:ice,navigationMultiplier,landCrossingMultiplier:1+crossingBoost};
}

export function riverNavigationState(river,{currentDay=0,latitude=0,weatherIndex=0,vesselDraftM=0.5,vesselDisplacementT=5,channelEngineering=0,iceManagement=0}={}){
  const nav=river?.navigation||{};
  const engineering=clamp(channelEngineering);
  // Engineering/dredging helps, but rivers remain constrained corridors: very
  // large late-game vessels should normally prefer capable deep-sea ports.
  const draftCapacity=Math.max(0.2,(Number(nav.baseMaxDraftM)||0.8)*(1+engineering*0.55));
  const displacementCapacity=Math.max(1,(Number(nav.baseMaxDisplacementT)||20)*(1+engineering*1.25));
  const draftFit=clamp(draftCapacity/Math.max(0.1,Number(vesselDraftM)||0.1));
  const displacementFit=clamp(displacementCapacity/Math.max(0.1,Number(vesselDisplacementT)||0.1));
  const vesselFit=Math.min(draftFit,displacementFit);
  const variability=clamp(nav.flowVariability||0);
  const adverseFlow=clamp(Math.abs(Number(weatherIndex)||0)/1.8)*variability*0.32;
  const ice=riverIceState(river,{currentDay,latitude,weatherIndex,iceManagement});
  const capacity=clamp((Number(nav.naturalCapacity)||0.35)*(0.72+engineering*0.55)*(1-adverseFlow));
  return {
    vesselFit,
    effectiveMaxDraftM:draftCapacity,
    effectiveMaxDisplacementT:displacementCapacity,
    iceFraction:ice.iceFraction,
    landCrossingMultiplier:ice.landCrossingMultiplier,
    speedMultiplier:clamp(vesselFit*ice.navigationMultiplier*(1-adverseFlow),0.02,1),
    throughputMultiplier:clamp(capacity*vesselFit*ice.navigationMultiplier,0.01,1),
  };
}

export function portNavigationProfile({kind='deep_sea',transportTech=0,harbourEngineering=0,fortification=0,navalProtection=0,riverState=null}={}){
  const tech=clamp(transportTech), harbour=clamp(harbourEngineering), fort=clamp(fortification), navy=clamp(navalProtection);
  if(kind==='river'){
    const riverThroughput=clamp(riverState?.throughputMultiplier??0.55);
    const riverFit=clamp(riverState?.vesselFit??1);
    return {
      kind,
      capacity:clamp((0.36+0.42*tech+0.28*harbour)*riverThroughput*riverFit),
      natureRisk:clamp(0.14+0.18*(1-riverThroughput)-0.07*harbour),
      hostileExposure:clamp(0.22-0.09*fort-0.08*navy),
      shelterAdvantage:0.75,
    };
  }
  // Open/deep-water ports are comparatively exposed in the small-craft era,
  // but scale better as vessels, breakwaters, fortification and navies improve.
  return {
    kind:'deep_sea',
    capacity:clamp(0.22+0.52*tech+0.42*harbour),
    natureRisk:clamp(0.48-0.24*tech-0.25*harbour),
    hostileExposure:clamp(0.52-0.20*fort-0.24*navy-0.08*tech),
    shelterAdvantage:clamp(0.20+0.35*harbour),
  };
}

// Sea-ice is route-specific, not region-label-specific. A sea region with ice on
// its northern fringe remains freely usable when the actual traversed corridor
// stays in ice-free water.
export function seaIceNavigationState({routeIceExposure=0,seasonalIce=0,iceCapability=0}={}){
  const exposure=clamp(routeIceExposure), ice=clamp(seasonalIce), capability=clamp(iceCapability);
  const obstruction=exposure*ice*(1-capability*0.75);
  return {obstruction,navigationMultiplier:clamp(1-obstruction*0.92,0.06,1)};
}
