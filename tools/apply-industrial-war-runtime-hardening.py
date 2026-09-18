from pathlib import Path

# Modern weapon syntax fix.
p=Path('js/military/modernLandWarfare.js')
t=p.read_text().replace('(mg?.12:0)','(mg ? .12 : 0)').replace('(mg?.34:0)','(mg ? .34 : 0)')
p.write_text(t)

# War economy runtime/fiscal hardening.
p=Path('js/economy/industrialWarEconomy.js')
t=p.read_text()
t=t.replace("function damagedInfrastructureNeed(region){\n const assets=ensureConstruction(region).assets||[];\n return assets.reduce((sum,a)=>sum+Math.max(0,1-(Number(a.condition)??1))*Math.max(.5,Number(a.scale)||1),0);\n}\n",
"function damagedInfrastructureNeed(region,polities=[]){\n const assets=ensureConstruction(region).assets||[];\n const built=assets.reduce((sum,a)=>{const condition=Number.isFinite(Number(a.condition))?Number(a.condition):1;return sum+Math.max(0,1-condition)*Math.max(.5,Number(a.scale)||1);},0);\n const rail=(polities||[]).flatMap(p=>p.railways?.lines||[]).filter(line=>line.fromRegionId===region.id||line.toRegionId===region.id).reduce((sum,line)=>{const condition=Number.isFinite(Number(line.condition))?Number(line.condition):1;return sum+Math.max(0,1-condition)*Math.max(.5,(Number(line.lengthKm)||50)/100);},0);\n return built+rail;\n}\n")
old="""function produceMunitions(region,elapsedDays){
 region.stockpile ||= {}; region.marketDemand ||= {};
 const industrial=ensureIndustrialSupply(region);
 const years=Math.max(0,elapsedDays)/DAYS_PER_YEAR;
 const precision=clamp(industrial.capability?.precision_machining||0);
 const steel=clamp(industrial.capability?.steelmaking||0);
 const firearmPractice=clamp(region.firearms?.readiness||0);
 const base=clamp(precision*.42+steel*.28+firearmPractice*.30);
 let smallArms=0,shells=0;
 const personnel=Math.max(0,(region.army?.personnel||0)+(region.army?.away||0)+(region.emergencyMilitiaPersonnel||0));
 if(modernInfantry(region)){
  const target=personnel*(region.warEconomy?.activeCampaigns?0.34:0.10);
  const gap=Math.max(0,target-(region.stockpile.small_arms_ammunition||0));
  const capacity=Math.max(0,base*personnel*.9*years);
  const powderNeedPer=0.035,metalNeedPer=0.012;
  smallArms=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer);
  if(smallArms>0){region.stockpile.gunpowder-=smallArms*powderNeedPer;consumeMetal(region,smallArms*metalNeedPer);region.stockpile.small_arms_ammunition=(region.stockpile.small_arms_ammunition||0)+smallArms;}
  region.marketDemand.small_arms_ammunition=Math.max(region.marketDemand.small_arms_ammunition||0,gap/Math.max(1,elapsedDays/7));
 }
 if(modernArtillery(region)){
  const guns=Math.max(0,(region.earlyModernMilitary?.artillery?.inventory?.length||0)+(region.earlyModernMilitary?.artillery?.away?.length||0));
  const target=guns*(region.warEconomy?.activeCampaigns?18:5);
  const gap=Math.max(0,target-(region.stockpile.artillery_shells||0));
  const capacity=Math.max(0,base*(2+guns*9)*years);
  const powderNeedPer=.16,metalNeedPer=.09;
  shells=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer);
  if(shells>0){region.stockpile.gunpowder-=shells*powderNeedPer;consumeMetal(region,shells*metalNeedPer);region.stockpile.artillery_shells=(region.stockpile.artillery_shells||0)+shells;}
  region.marketDemand.artillery_shells=Math.max(region.marketDemand.artillery_shells||0,gap/Math.max(1,elapsedDays/7));
 }
 return{smallArms,shells,value:smallArms*12+shells*38};
}
"""
new="""function produceMunitions(region,elapsedDays){
 region.stockpile ||= {}; region.marketDemand ||= {};
 const industrial=ensureIndustrialSupply(region);
 const years=Math.max(0,elapsedDays)/DAYS_PER_YEAR;
 const precision=clamp(industrial.capability?.precision_machining||0);
 const steel=clamp(industrial.capability?.steelmaking||0);
 const firearmPractice=clamp(region.firearms?.readiness||0);
 const base=clamp(precision*.42+steel*.28+firearmPractice*.30);
 let smallArms=0,shells=0,spending=0;
 const personnel=Math.max(0,(region.army?.personnel||0)+(region.army?.away||0)+(region.emergencyMilitiaPersonnel||0));
 if(modernInfantry(region)){
  const target=personnel*(region.warEconomy?.activeCampaigns?0.34:0.10);
  const gap=Math.max(0,target-(region.stockpile.small_arms_ammunition||0));
  const capacity=Math.max(0,base*personnel*.9*years);
  const powderNeedPer=.035,metalNeedPer=.012,cashNeedPer=.004;
  smallArms=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer,Math.max(0,region.treasury||0)/cashNeedPer);
  if(smallArms>0){const cash=smallArms*cashNeedPer;region.stockpile.gunpowder-=smallArms*powderNeedPer;consumeMetal(region,smallArms*metalNeedPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.small_arms_ammunition=(region.stockpile.small_arms_ammunition||0)+smallArms;}
  region.marketDemand.small_arms_ammunition=Math.max(region.marketDemand.small_arms_ammunition||0,gap/Math.max(1,elapsedDays/7));
 }
 if(modernArtillery(region)){
  const guns=Math.max(0,(region.earlyModernMilitary?.artillery?.inventory?.length||0)+(region.earlyModernMilitary?.artillery?.away?.length||0));
  const target=guns*(region.warEconomy?.activeCampaigns?18:5);
  const gap=Math.max(0,target-(region.stockpile.artillery_shells||0));
  const capacity=Math.max(0,base*(2+guns*9)*years);
  const powderNeedPer=.16,metalNeedPer=.09,cashNeedPer=.025;
  shells=Math.min(gap,capacity,(region.stockpile.gunpowder||0)/powderNeedPer,((region.stockpile.steel||0)+(region.stockpile.iron||0))/metalNeedPer,Math.max(0,region.treasury||0)/cashNeedPer);
  if(shells>0){const cash=shells*cashNeedPer;region.stockpile.gunpowder-=shells*powderNeedPer;consumeMetal(region,shells*metalNeedPer);region.treasury=Math.max(0,region.treasury-cash);region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.artillery_shells=(region.stockpile.artillery_shells||0)+shells;}
  region.marketDemand.artillery_shells=Math.max(region.marketDemand.artillery_shells||0,gap/Math.max(1,elapsedDays/7));
 }
 return{smallArms,shells,spending,value:smallArms*12+shells*38};
}
"""
if old not in t: raise RuntimeError('produceMunitions anchor missing')
t=t.replace(old,new)
t=t.replace('export function tickIndustrialWarEconomy(regions,campaigns=[],elapsedDays=7){','export function tickIndustrialWarEconomy(regions,campaigns=[],elapsedDays=7,polities=[]){')
t=t.replace('const reconstruction=damagedInfrastructureNeed(region)+Math.max(0,region.warDamage?.infrastructureDamage||0)*2.5;','const reconstruction=damagedInfrastructureNeed(region,polities);')
t=t.replace('region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells};','region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,munitionsSpending:output.spending};')
p.write_text(t)

# Actually run the war economy before trade each world tick.
p=Path('js/main.js')
t=p.read_text()
anchor="    for (const region of regions) tickHouseholdEnergy(region, time.elapsedDays);\n    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements, profiler));\n"
replacement="    for (const region of regions) tickHouseholdEnergy(region, time.elapsedDays);\n    profiler.measure('Industrial war economy', () => tickIndustrialWarEconomy(regions, activeCampaigns, time.elapsedDays, polities));\n    profiler.measure('Trade', () => tickTrade(regions, calendarWeek, time, agreements, profiler));\n"
if anchor not in t: raise RuntimeError('main war economy anchor missing')
t=t.replace(anchor,replacement,1)
p.write_text(t)

# Tests.
p=Path('tools/test-industrial-war-economics.mjs')
t=p.read_text()
t=t.replace('marketDemand:{}, treasury:0, wallet:10000,','marketDemand:{}, treasury:20, wallet:10000,')
t=t.replace("const r=region();\nconst campaign=", "const r=region();\nconst treasuryBeforeMunitions=r.treasury;\nconst walletBeforeMunitions=r.wallet;\nconst campaign=")
t=t.replace("assert.ok(r.stockpile.artillery_shells>0,'industrial state should manufacture artillery shells');", "assert.ok(r.stockpile.artillery_shells>0,'industrial state should manufacture artillery shells');\nassert.ok(r.treasury<treasuryBeforeMunitions,'munitions production should consume public procurement cash');\nassert.ok(r.wallet>walletBeforeMunitions,'domestic munitions spending should return cash to the domestic economy');\nassert.ok(r.report.warEconomy.munitionsSpending>0,'war economy report should expose munitions spending');")
t=t.replace("assert.ok(r.warEconomy.reconstructionNeed>0,'damaged infrastructure should create reconstruction need');", "assert.ok(r.warEconomy.reconstructionNeed>0,'damaged infrastructure should create reconstruction need');\nr.construction.assets[0].condition=1; r.warDamage.infrastructureDamage=999;\ntickIndustrialWarEconomy([r],[],7);\nassert.equal(r.warEconomy.reconstructionNeed,0,'historical bombardment totals should not make reconstruction need permanent after repairs');\ntickIndustrialWarEconomy([r],[campaign],7);")
p.write_text(t)
print('industrial war runtime hardening applied')
