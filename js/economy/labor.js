import { tickEconomy as tickCoreEconomy } from './laborCore.js?v=20260905-merchant1';
import { artistPopulation } from '../society/arts.js?v=20260907-art1';
import { finalizeStructuralTransformation, prepareStructuralTransformation } from './structuralTransformation.js?v=20260915-structural1';
import { tickIndustrialSupply } from './industrialSupply.js?v=20260915-industrial1';
import { enforceHousingEmployment, housingSummary, prepareHousingConstruction } from './housing.js?v=20260916-housing1';
import { tickEmploymentAndHardship } from './employmentAndHardship.js?v=20260918-employment1';
import { tickHouseholdFoodSecurity } from './householdFoodSecurity.js?v=20260919-household-food1';
import { tickLightMetals } from './lightMetals.js?v=20260919-light-metals1';
import { tickAgriculturalLand, agriculturalLandSummary } from './agriculturalLand.js?v=20260921-arable1';
import { tickAgriculturalPests } from './agriculturalPests.js?v=20260921-pests2';
import { tickBatterySupplyChain } from './batterySupplyChain.js?v=20260921-battery-chain1';
import { tickSoilDegradation, soilDegradationSummary } from './soilDegradation.js?v=20260921-soil1';
import { tickAgriculturalGenetics, agriculturalGeneticsSummary } from './agriculturalGenetics.js?v=20260921-genetics1';
import { cropBreedingSummary } from './cropBreeding.js?v=20260921-breeding1';
import { tickPrecisionAgriculture, precisionAgricultureSummary } from './precisionAgriculture.js?v=20260921-precision-ag1';
import { tickCropBiotechnology, cropBiotechnologySummary } from './cropBiotechnology.js?v=20260921-biotech1';
import { tickLivestockAgriculture, livestockAgricultureSummary } from './livestockAgriculture.js?v=20260921-livestock1';
import { tickAlternativeProteins, alternativeProteinSummary } from './alternativeProteins.js?v=20260922-alt-protein1';
import { recordMaterialUse, tickCircularEconomy } from './circularEconomy.js?v=20260922-circular1';
import { tickNuclearWarRisk } from '../military/nuclearWarRisk.js?v=20260921-nuclear-risk1';
import { tickNuclearExchange } from '../military/nuclearExchange.js?v=20260921-nuclear-exchange1';
export * from './laborCore.js?v=20260905-merchant1';
export * from './housing.js?v=20260916-housing1';
export * from './employmentAndHardship.js?v=20260918-employment1';
export * from './householdFoodSecurity.js?v=20260919-household-food1';
export * from './lightMetals.js?v=20260919-light-metals1';
export * from './agriculturalLand.js?v=20260921-arable1';
export * from './agriculturalPests.js?v=20260921-pests2';
export * from './batterySupplyChain.js?v=20260921-battery-chain1';
export * from './soilDegradation.js?v=20260921-soil1';
export * from './agriculturalGenetics.js?v=20260921-genetics1';
export * from './cropBreeding.js?v=20260921-breeding1';
export * from './precisionAgriculture.js?v=20260921-precision-ag1';
export * from './cropBiotechnology.js?v=20260921-biotech1';
export * from './livestockAgriculture.js?v=20260921-livestock1';
export * from './alternativeProteins.js?v=20260922-alt-protein1';
export * from './circularEconomy.js?v=20260922-circular1';

function committedMerchantCount(region){const workingAge=Math.max(0,Number(region.demographics?.workingAge)||0),merchants=Math.max(0,Math.round(region.tradeEconomy?.merchantPopulation??region.occupations?.trader??0));return Math.min(workingAge,merchants);}
function committedArtistCount(region,availableAfterMerchants){const professionalArtists=Math.max(0,Math.round(artistPopulation(region))),schoolStudents=region.culturalLife?.artSchool?.founded?Math.max(0,Math.round(region.culturalLife.artSchool.students||0)):0,total=professionalArtists+schoolStudents;return {total:Math.min(Math.max(0,availableAfterMerchants),total),professionalArtists,schoolStudents};}
function recordExistingMaterialFlows(region,batteryOutput){
  const d=region.lightMetals?.demand||{};
  recordMaterialUse(region,'aluminium',d.aluminiumUsed||0,'civilian_light_metals');
  recordMaterialUse(region,'titanium',d.titaniumUsed||0,'civilian_light_metals');
  const cells=batteryOutput?.cells||{};
  const lead=Math.max(0,Number(cells.lead_acid_battery_cells)||0),advanced=Math.max(0,Number(cells.advanced_rechargeable_cells)||0),lithium=Math.max(0,Number(cells.lithium_ion_cells)||0);
  recordMaterialUse(region,'lead',lead*.78,'batteries');recordMaterialUse(region,'copper',lead*.025,'batteries');
  recordMaterialUse(region,'nickel',advanced*.34,'batteries');recordMaterialUse(region,'steel',advanced*.06,'batteries');recordMaterialUse(region,'copper',advanced*.04,'batteries');
  recordMaterialUse(region,'lithium',lithium*.10,'batteries');recordMaterialUse(region,'cobalt',lithium*.06,'batteries');recordMaterialUse(region,'nickel',lithium*.22,'batteries');recordMaterialUse(region,'graphite',lithium*.30,'batteries');recordMaterialUse(region,'aluminium',lithium*.035,'batteries');recordMaterialUse(region,'copper',lithium*.055,'batteries');
}
function normaliseReportMetadata(region){for(const key of ['conflict','structuralTransformation','industrialSupply','lightMetals','housing','employment','landUse','soil','agriculturalGenetics','cropBreeding','precisionAgriculture','cropBiotechnology','livestockAgriculture','alternativeProteins','agriculturalPests','batteryIndustry','circularEconomy'])if(region.report?.[key]&&!Number.isFinite(region.report[key].workers))region.report[key].workers=0;}

export function tickEconomy(regions,seaRegions,toolTypes,rng=Math.random,currentTick=null,elapsedDays=7,endDay=null){
  const reservations=[];
  for(const region of regions){tickAgriculturalLand(region);tickSoilDegradation(region,elapsedDays);tickAgriculturalLand(region);const previousOccupations={...(region.occupations||{})},housingConstruction=prepareHousingConstruction(region,elapsedDays),fullWorkingAge=Math.max(0,Number(region.demographics?.workingAge)||0),housingBuilders=Math.min(fullWorkingAge,Math.max(0,housingConstruction.workers||0));if(housingBuilders>0&&region.demographics)region.demographics.workingAge=Math.max(0,fullWorkingAge-housingBuilders);const workingAge=Math.max(0,Number(region.demographics?.workingAge)||0),merchants=committedMerchantCount(region),artists=committedArtistCount(region,workingAge-merchants),structural=prepareStructuralTransformation(region,elapsedDays),availableForStructural=Math.max(0,workingAge-merchants-artists.total),structuralScale=structural.total>availableForStructural&&structural.total>0?availableForStructural/structural.total:1,industrialSupport=structural.industrialSupport*structuralScale,services=structural.services*structuralScale,reserved=merchants+artists.total+industrialSupport+services;reservations.push([region,housingBuilders,housingConstruction,previousOccupations,merchants,artists,industrialSupport,services]);if(reserved>0&&region.demographics)region.demographics.workingAge=Math.max(0,region.demographics.workingAge-reserved);}
  tickAgriculturalGenetics(regions,elapsedDays);
  for(const region of regions){tickPrecisionAgriculture(region,elapsedDays);tickCropBiotechnology(region,elapsedDays);tickLivestockAgriculture(region,elapsedDays);tickAlternativeProteins(region,elapsedDays);}
  tickAgriculturalPests(regions,elapsedDays,rng);
  try{tickCoreEconomy(regions,seaRegions,toolTypes,rng,currentTick,elapsedDays,endDay);}finally{
    for(const [region,housingBuilders,housingConstruction,previousOccupations,merchants,artists,industrialSupport,services] of reservations){if(region.demographics)region.demographics.workingAge+=housingBuilders+merchants+artists.total+industrialSupport+services;if(!region.occupations)region.occupations={};region.occupations.trader=merchants;region.occupations.artist=Math.min(artists.professionalArtists,artists.total);region.occupations.artStudent=Math.max(0,artists.total-region.occupations.artist);region.occupations.industrialSupport=industrialSupport;region.occupations.services=services;region.occupations.housingBuilder=housingBuilders;finalizeStructuralTransformation(region,elapsedDays);tickIndustrialSupply(region,elapsedDays);tickLightMetals(region,elapsedDays);const batteryOutput=tickBatterySupplyChain(region,elapsedDays);recordExistingMaterialFlows(region,batteryOutput);tickCircularEconomy(region,elapsedDays);tickHouseholdFoodSecurity(region,elapsedDays);const housingEmployment=enforceHousingEmployment(region,previousOccupations);region.report||={};region.report.housing={workers:Math.round(housingBuilders),capacityBuilt:housingConstruction.capacityBuilt||0,materials:housingConstruction.materials||{wood:0,stone:0,clay:0},blockedWorkers:housingEmployment.blockedTotal||0,blockedBySite:housingEmployment.blockedBySite||{},...housingSummary(region)};region.report.industrialSupply={workers:0,capability:{...region.industrialSupply.capability},outputCapacity:{...region.industrialSupply.outputCapacity}};region.report.batteryIndustry={workers:0,...batteryOutput,shortages:{...(region.batteryIndustry?.shortages||{})}};tickAgriculturalLand(region);region.report.landUse={workers:0,...agriculturalLandSummary(region)};region.report.soil={workers:0,...soilDegradationSummary(region)};region.report.agriculturalGenetics={workers:0,...agriculturalGeneticsSummary(region)};region.report.cropBreeding={workers:0,...cropBreedingSummary(region)};region.report.precisionAgriculture={workers:0,...precisionAgricultureSummary(region)};region.report.cropBiotechnology={workers:0,...cropBiotechnologySummary(region)};region.report.livestockAgriculture={workers:0,...livestockAgricultureSummary(region)};region.report.alternativeProteins={workers:0,...alternativeProteinSummary(region)};if(region.report.farming){region.report.farming.land={...region.report.landUse};region.report.farming.soil={...region.report.soil};region.report.farming.genetics={...region.report.agriculturalGenetics};region.report.farming.breeding={...region.report.cropBreeding};region.report.farming.precisionAgriculture={...region.report.precisionAgriculture};region.report.farming.biotechnology={...region.report.cropBiotechnology};region.report.farming.livestock={...region.report.livestockAgriculture};region.report.farming.alternativeProteins={...region.report.alternativeProteins};region.report.farming.pests={...(region.report.agriculturalPests||{})};}normaliseReportMetadata(region);}
  }
  const activeWars=globalThis.__worldsim?.activeWars||[];
  tickNuclearWarRisk(regions,activeWars,currentTick??0,elapsedDays,rng);
  const nuclearEvents=tickNuclearExchange(regions,activeWars,currentTick??0,elapsedDays,rng);
  if(nuclearEvents.length&&globalThis.__worldsim){globalThis.__worldsim.events||=[];globalThis.__worldsim.events.push(...nuclearEvents);}
  return tickEmploymentAndHardship(regions,currentTick??0,elapsedDays,{playerPolityId:globalThis.__worldsim?.activePlayerPolityId||null});
}
