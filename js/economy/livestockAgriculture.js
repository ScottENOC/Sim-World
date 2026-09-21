const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

function literacy(region){return clamp(region?.publicEducation?.literacy??region?.education?.literacyRate??region?.massEducation?.literacyRate??region?.educationLevel??0);}
function power(region){return clamp(region?.electricity?.industrialService||0);}
function admin(region){return clamp(region?.governance?.administrativeControl??region?.governance?.administration?.recordKeeping??.25);}
function pastureSignal(region){const hills=clamp(region?.terrain?.hills||0),plains=clamp(region?.terrain?.plains||0),forest=clamp(region?.terrain?.forest||0),quality=clamp((Number(region?.landQuality)||1)/1.4);return clamp(.18+hills*.32+plains*.24+forest*.08+quality*.22);}
function breedingScience(region){const b=region?.cropBreeding||{},bio=region?.cropBiotechnology||{};return clamp((b.capability||0)*.42+(bio.platformMaturity||bio.capability||0)*.35+literacy(region)*.23);}
function veterinaryCapability(region){const tech=region?.unlockedTechIds||new Set();const medicine=tech.has?.('germ_theory')?.28:0,vaccines=tech.has?.('vaccination')?.20:0,refrigeration=tech.has?.('refrigeration')?.10:0;return clamp(.08+medicine+vaccines+refrigeration+literacy(region)*.18+admin(region)*.10+power(region)*.06);}
function mechanisation(region){const m=region?.agriculturalMachinery||{};return clamp(positive(m.tractorCoverage)*.55+positive(m.combineCoverage)*.20+positive(region?.precisionAgriculture?.adoption)*.25);}

export function ensureLivestockAgriculture(region){region.livestockAgriculture||={};const s=region.livestockAgriculture;for(const [k,v] of Object.entries({breedingInvestment:.16,intensificationInvestment:.12,breedingCapability:.08,geneticImprovement:0,feedEfficiency:0,diseaseResistance:0,productivityTrait:0,intensiveShare:0,feedDemand:0,feedConsumed:0,feedSatisfaction:1,diseasePressure:.08,veterinaryCapability:.08,outputMultiplier:1,waterDemand:0,waterSatisfaction:1,electricityLoad:0,manureNutrientLoad:0,methaneIntensity:1,methaneEmissions:0,antibioticPressure:0,antibioticResistance:0,welfarePressure:0}))if(!Number.isFinite(s[k]))s[k]=v;return s;}
export function setLivestockPolicy(region,patch={}){const s=ensureLivestockAgriculture(region);if(patch.breedingInvestment!==undefined)s.breedingInvestment=clamp(patch.breedingInvestment);if(patch.intensificationInvestment!==undefined)s.intensificationInvestment=clamp(patch.intensificationInvestment);return {breedingInvestment:s.breedingInvestment,intensificationInvestment:s.intensificationInvestment};}

export function tickLivestockAgriculture(region,elapsedDays=7){
  const s=ensureLivestockAgriculture(region),years=Math.max(0,positive(elapsedDays))/DAYS_PER_YEAR,tech=region?.unlockedTechIds||new Set(),electricity=power(region),science=breedingScience(region),vet=veterinaryCapability(region),machines=mechanisation(region),pasture=pastureSignal(region);
  s.breedingCapability=clamp(.10+science*.52+literacy(region)*.18+admin(region)*.12+vet*.08);
  const breedingRate=(.0025+s.breedingCapability*.0105)*(.25+s.breedingInvestment*.75)*years;
  s.productivityTrait=clamp(s.productivityTrait+(1-s.productivityTrait)*breedingRate*.48,0,.75);
  s.feedEfficiency=clamp(s.feedEfficiency+(1-s.feedEfficiency)*breedingRate*.32,0,.65);
  s.diseaseResistance=clamp(s.diseaseResistance+(1-s.diseaseResistance)*breedingRate*.20,0,.60);
  s.geneticImprovement=(s.productivityTrait+s.feedEfficiency+s.diseaseResistance)/3;

  const modernHousing=tech.has?.('industrial_electrification')&&electricity>.12,intensiveCapability=modernHousing?clamp(electricity*.24+machines*.22+vet*.25+literacy(region)*.14+admin(region)*.15):0,intensiveTarget=intensiveCapability*clamp(.15+s.intensificationInvestment*.85),adjust=1-Math.exp(-years*(.12+s.intensificationInvestment*.30));
  s.intensiveShare=clamp(s.intensiveShare+(intensiveTarget-s.intensiveShare)*adjust,0,.9);

  const pop=Math.max(1,positive(region?.population)),scale=Math.pow(pop/100000,.74),feedNeed=scale*s.intensiveShare*(.035+.055*(1-s.feedEfficiency))*Math.max(.05,positive(elapsedDays)/7);
  region.stockpile||={};const grain=positive(region.stockpile.staple_grains),feedConsumed=Math.min(grain,feedNeed);if(feedConsumed>0)region.stockpile.staple_grains=Math.max(0,grain-feedConsumed);s.feedDemand=feedNeed;s.feedConsumed=feedConsumed;s.feedSatisfaction=feedNeed>0?clamp(feedConsumed/feedNeed):1;

  const waterDemand=scale*(.006+.018*s.intensiveShare);s.waterDemand=waterDemand;const allocated=positive(region?.waterResources?.allocation?.livestock),previousDemand=positive(region?.waterResources?.demand?.livestock);s.waterSatisfaction=previousDemand>0?clamp(allocated/previousDemand):1;
  const crowding=s.intensiveShare,feedStress=1-s.feedSatisfaction,waterStress=1-s.waterSatisfaction,baselineDisease=.06+crowding*.22+feedStress*.12+waterStress*.08,effectiveVet=vet*(1-s.antibioticResistance*.45);
  s.veterinaryCapability=vet;s.diseasePressure=clamp(baselineDisease*(1-effectiveVet*.62)*(1-s.diseaseResistance*.38),.015,.55);
  s.antibioticPressure=clamp(s.intensiveShare*s.diseasePressure*(.35+.65*vet),0,.45);
  const resistanceRise=s.antibioticPressure*(.08+.12*s.intensiveShare)*years,resistanceDecay=s.antibioticResistance*.012*years;s.antibioticResistance=clamp(s.antibioticResistance+resistanceRise-resistanceDecay,0,.85);

  const extensiveBase=.82+pasture*.32,geneticGain=1+s.productivityTrait*.24+s.feedEfficiency*.06,intensiveGain=1+s.intensiveShare*.42*s.feedSatisfaction,diseaseLoss=1-s.diseasePressure*.42,waterMultiplier=.78+s.waterSatisfaction*.22;s.outputMultiplier=clamp(extensiveBase*geneticGain*intensiveGain*diseaseLoss*waterMultiplier,.45,1.95);
  const animalShare=clamp(region?.foodDiversity?.productionMix?.animal_foods??(.12+pasture*.20),.05,.5);s.electricityLoad=modernHousing?scale*s.intensiveShare*(.015+.035*electricity)*Math.max(.05,positive(elapsedDays)/7):0;s.manureNutrientLoad=clamp(scale*animalShare*(.08+.20*s.intensiveShare)*(1-vet*.10),0,2.5);s.methaneIntensity=clamp(1-s.feedEfficiency*.24+s.intensiveShare*.06,.72,1.12);s.methaneEmissions=scale*animalShare*(.10+.12*(1-s.intensiveShare)+.07*s.intensiveShare)*s.methaneIntensity;s.welfarePressure=clamp(s.intensiveShare*(.35+.40*feedStress+.15*waterStress+.10*(1-vet)),0,.85);
  region.report||={};region.report.livestockAgriculture=livestockAgricultureSummary(region);return s;
}

export function livestockOutputMultiplier(region){return ensureLivestockAgriculture(region).outputMultiplier;}
export function livestockWaterDemand(region){return positive(ensureLivestockAgriculture(region).waterDemand);}
export function livestockAgricultureSummary(region){const s=ensureLivestockAgriculture(region);return {workers:0,breedingInvestment:s.breedingInvestment,intensificationInvestment:s.intensificationInvestment,breedingCapability:s.breedingCapability,geneticImprovement:s.geneticImprovement,productivityTrait:s.productivityTrait,feedEfficiency:s.feedEfficiency,diseaseResistance:s.diseaseResistance,intensiveShare:s.intensiveShare,feedDemand:s.feedDemand,feedConsumed:s.feedConsumed,feedSatisfaction:s.feedSatisfaction,diseasePressure:s.diseasePressure,veterinaryCapability:s.veterinaryCapability,outputMultiplier:s.outputMultiplier,waterDemand:s.waterDemand,waterSatisfaction:s.waterSatisfaction,electricityLoad:s.electricityLoad,manureNutrientLoad:s.manureNutrientLoad,methaneIntensity:s.methaneIntensity,methaneEmissions:s.methaneEmissions,antibioticPressure:s.antibioticPressure,antibioticResistance:s.antibioticResistance,welfarePressure:s.welfarePressure};}
