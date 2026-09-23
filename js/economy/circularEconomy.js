import { CONSTRUCTION_TYPES } from './construction.js?v=20260923-closed-loop1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

export const CIRCULAR_ECONOMY_TECH_IDS = Object.freeze({
  RECYCLING: 'industrial_materials_recycling',
  ADVANCED_RECOVERY: 'advanced_materials_recovery',
  ECODESIGN: 'industrial_ecodesign',
  URBAN_MINING: 'urban_mining',
  CLOSED_LOOP: 'closed_loop_metallurgy',
  ADVANCED_SUBSTITUTION: 'advanced_material_substitution',
});

export const MATERIAL_SPECS = Object.freeze({
  copper: { stockKey: 'copper', depositKeys: ['copper'], lifetimeYears: 32, maxRecovery: 1, criticality: .72, substitutability: .42, elemental: true },
  tin: { stockKey: 'tin', depositKeys: ['tin'], lifetimeYears: 24, maxRecovery: 1, criticality: .58, substitutability: .48, elemental: true },
  iron: { stockKey: 'iron', depositKeys: ['ironOre','iron'], lifetimeYears: 38, maxRecovery: 1, criticality: .35, substitutability: .64, elemental: true },
  steel: { stockKey: 'steel', depositKeys: ['ironOre','iron'], lifetimeYears: 42, maxRecovery: 1, criticality: .38, substitutability: .62, elemental: true },
  aluminium: { stockKey: 'aluminium', depositKeys: ['bauxite'], lifetimeYears: 28, maxRecovery: 1, criticality: .50, substitutability: .61, elemental: true },
  titanium: { stockKey: 'titanium', depositKeys: ['titanium_minerals'], lifetimeYears: 34, maxRecovery: 1, criticality: .69, substitutability: .31, elemental: true },
  lead: { stockKey: 'lead', depositKeys: ['lead'], lifetimeYears: 18, maxRecovery: 1, criticality: .44, substitutability: .58, elemental: true },
  lithium: { stockKey: 'battery_grade_lithium', depositKeys: ['lithium'], lifetimeYears: 13, maxRecovery: 1, criticality: .90, substitutability: .45, elemental: true },
  cobalt: { stockKey: 'battery_grade_cobalt', depositKeys: ['cobalt'], lifetimeYears: 13, maxRecovery: 1, criticality: .96, substitutability: .66, elemental: true },
  nickel: { stockKey: 'battery_grade_nickel', depositKeys: ['nickel'], lifetimeYears: 18, maxRecovery: 1, criticality: .77, substitutability: .54, elemental: true },
  graphite: { stockKey: 'battery_graphite', depositKeys: ['graphite'], lifetimeYears: 12, maxRecovery: .94, criticality: .73, substitutability: .50, elemental: false },
});

function tech(region, id) { return Boolean(region?.unlockedTechIds?.has?.(id)); }
function industry(region) { return clamp(region?.structuralTransformation?.capability?.manufacture || 0); }
function literacy(region) { return clamp(region?.massEducation?.literacy ?? region?.publicEducation?.literacy ?? region?.educationLevel ?? 0); }
function electricity(region) { return clamp(region?.electricity?.industrialService || 0); }

export function ensureCircularEconomy(region) {
  region.circularEconomy ||= {};
  const s = region.circularEconomy;
  s.policy ||= { collectionEffort:.18, recycledContentStandard:0, landfillDisincentive:.08, repairAndReuse:.12, recoveryInvestment:.10, urbanMiningEffort:0, materialSubstitution:0 };
  for (const key of ['collectionEffort','recycledContentStandard','landfillDisincentive','repairAndReuse','recoveryInvestment','urbanMiningEffort','materialSubstitution']) if (!Number.isFinite(s.policy[key])) s.policy[key]=0;
  s.capability ||= { collection:.08, sorting:.05, recovery:.04, ecodesign:0, urbanMining:0, closedLoop:0, substitution:0 };
  for (const key of ['collection','sorting','recovery','ecodesign','urbanMining','closedLoop','substitution']) if (!Number.isFinite(s.capability[key])) s.capability[key]=0;
  s.inUse ||= {}; s.scrap ||= {}; s.landfill ||= {}; s.pendingUse ||= {}; s.recovered ||= {}; s.losses ||= {}; s.materials ||= {}; s.accountedAssets ||= {};
  for (const key of Object.keys(MATERIAL_SPECS)) {
    if (!Number.isFinite(s.inUse[key])) s.inUse[key]=0;
    if (!Number.isFinite(s.scrap[key])) s.scrap[key]=0;
    if (!Number.isFinite(s.landfill[key])) s.landfill[key]=0;
    if (!Number.isFinite(s.pendingUse[key])) s.pendingUse[key]=0;
    if (!Number.isFinite(s.recovered[key])) s.recovered[key]=0;
    if (!Number.isFinite(s.losses[key])) s.losses[key]=0;
  }
  if (!Number.isFinite(s.circularityRate)) s.circularityRate=0;
  if (!Number.isFinite(s.virginDependence)) s.virginDependence=1;
  if (!Number.isFinite(s.materialSecurity)) s.materialSecurity=0;
  if (!Number.isFinite(s.durableControlMargin)) s.durableControlMargin=0;
  if (!Number.isFinite(s.electricityLoad)) s.electricityLoad=0;
  if (!Number.isFinite(s.plasticSubstitution)) s.plasticSubstitution=0;
  return s;
}

export function setCircularEconomyPolicy(region, patch={}) {
  const p=ensureCircularEconomy(region).policy;
  for (const key of ['collectionEffort','recycledContentStandard','landfillDisincentive','repairAndReuse','recoveryInvestment','urbanMiningEffort','materialSubstitution']) if (patch[key]!==undefined) p[key]=clamp(patch[key]);
  return {...p};
}

export function recordMaterialUse(region, material, amount, sector='general') {
  if (!MATERIAL_SPECS[material]) return 0;
  const used=nonNegative(amount); if (!used) return 0;
  const s=ensureCircularEconomy(region);
  s.pendingUse[material]=nonNegative(s.pendingUse[material])+used;
  s.materials[material] ||= {}; s.materials[material].lastSector=sector;
  return used;
}

export function recordMaterialDiscard(region, material, amount, {recoverableFraction=1}={}) {
  if (!MATERIAL_SPECS[material]) return 0;
  const discarded=nonNegative(amount); if (!discarded) return 0;
  const s=ensureCircularEconomy(region), recoverable=discarded*clamp(recoverableFraction);
  s.landfill[material]=nonNegative(s.landfill[material])+recoverable;
  s.losses[material]=nonNegative(s.losses[material])+(discarded-recoverable);
  return discarded;
}

function recordConstructionMaterial(region, resource, amount) {
  if (MATERIAL_SPECS[resource]) return recordMaterialUse(region,resource,amount,'infrastructure');
  if (resource==='bronze') {
    recordMaterialUse(region,'copper',amount*.9,'infrastructure');
    recordMaterialUse(region,'tin',amount*.1,'infrastructure');
    return amount;
  }
  return 0;
}

function accountCompletedInfrastructure(region,s) {
  for (const asset of region?.construction?.assets || []) {
    const id=String(asset?.id || ''); if (!id || s.accountedAssets[id]) continue;
    const type=CONSTRUCTION_TYPES[asset.typeId]; if (!type) continue;
    const scale=Math.max(.1,Number(asset.scale)||1);
    for (const [resource,amount] of Object.entries(type.materials || {})) recordConstructionMaterial(region,resource,nonNegative(amount)*scale);
    s.accountedAssets[id]=1;
  }
}

function depositReserve(deposit) {
  if (!deposit) return {remaining:0,initial:0,fraction:0};
  if (Array.isArray(deposit.tiers)) {
    let remaining=0,initial=0;
    for (const tier of deposit.tiers) { remaining+=nonNegative(tier.remainingStock); initial+=nonNegative(tier.initialStock); }
    return {remaining,initial,fraction:initial>0?clamp(remaining/initial):0};
  }
  const fraction=clamp(deposit.remainingFraction ?? (deposit.depth>0?1:0));
  return {remaining:fraction,initial:deposit.depth>0?1:0,fraction};
}

export function materialReserveStatus(region, material) {
  const spec=MATERIAL_SPECS[material]; if (!spec) return {fraction:0,remaining:0,initial:0};
  let remaining=0,initial=0; const deposits=region?.deposits || region?.resourceDeposits || {};
  for (const key of spec.depositKeys) { const d=depositReserve(deposits[key]); remaining+=d.remaining; initial+=d.initial; }
  return {remaining,initial,fraction:initial>0?clamp(remaining/initial):0};
}

function bootstrapKnowledge(region) {
  region.unlockedTechIds ||= new Set(); const ind=industry(region),lit=literacy(region),elec=electricity(region);
  if ((tech(region,'advanced_factories')||tech(region,'industrial_electrification'))&&ind>.34) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.RECYCLING);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.RECYCLING)&&tech(region,'industrial_electrification')&&ind>.55&&lit>.45&&elec>.35) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY)&&ind>.62&&lit>.58) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY)&&ind>.70&&lit>.62&&elec>.55) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.URBAN_MINING);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN)&&tech(region,CIRCULAR_ECONOMY_TECH_IDS.URBAN_MINING)&&ind>.82&&lit>.72&&elec>.72) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.CLOSED_LOOP);
  if (tech(region,CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN)&&ind>.78&&lit>.70&&elec>.62) region.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_SUBSTITUTION);
}

function updateCapability(region,s,years) {
  bootstrapKnowledge(region);
  const ind=industry(region),lit=literacy(region),elec=electricity(region),p=s.policy;
  const recycling=tech(region,CIRCULAR_ECONOMY_TECH_IDS.RECYCLING)?1:0,advanced=tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY)?1:0,ecodesign=tech(region,CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN)?1:0,urbanMining=tech(region,CIRCULAR_ECONOMY_TECH_IDS.URBAN_MINING)?1:0,closedLoop=tech(region,CIRCULAR_ECONOMY_TECH_IDS.CLOSED_LOOP)?1:0,advancedSub=tech(region,CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_SUBSTITUTION)?1:0;
  const targets={
    collection:clamp(.06+p.collectionEffort*.40+p.landfillDisincentive*.16+recycling*.18+advanced*.10+closedLoop*p.recoveryInvestment*.22),
    sorting:clamp(.04+ind*.18+lit*.10+recycling*.24+advanced*.24+closedLoop*p.recoveryInvestment*.28),
    recovery:clamp(.03+ind*.12+elec*.10+recycling*.22+advanced*.28+p.recoveryInvestment*.10+closedLoop*p.recoveryInvestment*.30),
    ecodesign:clamp(p.repairAndReuse*.16+p.recycledContentStandard*.18+ecodesign*.48+advancedSub*p.materialSubstitution*.18),
    urbanMining:clamp(urbanMining*(.16+ind*.18+elec*.14+p.urbanMiningEffort*.52)),
    closedLoop:clamp(closedLoop*(.12+ind*.18+lit*.10+elec*.16+p.recoveryInvestment*.44)),
    substitution:clamp(advancedSub*(.15+ind*.20+lit*.10+elec*.15+p.materialSubstitution*.40)),
  };
  const rate=clamp(years*(.18+ind*.20),0,.35);
  for (const [key,target] of Object.entries(targets)) s.capability[key]+=(target-s.capability[key])*rate;
  s.plasticSubstitution=clamp(s.capability.substitution*(.35+p.materialSubstitution*.65));
}

export function plasticDemandMultiplier(region) { return 1-clamp(ensureCircularEconomy(region).plasticSubstitution)*.95; }

function tickMaterial(region,s,material,years) {
  const spec=MATERIAL_SPECS[material],added=nonNegative(s.pendingUse[material]); s.pendingUse[material]=0;
  const repairLife=1+s.policy.repairAndReuse*.55+s.capability.ecodesign*.45;
  const retireRate=1-Math.exp(-years/Math.max(1,spec.lifetimeYears*repairLife));
  const retired=nonNegative(s.inUse[material])*retireRate;
  s.inUse[material]=Math.max(0,nonNegative(s.inUse[material])+added-retired);
  const collected=retired*clamp(s.capability.collection),uncollected=retired-collected;
  s.scrap[material]=nonNegative(s.scrap[material])+collected;
  const ordinaryCeiling=spec.elemental?(.78+s.capability.closedLoop*.22):spec.maxRecovery;
  const recoveryCeiling=clamp(Math.min(spec.maxRecovery,ordinaryCeiling),0,1);
  const recoveryEfficiency=clamp((.18+s.capability.sorting*.34+s.capability.recovery*.48)*recoveryCeiling,0,recoveryCeiling);
  const processRate=clamp(years*(.35+s.capability.recovery*1.8+s.policy.recoveryInvestment*.45),0,1);
  const scrapProcessed=s.scrap[material]*processRate,recoveredFromScrap=scrapProcessed*recoveryEfficiency,processLoss=scrapProcessed-recoveredFromScrap;
  s.scrap[material]=Math.max(0,s.scrap[material]-scrapProcessed);
  if (spec.elemental) s.landfill[material]=nonNegative(s.landfill[material])+uncollected+processLoss;
  else s.losses[material]=nonNegative(s.losses[material])+uncollected+processLoss;
  const landfillProcessRate=spec.elemental?clamp(years*s.capability.urbanMining*s.policy.urbanMiningEffort*.55,0,.55):0;
  const landfillProcessed=nonNegative(s.landfill[material])*landfillProcessRate;
  const landfillEfficiency=spec.elemental?clamp(.45+s.capability.sorting*.20+s.capability.recovery*.15+s.capability.closedLoop*.20,0,1):0;
  const recoveredFromLandfill=landfillProcessed*landfillEfficiency,landfillResidue=landfillProcessed-recoveredFromLandfill;
  s.landfill[material]=Math.max(0,nonNegative(s.landfill[material])-landfillProcessed+landfillResidue);
  const recovered=recoveredFromScrap+recoveredFromLandfill;
  s.recovered[material]+=recovered; region.stockpile ||= {}; region.stockpile[spec.stockKey]=nonNegative(region.stockpile[spec.stockKey])+recovered;
  const reserve=materialReserveStatus(region,material),annualUse=years>0?added/years:0;
  const secondaryShare=added>0?clamp(recovered/added):(retired>0?clamp(recovered/retired):0);
  const depletionPressure=annualUse>0?clamp((1-reserve.fraction)*spec.criticality*(1-secondaryShare*.90)):0;
  const substitution=clamp(spec.substitutability*(.25+s.capability.ecodesign*.35+s.capability.substitution*.25+industry(region)*.15));
  const security=clamp(reserve.fraction*.30+secondaryShare*.45+substitution*.15+s.capability.urbanMining*.10);
  const electricityCost=(scrapProcessed*(.002+recoveryEfficiency*.004)+landfillProcessed*(.006+landfillEfficiency*.006))*(1+s.policy.recoveryInvestment*.35);
  s.materials[material]={...(s.materials[material]||{}),added,retired,recovered,recoveredFromScrap,recoveredFromLandfill,landfillProcessed,reserveFraction:reserve.fraction,secondaryShare,depletionPressure,substitutionPotential:substitution,security,electricityCost};
  return s.materials[material];
}

export function tickCircularEconomy(region,elapsedDays=7) {
  const s=ensureCircularEconomy(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  accountCompletedInfrastructure(region,s);
  updateCapability(region,s,years);
  const results={}; for (const material of Object.keys(MATERIAL_SPECS)) results[material]=tickMaterial(region,s,material,years);
  const active=Object.values(results).filter(m=>m.added>0||m.retired>0||m.reserveFraction>0||m.recoveredFromLandfill>0);
  const weighted=active.length?active.reduce((a,m)=>{const w=.25+.75*(m.depletionPressure||.1);a.w+=w;a.secondary+=m.secondaryShare*w;a.security+=m.security*w;return a;},{w:0,secondary:0,security:0}):{w:1,secondary:0,security:.5};
  s.circularityRate=clamp(weighted.secondary/Math.max(.0001,weighted.w)); s.materialSecurity=clamp(weighted.security/Math.max(.0001,weighted.w)); s.virginDependence=clamp(1-s.circularityRate);
  const reserveFloor=active.length?Math.min(...active.map(m=>m.security)):.5;
  s.durableControlMargin=clamp(s.materialSecurity*.50+reserveFloor*.20+s.circularityRate*.20+s.capability.closedLoop*.10);
  s.electricityLoad=Object.values(results).reduce((sum,m)=>sum+nonNegative(m.electricityCost),0);
  region.report ||= {}; region.report.circularEconomy=circularEconomySummary(region); return s;
}

export function circularEconomySummary(region) {
  const s=ensureCircularEconomy(region);
  return {workers:0,policy:{...s.policy},capability:{...s.capability},circularityRate:s.circularityRate,virginDependence:s.virginDependence,materialSecurity:s.materialSecurity,durableControlMargin:s.durableControlMargin,electricityLoad:s.electricityLoad,plasticSubstitution:s.plasticSubstitution,materials:Object.fromEntries(Object.entries(s.materials).map(([k,v])=>[k,{...v,inUse:s.inUse[k],scrap:s.scrap[k],landfill:s.landfill[k],cumulativeRecovered:s.recovered[k],cumulativePermanentLosses:s.losses[k]}]))};
}
