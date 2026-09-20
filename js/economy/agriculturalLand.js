const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

// The legacy food calibration implicitly treated a typical region as if about
// this share of its surface contributed to the farming yield ceiling. Keeping
// that assumption explicit lets us introduce real hectares without creating an
// immediate world-wide food shock. Future calibration can move the reference
// once modern mechanisation/fertiliser are modelled directly.
export const REFERENCE_ARABLE_SHARE=0.58;
const FARM_LABOR_SATURATION_PER_KM2=1.5;

function terrainFractions(region){
  const t=region?.terrain||{};
  return {
    plains:clamp(t.plains),
    hills:clamp(t.hills),
    mountains:clamp(t.mountains),
    forest:clamp(t.forest),
    wetland:clamp(t.wetland),
  };
}

function urbanFootprintShare(region){
  // Urban population is not the same thing as sealed land. Even highly urban
  // societies occupy only a modest fraction of a broad gameplay region.
  const urban=clamp(region?.urbanisation?.urbanShare||0);
  return clamp(.0015+urban*.045,0,.045);
}

function physicalArableShare(region){
  // Old tests, old saves and deliberately tiny fixture regions may not carry
  // terrain data. They inherit the historical average rather than being
  // interpreted as nearly barren land.
  if(!region?.terrain)return REFERENCE_ARABLE_SHARE;
  const t=terrainFractions(region);
  const terrainTotal=t.plains+t.hills+t.mountains+t.forest+t.wetland;
  if(terrainTotal<.05)return REFERENCE_ARABLE_SHARE;
  // "Potential" means physically capable of cropping after ordinary clearing
  // or drainage, not that it is currently a field. Forest therefore has some
  // agricultural potential, mountains very little, and wetlands only limited
  // potential until later drainage/engineering systems are modelled.
  const terrainSuitability=t.plains*.86+t.hills*.46+t.mountains*.07+t.forest*.40+t.wetland*.18;
  // landQuality already affects yield in laborCore. Use it only mildly here so
  // fertile soils expand the useful land margin without double-counting their
  // full productivity effect.
  const quality=Math.max(.05,Number(region?.landQuality)||1);
  const qualityAreaFactor=clamp(.82+quality*.18,.68,1.16);
  return clamp(terrainSuitability*qualityAreaFactor,.015,.91);
}

export function ensureAgriculturalLand(region){
  region.agriculturalLand||={};
  const s=region.agriculturalLand;
  const totalLandHa=Math.max(0,Number(region?.areaSqKm)||0)*100;
  const potentialShare=physicalArableShare(region);
  const potentiallyArableHa=totalLandHa*potentialShare;
  const forestHa=clamp((Number(region?.forest?.currentStock)||0)*100,0,totalLandHa);
  const urbanHa=totalLandHa*urbanFootprintShare(region);
  const pastureShare=clamp(region?.horseEconomy?.pastureFraction||0,0,.25);
  const pastureHa=totalLandHa*pastureShare;
  // Urban land and pasture compete with cropping. Forest is reported separately
  // but is not subtracted wholesale: potentially arable forest can be cleared,
  // while permanent forest protection/clearing policy is a later system.
  const availableArableHa=clamp(potentiallyArableHa-urbanHa-pastureHa,0,potentiallyArableHa);

  s.totalLandHa=totalLandHa;
  s.potentiallyArableHa=potentiallyArableHa;
  s.availableArableHa=availableArableHa;
  s.pastureHa=pastureHa;
  s.forestHa=forestHa;
  s.urbanHa=urbanHa;
  s.otherHa=Math.max(0,totalLandHa-forestHa-pastureHa-urbanHa);
  s.arableShare=totalLandHa>0?potentiallyArableHa/totalLandHa:0;
  s.availableArableShare=totalLandHa>0?availableArableHa/totalLandHa:0;
  s.arableQuality=clamp((Number(region?.landQuality)||1)/1.5,0,1);
  if(!Number.isFinite(s.cultivatedHa))s.cultivatedHa=0;
  s.cultivatedHa=clamp(s.cultivatedHa,0,availableArableHa);
  s.cultivationShare=availableArableHa>0?s.cultivatedHa/availableArableHa:0;
  return s;
}

export function agriculturalLandYieldFactor(region){
  // Standalone hydrology tests and old lightweight save fixtures often omit
  // geometry entirely. For those, preserve the exact pre-land-accounting
  // multiplier. Loaded gameplay regions always have area + terrain and use the
  // explicit land constraint below.
  if(!(Number(region?.areaSqKm)>0)||!region?.terrain)return 1;
  const s=ensureAgriculturalLand(region);
  // Converts the old whole-region yield coefficient into an explicit
  // per-arable-area coefficient while preserving a typical region's output.
  return clamp(s.availableArableShare/REFERENCE_ARABLE_SHARE,.03,1.55);
}

export function agriculturalLandLaborFactor(region){
  const s=ensureAgriculturalLand(region);
  const arableKm2=s.availableArableHa/100;
  const totalKm2=Math.max(.01,Number(region?.areaSqKm)||0);
  // This is exposed for the mechanisation tranche. The current farming engine
  // still uses its legacy labour curve, while cultivated-area reporting uses
  // the physically relevant arable area.
  return clamp(totalKm2/Math.max(.01,arableKm2),1,8);
}

export function updateCultivatedLand(region,{farmers=null}={}){
  const s=ensureAgriculturalLand(region);
  const workers=Math.max(0,Number(farmers??region?.occupations?.farmer)||0);
  const arableKm2=s.availableArableHa/100;
  if(arableKm2<=0||workers<=0){s.cultivatedHa=0;s.cultivationShare=0;return s;}
  const k=Math.max(.01,arableKm2*FARM_LABOR_SATURATION_PER_KM2);
  const utilisation=clamp(1-Math.exp(-workers/k));
  s.cultivatedHa=s.availableArableHa*utilisation;
  s.cultivationShare=utilisation;
  return s;
}

export function agriculturalLandSummary(region){
  const s=ensureAgriculturalLand(region);
  return {
    totalLandHa:s.totalLandHa,
    potentiallyArableHa:s.potentiallyArableHa,
    availableArableHa:s.availableArableHa,
    cultivatedHa:s.cultivatedHa,
    pastureHa:s.pastureHa,
    forestHa:s.forestHa,
    urbanHa:s.urbanHa,
    otherHa:s.otherHa,
    arableShare:s.arableShare,
    cultivationShare:s.cultivationShare,
    arableQuality:s.arableQuality,
    landYieldFactor:agriculturalLandYieldFactor(region),
  };
}

export function tickAgriculturalLand(region){
  ensureAgriculturalLand(region);
  updateCultivatedLand(region);
  region.report||={};
  region.report.landUse={workers:0,...agriculturalLandSummary(region)};
  return region.agriculturalLand;
}
