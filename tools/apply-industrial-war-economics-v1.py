from pathlib import Path

# Add industrial ammunition as ordinary strategic trade goods.
p=Path('js/economy/tradeGoods.js'); t=p.read_text()
anchor="  firearms:       { label: 'Firearms', basePrice: 95, referenceStock: 120, category: 'military_equipment', strategic: true, cargoKgPerUnit: 4 },\n"
insert=anchor+"  small_arms_ammunition: { label: 'Small-arms ammunition', basePrice: 12, referenceStock: 500, category: 'military_supply', strategic: true, cargoKgPerUnit: 0.35 },\n  artillery_shells: { label: 'Artillery shells', basePrice: 38, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 4.5 },\n"
if 'small_arms_ammunition:' not in t:
    if anchor not in t: raise RuntimeError('trade good anchor missing')
    t=t.replace(anchor,insert,1)
p.write_text(t)

# Modern rapid-fire advantages now consume manufactured ammunition/shells, not raw ingredients directly.
p=Path('js/military/modernLandWarfare.js'); t=p.read_text()
old=""" const weeks=Math.max(.1,elapsedDays/7); const rate=(breech ? .35 : 0)+(magazine ? .75 : 0)+(mg?1.15:0);\n const powderNeed=personnel*armed*.006*rate*weeks*(smokeless ? .82 : 1); const shotNeed=personnel*armed*.0018*rate*weeks;\n const supply=Math.min(clamp(logisticsSupply),powderNeed>0?clamp((region.stockpile?.gunpowder||0)/powderNeed):1,shotNeed>0?clamp(availableShotMetal(region)/shotNeed):1);\n let powderUsed=0,shotUsed=0;if(consumeSupplies&&supply>0){powderUsed=powderNeed*supply;shotUsed=shotNeed*supply;region.stockpile.gunpowder=Math.max(0,(region.stockpile.gunpowder||0)-powderUsed);consumeShotMetal(region,shotUsed);}\n"""
new=""" const weeks=Math.max(.1,elapsedDays/7); const rate=(breech ? .35 : 0)+(magazine ? .75 : 0)+(mg?1.15:0);\n const ammunitionNeeded=personnel*armed*.018*rate*weeks*(smokeless ? .9 : 1);\n const supply=Math.min(clamp(logisticsSupply),ammunitionNeeded>0?clamp((region.stockpile?.small_arms_ammunition||0)/ammunitionNeeded):1);\n let ammunitionUsed=0;if(consumeSupplies&&supply>0){ammunitionUsed=ammunitionNeeded*supply;region.stockpile.small_arms_ammunition=Math.max(0,(region.stockpile.small_arms_ammunition||0)-ammunitionUsed);}\n"""
if 'const ammunitionNeeded=personnel' not in t:
    if old not in t: raise RuntimeError('modern infantry ammo anchor missing')
    t=t.replace(old,new,1)
t=t.replace("ammoSupply:supply,powderUsed,shotUsed,breech,magazine,smokeless,machineGuns:mg","ammoSupply:supply,ammunitionUsed,powderUsed:0,shotUsed:0,breech,magazine,smokeless,machineGuns:mg")
old2=""" const weeks=Math.max(.1,elapsedDays/7);\n const extraFactor=Math.max(0,ammoMultiplier-1);\n const powderNeed=guns*.06*extraFactor*weeks*(smokeless ? .86 : 1);\n const shotNeed=guns*.022*extraFactor*weeks;\n const ammoSupply=Math.min(clamp(logisticsSupply),powderNeed>0?clamp((region.stockpile?.gunpowder||0)/powderNeed):1,shotNeed>0?clamp(availableShotMetal(region)/shotNeed):1);\n let powderUsed=0,shotUsed=0;if(consumeSupplies&&ammoSupply>0){powderUsed=powderNeed*ammoSupply;shotUsed=shotNeed*ammoSupply;region.stockpile.gunpowder=Math.max(0,(region.stockpile.gunpowder||0)-powderUsed);consumeShotMetal(region,shotUsed);}\n"""
new2=""" const weeks=Math.max(.1,elapsedDays/7);\n const extraFactor=Math.max(0,ammoMultiplier-1);\n const shellsNeeded=guns*.16*extraFactor*weeks;\n const ammoSupply=Math.min(clamp(logisticsSupply),shellsNeeded>0?clamp((region.stockpile?.artillery_shells||0)/shellsNeeded):1);\n let shellsUsed=0;if(consumeSupplies&&ammoSupply>0){shellsUsed=shellsNeeded*ammoSupply;region.stockpile.artillery_shells=Math.max(0,(region.stockpile.artillery_shells||0)-shellsUsed);}\n"""
if 'const shellsNeeded=guns' not in t:
    if old2 not in t: raise RuntimeError('modern artillery ammo anchor missing')
    t=t.replace(old2,new2,1)
t=t.replace("ammoMultiplier,ammoSupply,powderUsed,shotUsed,breech,quick,heavy","ammoMultiplier,ammoSupply,shellsUsed,powderUsed:0,shotUsed:0,breech,quick,heavy")
p.write_text(t)

# Trade reliability falls in regions suffering industrial war disruption.
p=Path('js/economy/trade.js'); t=p.read_text()
imp="import { warTradeDisruptionMultiplier } from './industrialWarEconomy.js?v=20260918-industrial-war1';\n"
anchor="import { corporateVentureCapacityMultiplier } from './corporateCapital.js?v=20260913-capital2';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('trade import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
old="""  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB));\n"""
new="""  return clamp01(Math.pow(clamp01((security - 0.2) / 0.8), 2) * tradeRelationMultiplier(regionA, regionB) *\n    warTradeDisruptionMultiplier(regionA) * warTradeDisruptionMultiplier(regionB));\n"""
if 'warTradeDisruptionMultiplier(regionA)' not in t:
    if old not in t: raise RuntimeError('trade reliability anchor missing')
    t=t.replace(old,new,1)
p.write_text(t)

# Fix deployed-force payroll and add wartime logistics, sovereign borrowing and debt service.
p=Path('js/economy/stateFinance.js'); t=p.read_text()
old="""    stateCapacity: 1,\n"""
new="""    stateCapacity: 1, publicDebt: 0, weeklyInterestDue: 0, weeklyInterestPaid: 0, borrowedThisWeek: 0, sovereignCreditLimit: 0,\n"""
if 'publicDebt: 0' not in t:
    if old not in t: raise RuntimeError('finance defaults anchor missing')
    t=t.replace(old,new,1)
oldpay="""    const payrollDue = (Math.max(0, region.army.personnel || 0) * SOLDIER_UPKEEP_PER_WEEK +\n      Math.max(0, region.navy.personnel || 0) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK) * weekScale /\n      classical.payrollEfficiency;\n    const payrollPaid = Math.min(Math.max(0, region.treasury || 0), payrollDue);\n"""
newpay="""    const deployedPersonnel = Math.max(0, region.army.away || 0);\n    const militiaPersonnel = Math.max(0, region.emergencyMilitiaPersonnel || 0);\n    const logisticsDue = Math.max(0, region.warEconomy?.weeklyLogisticsCost || 0) * weekScale;\n    const payrollDue = ((Math.max(0, region.army.personnel || 0) + deployedPersonnel) * SOLDIER_UPKEEP_PER_WEEK +\n      militiaPersonnel * SOLDIER_UPKEEP_PER_WEEK * 0.72 +\n      Math.max(0, region.navy.personnel || 0) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK) * weekScale /\n      classical.payrollEfficiency + logisticsDue;\n\n    const stateCredit = Math.max(0, Math.min(1, region.medievalCommerce?.finance?.stateCredit || 0));\n    const annualRevenue = Math.max(0, finance.revenueEma) * 52;\n    const debtBurden = finance.publicDebt / Math.max(1, annualRevenue);\n    const annualInterestRate = 0.025 + (1 - stateCredit) * 0.09 + Math.min(0.18, debtBurden * 0.025);\n    const interestDue = finance.publicDebt * annualInterestRate / 52 * weekScale;\n    finance.sovereignCreditLimit = annualRevenue * (0.25 + stateCredit * 4.75);\n    finance.borrowedThisWeek = 0;\n    const wartime = (region.warEconomy?.activeCampaigns || 0) > 0 || deployedPersonnel > 0;\n    const cashNeed = Math.max(0, payrollDue + interestDue - Math.max(0, region.treasury || 0));\n    if (wartime && stateCredit > 0.12 && cashNeed > 0) {\n      const borrowing = Math.min(cashNeed, Math.max(0, finance.sovereignCreditLimit - finance.publicDebt));\n      finance.publicDebt += borrowing; finance.borrowedThisWeek = borrowing; region.treasury += borrowing;\n    }\n    const interestPaid = Math.min(Math.max(0, region.treasury || 0), interestDue);\n    region.treasury -= interestPaid; region.wallet += interestPaid;\n    finance.weeklyInterestDue = interestDue; finance.weeklyInterestPaid = interestPaid;\n    if (interestPaid < interestDue) { finance.publicDebt += interestDue - interestPaid; region.stability = Math.max(0, region.stability - 0.0005 * weekScale); }\n\n    const payrollPaid = Math.min(Math.max(0, region.treasury || 0), payrollDue);\n"""
if 'const deployedPersonnel = Math.max(0, region.army.away' not in t:
    if oldpay not in t: raise RuntimeError('payroll anchor missing')
    t=t.replace(oldpay,newpay,1)
oldnext="""    const nextPayroll = (Math.max(0, region.army.personnel) * SOLDIER_UPKEEP_PER_WEEK +\n      Math.max(0, region.navy.personnel) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK) /\n      classical.payrollEfficiency;\n"""
newnext="""    const nextPayroll = ((Math.max(0, region.army.personnel) + Math.max(0, region.army.away || 0)) * SOLDIER_UPKEEP_PER_WEEK +\n      Math.max(0, region.emergencyMilitiaPersonnel || 0) * SOLDIER_UPKEEP_PER_WEEK * 0.72 +\n      Math.max(0, region.navy.personnel) * SAILOR_UPKEEP_PER_WEEK +\n      Math.max(0, region.horseEconomy?.war || 0) * WAR_HORSE_UPKEEP_PER_WEEK) /\n      classical.payrollEfficiency + Math.max(0, region.warEconomy?.weeklyLogisticsCost || 0);\n"""
if newnext not in t:
    if oldnext not in t: raise RuntimeError('next payroll anchor missing')
    t=t.replace(oldnext,newnext,1)
oldreport="""      administrationInKind, classicalFiscalProfile: classical,\n"""
newreport="""      administrationInKind, classicalFiscalProfile: classical, deployedPersonnel, militiaPersonnel, logisticsDue,\n      publicDebt: finance.publicDebt, borrowedThisWeek: finance.borrowedThisWeek, sovereignCreditLimit: finance.sovereignCreditLimit,\n      interestDue: finance.weeklyInterestDue, interestPaid: finance.weeklyInterestPaid,\n"""
if 'publicDebt: finance.publicDebt' not in t:
    if oldreport not in t: raise RuntimeError('finance report anchor missing')
    t=t.replace(oldreport,newreport,1)
p.write_text(t)

# Integrate industrial war economy after gunpowder industry, before trade and state finance.
p=Path('js/main.js'); t=p.read_text()
imp="import { tickIndustrialWarEconomy } from './economy/industrialWarEconomy.js?v=20260918-industrial-war1';\n"
anchor="import { tickGunpowderIndustry } from './military/firearms.js?v=20260912-gunpowder1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('main import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
call="    profiler.measure('Industrial war economy', () => tickIndustrialWarEconomy(regions, activeCampaigns, time.elapsedDays));\n"
anchor2="    profiler.measure('Early-modern military industry', () => tickEarlyModernIndustry(regions, time.elapsedDays));\n"
if call not in t:
    if anchor2 not in t: raise RuntimeError('main tick anchor missing')
    t=t.replace(anchor2,anchor2+call,1)
p.write_text(t)
print('industrial war economics integration applied')
# retrigger after ammunition regression fixture update
