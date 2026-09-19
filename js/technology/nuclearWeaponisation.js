import { nuclearIndustrialReadiness } from '../economy/nuclearPower.js?v=20260920-nuclear1';
import { ensureStrategicNuclearState, NUCLEAR_PROGRAMME_POSTURES, ISOTOPE_SEPARATION_TECH_ID, SPENT_FUEL_REPROCESSING_TECH_ID } from '../economy/strategicNuclear.js?v=20260920-strategic-nuclear1';
import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260920-nuclear-weaponisation1';
import { ensureNuclearWeaponState, NUCLEAR_WEAPONISATION_TECH_ID, NUCLEAR_TEST_VALIDATION_TECH_ID } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

function deliberatePosture(region){
  const p=ensureStrategicNuclearState(region).policy.posture;
  return p===NUCLEAR_PROGRAMME_POSTURES.STRATEGIC?1:p===NUCLEAR_PROGRAMME_POSTURES.HEDGE?.3:0;
}

export function nuclearWeaponisationBreakthroughChances(region){
  region.unlockedTechIds ||= new Set();
  const tech=region.unlockedTechIds;
  const readiness=nuclearIndustrialReadiness(region);
  const precision=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const computing=clamp(region.computingIndustry?.capability||region.industrialSupply?.capability?.computing||0);
  const labs=effectiveInfrastructureCount(region,'nuclear_weapons_research_establishment');
  const material=Math.max(0,Number(region.stockpile?.strategic_uranium_material)||0)+Math.max(0,Number(region.stockpile?.separated_plutonium)||0);
  const deliberate=deliberatePosture(region);
  const fuelCycle=tech.has(ISOTOPE_SEPARATION_TECH_ID)||tech.has(SPENT_FUEL_REPROCESSING_TECH_ID);
  const weaponisation=tech.has(NUCLEAR_WEAPONISATION_TECH_ID)||!fuelCycle||labs<=0||material<=0||deliberate<=0?0:
    readiness*(.40+precision*.35+computing*.10+Math.min(1,labs)*.15)*deliberate*0.0000014;
  const state=ensureNuclearWeaponState(region);
  const validation=tech.has(NUCLEAR_TEST_VALIDATION_TECH_ID)||!tech.has(NUCLEAR_WEAPONISATION_TECH_ID)||state.weaponisationProgress<.35?0:
    readiness*(.42+precision*.30+state.programmeExperience*.28)*0.0000022;
  return {weaponisation:clamp(weaponisation),validation:clamp(validation)};
}

export function tickNuclearWeaponisationBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const scale=Math.max(0,Number(elapsedDays)||0)/7;
  const events=[];
  for(const region of regions||[]){
    region.unlockedTechIds ||= new Set();
    const c=nuclearWeaponisationBreakthroughChances(region);
    if(!region.unlockedTechIds.has(NUCLEAR_WEAPONISATION_TECH_ID)&&rng()<1-Math.pow(1-c.weaponisation,scale)){
      region.unlockedTechIds.add(NUCLEAR_WEAPONISATION_TECH_ID);
      events.push({type:'nuclear_weaponisation_breakthrough',regionId:region.id,regionName:region.name,tick:currentTick,title:'Nuclear weaponisation programme',message:`${region.name} has developed the scientific and industrial capability to pursue an experimental nuclear explosive device.`});
      continue;
    }
    if(!region.unlockedTechIds.has(NUCLEAR_TEST_VALIDATION_TECH_ID)&&rng()<1-Math.pow(1-c.validation,scale)){
      region.unlockedTechIds.add(NUCLEAR_TEST_VALIDATION_TECH_ID);
      events.push({type:'nuclear_test_validation_breakthrough',regionId:region.id,regionName:region.name,tick:currentTick,title:'Nuclear device validation methods',message:`${region.name} can now plan an instrumented nuclear test programme to validate an experimental device.`});
    }
  }
  return events;
}

export {NUCLEAR_WEAPONISATION_TECH_ID,NUCLEAR_TEST_VALIDATION_TECH_ID};
