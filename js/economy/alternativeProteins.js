const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

function power(region){return clamp(region?.electricity?.industrialService||0);}
function literacy(region){return clamp(region?.publicEducation?.literacy??region?.education?.literacyRate??region?.massEducation?.literacyRate??region?.educationLevel??0);}
function machining(region){return clamp(region?.industrialSupply?.capability?.precision_machining||0);}
function biotech(region){const b=region?.cropBiotechnology||{};return clamp(Math.max(b.platformMaturity||0,(b.capability||0)*.7));}
function research(region){return clamp(region?.medicalProgress?.researchCapability??region?.research?.capability??region?.technology?.researchCapability??0);}
function computing(region){const c=region?.computingIndustry||{},cap=c.capacity||{},exp=c.experience||{},stock=region?.stockpile||{};return clamp(clamp(Math.log1p(positive(stock.computers))/4)*.25+clamp(positive(cap.chip_design)/16)*.20+clamp(positive(cap.wafer_fab)/16)*.20+clamp(positive(exp.chip_design))*.20+clamp(positive(exp.wafer_fab))*.15);}

export function ensureAlternativeProteins(region){region.alternativeProteins||={};const s=region.alternativeProteins;for(const [k,v] of Object.entries({investment:.20,precisionFermentationMaturity:0,cultivatedMeatMaturity:0,precisionFermentationScale:0,cultivatedMeatScale:0,learning:0,feedstockDemand:0,feedstockConsumed:0,feedstockSatisfaction:1,waterDemand:0,waterSatisfaction:1,electricityLoad:0,precisionFermentationOutput:0,cultivatedMeatOutput:0,totalOutput:0,unitCostIndex:4,consumerAcceptance:.18,livestockDisplacement:0,landReliefIndex:0,conventionalMethaneAvoidance:0}))if(!Number.isFinite(s[k]))s[k]=v;return s;}
export function setAlternativeProteinPolicy(region,patch={}){const s=ensureAlternativeProteins(region);if(patch.investment!==undefined)s.investment=clamp(patch.investment);return {investment:s.investment};}

export function alternativeProteinCapability(region){const p=power(region),bio=biotech(region),labs=research(region),machines=machining(region),digital=computing(region),edu=literacy(region);if(p<.35||bio<.20||labs<.22||machines<.18)return 0;return clamp(p*.18+bio*.25+labs*.22+machines*.14+digital*.13+edu*.08);}

function consumeFeedstock(region,amount){region.stockpile||={};let remaining=positive(amount),used=0;for(const id of ['pulses','staple_grains']){const available=positive(region.stockpile[id]),take=Math.min(available,remaining);region.stockpile[id]=available-take;used+=take;remaining-=take;if(remaining<=0)break;}return used;}

export function tickAlternativeProteins(region,elapsedDays=7){
  const s=ensureAlternativeProteins(region),years=Math.max(0,positive(elapsedDays))/DAYS_PER_YEAR,cap=alternativeProteinCapability(region),invest=clamp(s.investment),p=power(region),tech=region?.unlockedTechIds||new Set();
  const pfTarget=cap*invest,cmGate=tech.has?.('refrigeration')?1:.55,cmTarget=clamp(cap*invest*cmGate*(.45+.55*biotech(region)));
  const maturityAdjust=1-Math.exp(-years*(.08+.22*invest));
  s.precisionFermentationMaturity=clamp(s.precisionFermentationMaturity+(pfTarget-s.precisionFermentationMaturity)*maturityAdjust);
  s.cultivatedMeatMaturity=clamp(s.cultivatedMeatMaturity+(cmTarget-s.cultivatedMeatMaturity)*maturityAdjust*.72);
  const shortage=clamp(region?.foodDiversity?.shortage?.animal_foods||0),marketPull=clamp(.18+shortage*.50+s.consumerAcceptance*.32),scaleAdjust=1-Math.exp(-years*(.06+.18*invest));
  const pfScaleTarget=clamp(s.precisionFermentationMaturity*marketPull*(.45+.55*cap));
  const cmScaleTarget=clamp(s.cultivatedMeatMaturity*marketPull*(.35+.65*cap));
  s.precisionFermentationScale=clamp(s.precisionFermentationScale+(pfScaleTarget-s.precisionFermentationScale)*scaleAdjust);
  s.cultivatedMeatScale=clamp(s.cultivatedMeatScale+(cmScaleTarget-s.cultivatedMeatScale)*scaleAdjust*.8);

  const pop=Math.max(1,positive(region.population)),scale=Math.pow(pop/100000,.72),activity=s.precisionFermentationScale+s.cultivatedMeatScale*1.35;
  const feedEfficiency=clamp(.38+s.learning*.30+cap*.18,.35,.82),feedstockDemand=scale*activity*(.020-feedEfficiency*.010)*Math.max(.05,positive(elapsedDays)/7),feedstockConsumed=consumeFeedstock(region,feedstockDemand);s.feedstockDemand=feedstockDemand;s.feedstockConsumed=feedstockConsumed;s.feedstockSatisfaction=feedstockDemand>0?clamp(feedstockConsumed/feedstockDemand):1;
  s.waterDemand=scale*activity*(.0025+s.cultivatedMeatScale*.0045);const previousDemand=positive(region?.waterResources?.demand?.industry),allocated=positive(region?.waterResources?.allocation?.industry);s.waterSatisfaction=previousDemand>0?clamp(allocated/previousDemand):1;
  s.electricityLoad=scale*activity*(.025+s.cultivatedMeatScale*.045)*Math.max(.05,positive(elapsedDays)/7);

  const utility=clamp((.58+.42*p)*(.70+.30*s.waterSatisfaction)*s.feedstockSatisfaction),pfYield=scale*s.precisionFermentationScale*(.020+.035*s.precisionFermentationMaturity)*utility,cmYield=scale*s.cultivatedMeatScale*(.012+.032*s.cultivatedMeatMaturity)*utility;
  s.precisionFermentationOutput=pfYield;s.cultivatedMeatOutput=cmYield;s.totalOutput=pfYield+cmYield;region.stockpile||={};region.stockpile.animal_foods=positive(region.stockpile.animal_foods)+s.totalOutput;
  const learningGain=s.totalOutput*(.0015+.0035*cap)*years;s.learning=clamp(s.learning+learningGain,0,1);
  const weightedMaturity=clamp(s.precisionFermentationMaturity*.48+s.cultivatedMeatMaturity*.52),scaleEconomy=clamp((s.precisionFermentationScale+s.cultivatedMeatScale)/1.5);s.unitCostIndex=clamp(4.2-weightedMaturity*1.65-s.learning*.95-scaleEconomy*.70,1.0,4.2);
  const costAcceptance=clamp((3.2-s.unitCostIndex)/2.2),acceptTarget=clamp(.16+costAcceptance*.48+literacy(region)*.10+shortage*.18);s.consumerAcceptance=clamp(s.consumerAcceptance+(acceptTarget-s.consumerAcceptance)*(1-Math.exp(-years*.12)));
  const conventionalDemand=Math.max(.001,Math.pow(pop/100000,.72)*.030),share=clamp(s.totalOutput/Math.max(.001,conventionalDemand+s.totalOutput));s.livestockDisplacement=clamp(share*s.consumerAcceptance*.85,0,.70);s.landReliefIndex=clamp(s.livestockDisplacement*.78);s.conventionalMethaneAvoidance=clamp(s.livestockDisplacement*.65);
  region.report||={};region.report.alternativeProteins=alternativeProteinSummary(region);return s;
}

export function alternativeProteinWaterDemand(region){return positive(ensureAlternativeProteins(region).waterDemand);}
export function alternativeProteinSummary(region){const s=ensureAlternativeProteins(region);return {workers:0,investment:s.investment,capability:alternativeProteinCapability(region),precisionFermentationMaturity:s.precisionFermentationMaturity,cultivatedMeatMaturity:s.cultivatedMeatMaturity,precisionFermentationScale:s.precisionFermentationScale,cultivatedMeatScale:s.cultivatedMeatScale,learning:s.learning,feedstockDemand:s.feedstockDemand,feedstockConsumed:s.feedstockConsumed,feedstockSatisfaction:s.feedstockSatisfaction,waterDemand:s.waterDemand,waterSatisfaction:s.waterSatisfaction,electricityLoad:s.electricityLoad,precisionFermentationOutput:s.precisionFermentationOutput,cultivatedMeatOutput:s.cultivatedMeatOutput,totalOutput:s.totalOutput,unitCostIndex:s.unitCostIndex,consumerAcceptance:s.consumerAcceptance,livestockDisplacement:s.livestockDisplacement,landReliefIndex:s.landReliefIndex,conventionalMethaneAvoidance:s.conventionalMethaneAvoidance};}
