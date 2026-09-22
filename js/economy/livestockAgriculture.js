import { nuclearWinterEffects } from '../world/nuclearWinter.js?v=20260922-nuclear-winter1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

function literacy(region){return clamp(region?.publicEducation?.literacy??region?.education?.literacyRate??region?.massEducation?.literacyRate??region?.educationLevel??0);}
function power(region){return clamp(region?.electricity?.industrialService||0);}
function admin(region){return clamp(region?.governance?.administrativeControl??region?.governance?.administration?.recordKeeping??.25);}
function pastureSignal(region){const hills=clamp(region?.terrain?.hills||0),plains=clamp(region?.terrain?.plains||0),forest=clamp(region?.terrain?.forest||0),quality=clamp((Number(region?.landQuality)||1)/1.4),winter=nuclearWinterEffects(region);return clamp((.18+hills*.32+plains*.24+forest*.08+quality*.22)*winter.pastureMultiplier);}
function breedingScience(region){const b=region?.cropBreeding||{},bio=region?.cropBiotechnology||{};return clamp((b.capability||0)*.42+(bio.platformMaturity||bio.capability||0)*.35+literacy(region)*.23);}
function veterinaryCapability(region){const tech=region?.unlockedTechIds||new Set();const medicine=tech.has?.('germ_theory')?.28:0,vaccines=tech.has?.('vaccination')?.20:0,refrigeration=tech.has?.('refrigeration')?.10:0;return clamp(.08+medicine+vaccines+refrigeration+literacy(region)*.18+admin(region)*.10+power(region)*.06);}
function mechanisation(region){const m=region?.agriculturalMachinery||{};return clamp(positive(m.tractorCoverage)*.55+positive(m.combineCoverage)*.20+positive(region?.precisionAgriculture?.adoption)*.25);}
function computingCapability(region){const c=region?.computingIndustry||{},cap=c.capacity||{},exp=c.experience||{},stock=region?.stockpile||{};return clamp(clamp(Math.log1p(positive(stock.computers))/4)*.28+clamp(positive(cap.chip_design)/16)*.18+clamp(positive(cap.wafer_fab)/16)*.18+clamp(positive(exp.chip_design))*.18+clamp(positive(exp.wafer_fab))*.18);}

export function ensureLivestockAgriculture(region){region.livestockAgriculture||={};const s=region.livestockAgriculture;for(const [k,v] of Object.entries({breedingInvestment:.16,intensificationInvestment:.12,conservationInvestment:.06,breedingCapability:.08,geneticImprovement:0,feedEfficiency:0,diseaseResistance:0,productivityTrait:0,breedDiversity:.82,eliteLineConcentration:.08,inbreedingRisk:.03,pedigreeManagement:0,cryobankCoverage:0,genomicManagement:0,systemicGeneticRisk:.04,geneticShockResilience:.92,intensiveShare:0,feedDemand:0,feedConsumed:0,feedSatisfaction:1,diseasePressure:.08,veterinaryCapability:.08,outputMultiplier:1,waterDemand:0,waterSatisfaction:1,electricityLoad:0,manureNutrientLoad:0,methaneIntensity:1,methaneEmissions:0,antibioticPressure:0,antibioticResistance:0,welfarePressure:0,nuclearWinterPastureMultiplier:1,alternativeProteinDisplacement:0,marketScale:1}))if(!Number.isFinite(s[k]))s[k]=v;return s;}
export function setLivestockPolicy(region,patch={}){const s=ensureLivestockAgriculture(region);if(patch.breedingInvestment!==undefined)s.breedingInvestment=clamp(patch.breedingInvestment);if(patch.intensificationInvestment!==undefined)s.intensificationInvestment=clamp(patch.intensificationInvestment);if(patch.conservationInvestment!==undefined)s.conservationInvestment=clamp(patch.conservationInvestment);return {breedingInvestment:s.breedingInvestment,intensificationInvestment:s.intensificationInvestment,conservationInvestment:s.conservationInvestment};}

function tickConservationGenetics(region,s,years,science,vet,electricity){
  const tech=region?.unlockedTechIds||new Set(),education=literacy(region),records=admin(region),computing=computingCapability(region),conservation=clamp(s.conservationInvestment);
  const pedigreeTarget=clamp(records*.42+education*.30+science*.20+conservation*.08);
  const managementAdjust=1-Math.exp(-years*(.05+.16*conservation));
  s.pedigreeManagement=clamp(s.pedigreeManagement+(pedigreeTarget-s.pedigreeManagement)*managementAdjust);

  const coldStorage=tech.has?.('refrigeration')&&electricity>.25;
  const cryobankTarget=coldStorage?clamp(science*.34+vet*.18+records*.16+education*.10+conservation*.22):0;
  s.cryobankCoverage=clamp(s.cryobankCoverage+(cryobankTarget-s.cryobankCoverage)*(1-Math.exp(-years*(.018+.09*conservation))));

  const biotech=clamp(region?.cropBiotechnology?.platformMaturity??region?.cropBiotechnology?.capability??0);
  const genomicTarget=coldStorage&&biotech>.25&&computing>.12?clamp(biotech*.36+computing*.32+science*.20+conservation*.12):0;
  s.genomicManagement=clamp(s.genomicManagement+(genomicTarget-s.genomicManagement)*(1-Math.exp(-years*(.02+.10*conservation))));

  const selectionIntensity=clamp(s.breedingInvestment*(.30+s.productivityTrait*.35+s.feedEfficiency*.18+s.diseaseResistance*.17));
  const concentrationTarget=clamp(s.intensiveShare*.54+selectionIntensity*.34+(1-s.pedigreeManagement)*.12);
  s.eliteLineConcentration=clamp(s.eliteLineConcentration+(concentrationTarget-s.eliteLineConcentration)*(1-Math.exp(-years*.055)));

  const conservationShield=clamp(conservation*.40+s.pedigreeManagement*.18+s.cryobankCoverage*.25+s.genomicManagement*.17);
  const diversityLoss=(.0012+selectionIntensity*.010+s.eliteLineConcentration*.008)*s.breedDiversity*(1-conservationShield*.82)*years;
  const traditionalGeneFlow=(1-s.intensiveShare)*(.0012+.0018*records)*years;
  const managedRecovery=(s.cryobankCoverage*.0028+s.genomicManagement*.0022)*conservation*years;
  s.breedDiversity=clamp(s.breedDiversity-diversityLoss+traditionalGeneFlow+managedRecovery,.12,1);

  s.inbreedingRisk=clamp((1-s.breedDiversity)*.62+s.eliteLineConcentration*.31-(s.pedigreeManagement*.18+s.genomicManagement*.24+s.cryobankCoverage*.08),0,.88);
  s.systemicGeneticRisk=clamp((1-s.breedDiversity)*.48+s.eliteLineConcentration*.25+s.inbreedingRisk*.42-(s.cryobankCoverage*.13+s.genomicManagement*.18),0,.92);
  s.geneticShockResilience=clamp(1-s.systemicGeneticRisk*.62,.38,1);
}

export function tickLivestockAgriculture(region,elapsedDays=7){
  const s=ensureLivestockAgriculture(region),years=Math.max(0,positive(elapsedDays))/DAYS_PER_YEAR,tech=region?.unlockedTechIds||new Set(),electricity=power(region),science=breedingScience(region),vet=veterinaryCapability(region),machines=mechanisation(region),pasture=pastureSignal(region),winter=nuclearWinterEffects(region),alternativeProteinDisplacement=clamp(region?.alternativeProteins?.livestockDisplacement||0,0,.70),marketScale=clamp(1-alternativeProteinDisplacement*.75,.45,1);
  s.nuclearWinterPastureMultiplier=winter.pastureMultiplier;s.alternativeProteinDisplacement=alternativeProteinDisplacement;s.marketScale=marketScale;
  s.breedingCapability=clamp(.10+science*.52+literacy(region)*.18+admin(region)*.12+vet*.08);
  const breedingRate=(.0025+s.breedingCapability*.0105)*(.25+s.breedingInvestment*.75)*years;
  s.productivityTrait=clamp(s.productivityTrait+(1-s.productivityTrait)*breedingRate*.48,0,.75);
  s.feedEfficiency=clamp(s.feedEfficiency+(1-s.feedEfficiency)*breedingRate*.32,0,.65);
  s.diseaseResistance=clamp(s.diseaseResistance+(1-s.diseaseResistance)*breedingRate*.20,0,.60);
  s.geneticImprovement=(s.productivityTrait+s.feedEfficiency+s.diseaseResistance)/3;

  const modernHousing=tech.has?.('industrial_electrification')&&electricity>.12,intensiveCapability=modernHousing?clamp(electricity*.24+machines*.22+vet*.25+literacy(region)*.14+admin(region)*.15):0,intensiveTarget=intensiveCapability*clamp(.15+s.intensificationInvestment*.85)*marketScale,adjust=1-Math.exp(-years*(.12+s.intensificationInvestment*.30));
  s.intensiveShare=clamp(s.intensiveShare+(intensiveTarget-s.intensiveShare)*adjust,0,.9);
  tickConservationGenetics(region,s,years,science,vet,electricity);

  const pop=Math.max(1,positive(region?.population)),scale=Math.pow(pop/100000,.74),feedNeed=scale*marketScale*s.intensiveShare*(.035+.055*(1-s.feedEfficiency))*Math.max(.05,positive(elapsedDays)/7);
  region.stockpile||={};const grain=positive(region.stockpile.staple_grains),feedConsumed=Math.min(grain,feedNeed);if(feedConsumed>0)region.stockpile.staple_grains=Math.max(0,grain-feedConsumed);s.feedDemand=feedNeed;s.feedConsumed=feedConsumed;s.feedSatisfaction=feedNeed>0?clamp(feedConsumed/feedNeed):1;

  const waterDemand=scale*marketScale*(.006+.018*s.intensiveShare);s.waterDemand=waterDemand;const allocated=positive(region?.waterResources?.allocation?.livestock),previousDemand=positive(region?.waterResources?.demand?.livestock);s.waterSatisfaction=previousDemand>0?clamp(allocated/previousDemand):1;
  const crowding=s.intensiveShare,feedStress=1-s.feedSatisfaction,waterStress=1-s.waterSatisfaction,winterStress=clamp(1-s.nuclearWinterPastureMultiplier),geneticStress=s.systemicGeneticRisk*(.05+crowding*.11+feedStress*.08+waterStress*.06+winterStress*.12),baselineDisease=.06+crowding*.22+feedStress*.12+waterStress*.08+geneticStress,effectiveVet=vet*(1-s.antibioticResistance*.45);
  s.veterinaryCapability=vet;s.diseasePressure=clamp(baselineDisease*(1-effectiveVet*.62)*(1-s.diseaseResistance*.38),.015,.65);
  s.antibioticPressure=clamp(s.intensiveShare*s.diseasePressure*(.35+.65*vet)*marketScale,0,.45);
  const resistanceRise=s.antibioticPressure*(.08+.12*s.intensiveShare)*years,resistanceDecay=s.antibioticResistance*.012*years;s.antibioticResistance=clamp(s.antibioticResistance+resistanceRise-resistanceDecay,0,.85);

  const extensiveBase=.82+pasture*.32,geneticGain=1+s.productivityTrait*.24+s.feedEfficiency*.06,intensiveGain=1+s.intensiveShare*.42*s.feedSatisfaction,diseaseLoss=1-s.diseasePressure*.42,waterMultiplier=.78+s.waterSatisfaction*.22,inbreedingPenalty=1-s.inbreedingRisk*.20,shockPenalty=1-(feedStress+waterStress+winterStress)*s.systemicGeneticRisk*.055;s.outputMultiplier=clamp(extensiveBase*geneticGain*intensiveGain*diseaseLoss*waterMultiplier*inbreedingPenalty*shockPenalty*(1-alternativeProteinDisplacement*.55),.30,1.95);
  const animalShare=clamp(region?.foodDiversity?.productionMix?.animal_foods??(.12+pasture*.20),.05,.5);s.electricityLoad=modernHousing?scale*marketScale*s.intensiveShare*(.015+.035*electricity)*Math.max(.05,positive(elapsedDays)/7):0;s.manureNutrientLoad=clamp(scale*marketScale*animalShare*(.08+.20*s.intensiveShare)*(1-vet*.10),0,2.5);s.methaneIntensity=clamp(1-s.feedEfficiency*.24+s.intensiveShare*.06,.72,1.12);s.methaneEmissions=scale*marketScale*animalShare*(.10+.12*(1-s.intensiveShare)+.07*s.intensiveShare)*s.methaneIntensity;s.welfarePressure=clamp(s.intensiveShare*marketScale*(.35+.40*feedStress+.15*waterStress+.10*(1-vet)+s.inbreedingRisk*.12),0,.90);
  region.report||={};region.report.livestockAgriculture=livestockAgricultureSummary(region);return s;
}

export function livestockOutputMultiplier(region){return ensureLivestockAgriculture(region).outputMultiplier;}
export function livestockWaterDemand(region){return positive(ensureLivestockAgriculture(region).waterDemand);}
export function livestockAgricultureSummary(region){const s=ensureLivestockAgriculture(region);return {workers:0,breedingInvestment:s.breedingInvestment,intensificationInvestment:s.intensificationInvestment,conservationInvestment:s.conservationInvestment,breedingCapability:s.breedingCapability,geneticImprovement:s.geneticImprovement,productivityTrait:s.productivityTrait,feedEfficiency:s.feedEfficiency,diseaseResistance:s.diseaseResistance,breedDiversity:s.breedDiversity,eliteLineConcentration:s.eliteLineConcentration,inbreedingRisk:s.inbreedingRisk,pedigreeManagement:s.pedigreeManagement,cryobankCoverage:s.cryobankCoverage,genomicManagement:s.genomicManagement,systemicGeneticRisk:s.systemicGeneticRisk,geneticShockResilience:s.geneticShockResilience,intensiveShare:s.intensiveShare,feedDemand:s.feedDemand,feedConsumed:s.feedConsumed,feedSatisfaction:s.feedSatisfaction,diseasePressure:s.diseasePressure,veterinaryCapability:s.veterinaryCapability,outputMultiplier:s.outputMultiplier,nuclearWinterPastureMultiplier:s.nuclearWinterPastureMultiplier,alternativeProteinDisplacement:s.alternativeProteinDisplacement,marketScale:s.marketScale,waterDemand:s.waterDemand,waterSatisfaction:s.waterSatisfaction,electricityLoad:s.electricityLoad,manureNutrientLoad:s.manureNutrientLoad,methaneIntensity:s.methaneIntensity,methaneEmissions:s.methaneEmissions,antibioticPressure:s.antibioticPressure,antibioticResistance:s.antibioticResistance,welfarePressure:s.welfarePressure};}
