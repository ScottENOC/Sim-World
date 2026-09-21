const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

function literacy(region){return clamp(region?.publicEducation?.literacy??region?.education?.literacyRate??region?.massEducation?.literacyRate??region?.educationLevel??0);}
function administration(region){return clamp(region?.governance?.administrativeControl??region?.governance?.administration?.recordKeeping??.25);}
function mechanisation(region){const m=region?.agriculturalMachinery||{};return clamp((positive(m.tractorCoverage)*.62+positive(m.combineCoverage)*.38));}
function computingSignal(region){const c=region?.computingIndustry||{},cap=c.capacity||{},exp=c.experience||{},stock=region?.stockpile||{};const computers=clamp(Math.log1p(positive(stock.computers))/3.5),components=clamp(Math.log1p(positive(stock.electronic_components))/4),assembly=clamp(positive(cap.computer_assembly)/20),design=clamp(positive(exp.chip_design));return clamp(computers*.34+components*.18+assembly*.30+design*.18);}
function electricity(region){return clamp(region?.electricity?.industrialService||0);}
function cultivatedHa(region){return positive(region?.agriculturalLand?.cultivatedHa)||positive(region?.agriculturalLand?.availableArableHa)*clamp(region?.agriculturalLand?.cultivationShare||0);}

export function ensurePrecisionAgriculture(region){
  region.precisionAgriculture||={};const s=region.precisionAgriculture;
  for(const [k,v] of Object.entries({investment:0.35,capability:0,adoption:0,sensorCoverage:0,variableRateCoverage:0,irrigationDemandReduction:0,fertiliserDemandReduction:0,pesticideDemandReduction:0,runoffReduction:0,residueReduction:0,electricityLoad:0,managementEfficiency:0}))if(!Number.isFinite(s[k]))s[k]=v;
  return s;
}

export function setPrecisionAgriculturePolicy(region,patch={}){const s=ensurePrecisionAgriculture(region);if(patch.investment!==undefined)s.investment=clamp(patch.investment);return {investment:s.investment};}

export function precisionAgricultureCapability(region){
  const s=ensurePrecisionAgriculture(region),tech=region?.unlockedTechIds||new Set(),power=electricity(region),machines=mechanisation(region),computing=computingSignal(region);
  // Precision agriculture is deliberately not a free consequence of literacy or
  // old irrigation practice. It requires an electrified, mechanised farm sector
  // plus real digital/electronic capacity; management quality then determines
  // how effectively those tools are used.
  if(!tech.has?.('industrial_electrification')||power<.12||machines<.08||computing<.06){s.capability=0;return 0;}
  const management=clamp(literacy(region)*.58+administration(region)*.42);
  s.capability=clamp(power*.20+machines*.27+computing*.36+management*.17);
  return s.capability;
}

export function tickPrecisionAgriculture(region,elapsedDays=7){
  const s=ensurePrecisionAgriculture(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,capability=precisionAgricultureCapability(region),machines=mechanisation(region),computing=computingSignal(region),power=electricity(region);
  const target=capability*clamp(.22+s.investment*.78);
  const adjustment=1-Math.exp(-Math.max(0,years)*(.16+.34*s.investment));
  s.adoption=clamp(s.adoption+(target-s.adoption)*adjustment);
  if(capability<=0)s.adoption=clamp(s.adoption*Math.exp(-.08*years));
  s.sensorCoverage=clamp(s.adoption*(.38+.62*computing));
  s.variableRateCoverage=clamp(s.adoption*machines*(.30+.70*computing));
  s.managementEfficiency=clamp(s.adoption*(.40+.35*literacy(region)+.25*administration(region)));
  const irrigationControl=clamp(s.sensorCoverage*.58+s.variableRateCoverage*.42);
  const inputControl=clamp(s.sensorCoverage*.34+s.variableRateCoverage*.66);
  s.irrigationDemandReduction=clamp(irrigationControl*.32,0,.32);
  s.fertiliserDemandReduction=clamp(inputControl*.30,0,.30);
  s.pesticideDemandReduction=clamp(inputControl*.35,0,.35);
  s.runoffReduction=clamp(inputControl*.45,0,.45);
  s.residueReduction=clamp(inputControl*.40,0,.40);
  // Sensors, controllers, telemetry and variable-rate equipment draw electricity;
  // the load is small compared with heavy industry but material across large farms.
  s.electricityLoad=cultivatedHa(region)/100000*s.adoption*(.09+.16*computing)*Math.max(0,Number(elapsedDays)||0)/7*power;
  region.report||={};region.report.precisionAgriculture=precisionAgricultureSummary(region);return s;
}

export function precisionIrrigationDemandMultiplier(region){return 1-clamp(ensurePrecisionAgriculture(region).irrigationDemandReduction,0,.32);}
export function precisionFertiliserDemandMultiplier(region){return 1-clamp(ensurePrecisionAgriculture(region).fertiliserDemandReduction,0,.30);}
export function precisionPesticideDemandMultiplier(region){return 1-clamp(ensurePrecisionAgriculture(region).pesticideDemandReduction,0,.35);}
export function precisionRunoffMultiplier(region){return 1-clamp(ensurePrecisionAgriculture(region).runoffReduction,0,.45);}
export function precisionResidueMultiplier(region){return 1-clamp(ensurePrecisionAgriculture(region).residueReduction,0,.40);}
export function precisionAgricultureSummary(region){const s=ensurePrecisionAgriculture(region);return {workers:0,investment:s.investment,capability:precisionAgricultureCapability(region),adoption:s.adoption,sensorCoverage:s.sensorCoverage,variableRateCoverage:s.variableRateCoverage,managementEfficiency:s.managementEfficiency,irrigationDemandReduction:s.irrigationDemandReduction,fertiliserDemandReduction:s.fertiliserDemandReduction,pesticideDemandReduction:s.pesticideDemandReduction,runoffReduction:s.runoffReduction,residueReduction:s.residueReduction,electricityLoad:s.electricityLoad};}
