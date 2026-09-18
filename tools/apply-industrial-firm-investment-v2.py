from pathlib import Path

def apply(path,repls):
 p=Path(path);text=p.read_text()
 for old,new in repls:
  if new in text: continue
  if old not in text: raise SystemExit(f'missing pattern {path}: {old[:120]!r}')
  text=text.replace(old,new,1)
 p.write_text(text)

apply('js/economy/industrialPlant.js',[
("function factoryAssets(region){return (region.construction?.assets||[]).filter(a=>a.typeId==='factory'&&(a.condition??1)>.15);}\nfunction baseFactoryCapacity(region){\n  const assets=factoryAssets(region); if(!assets.length)return 0;\n  const sophistication=clamp(region.industrialProduction?.factorySophistication||0);\n  const advanced=hasTech(region,'advanced_factories')?1:0;\n  return assets.reduce((sum,a)=>sum+Math.max(.2,a.scale||1)*clamp(a.condition??1),0)*(24+advanced*10+sophistication*16);\n}",
"function factoryAssets(region){\n  const publicAssets=(region.construction?.assets||[]).filter(a=>a.typeId==='factory'&&(a.condition??1)>.15).map(a=>({source:'construction',scale:Math.max(.2,a.scale||1),condition:clamp(a.condition??1)}));\n  const corporateAssets=(region.corporateInfrastructure?.assets||[]).filter(a=>a.type==='factory'&&a.status==='operational'&&(a.condition??1)>.15).map(a=>({source:'corporate',scale:Math.max(.2,a.effectiveCapacity||a.baseCapacity||1),condition:clamp(a.condition??1)}));\n  return [...publicAssets,...corporateAssets];\n}\nfunction baseFactoryCapacity(region){\n  const assets=factoryAssets(region); if(!assets.length)return 0;\n  const sophistication=clamp(region.industrialProduction?.factorySophistication||0);\n  const advanced=hasTech(region,'advanced_factories')?1:0;\n  return assets.reduce((sum,a)=>sum+Math.max(.2,a.scale||1)*clamp(a.condition??1),0)*(24+advanced*10+sophistication*16);\n}")
])

apply('js/economy/industrialInvestment.js',[
("export function ensureIndustrialInvestmentState(region){\n  region.industrialInvestment ||= {demandEma:{},marginEma:{},subsidyRate:{},procurement:{},last:{}};",
"export function ensureIndustrialInvestmentState(region){\n  region.industrialInvestment ||= {demandEma:{},marginEma:{},subsidyRate:{},procurement:{},last:{},factoryInvestmentSignal:0};"),
("  s.demandEma ||= {}; s.marginEma ||= {}; s.subsidyRate ||= {}; s.procurement ||= {}; s.last ||= {};",
"  s.demandEma ||= {}; s.marginEma ||= {}; s.subsidyRate ||= {}; s.procurement ||= {}; s.last ||= {}; if(!Number.isFinite(s.factoryInvestmentSignal))s.factoryInvestmentSignal=0;"),
("export function tickIndustrialInvestment(region,elapsedDays=7){\n  const s=ensureIndustrialInvestmentState(region);if(industrialFactoryCapacity(region)<=0){s.last={factoryCapacity:0};return s;}\n  const demands={};",
"function factoryDemandSignal(region){\n  const pop=clamp(Math.log1p(Math.max(0,region.population||0))/12);\n  const urban=clamp(region.structuralTransformation?.urbanShare||region.urbanisation?.urbanShare||0);\n  const finance=clamp(region.corporateCapital?.financialDepth||0);\n  const motor=region.unlockedTechIds?.has?.('automobile')?1:0;\n  const tariff=importTariffRate(region,'motor_vehicle');\n  const subsidy=clamp(ensureIndustrialInvestmentState(region).subsidyRate.motor_vehicle||0,0,.8);\n  const army=Math.max(0,(region.army?.personnel||0)+(region.army?.away||0));\n  const war=region.warEconomy?.activeCampaigns>0?1:0;\n  return clamp(pop*.22+urban*.20+finance*.20+motor*.16+clamp(tariff/1.5)*.10+subsidy*.08+clamp(army/20000)*.05+war*.12);\n}\n\nexport function tickIndustrialInvestment(region,elapsedDays=7){\n  const s=ensureIndustrialInvestmentState(region);\n  const targetSignal=factoryDemandSignal(region);s.factoryInvestmentSignal+= (targetSignal-s.factoryInvestmentSignal)*clamp(YEARS(elapsedDays)*1.6,0,.3);\n  if(industrialFactoryCapacity(region)<=0){s.last={factoryCapacity:0,factoryInvestmentSignal:s.factoryInvestmentSignal};region.report ||= {};region.report.industrialInvestment=s.last;return s;}\n  const demands={};"),
("  s.last={...s.last,factoryCapacity:industrialFactoryCapacity(region),demands,margins:{...s.marginEma},tariffSupport:importTariffRate(region,'motor_vehicle')};",
"  s.last={...s.last,factoryCapacity:industrialFactoryCapacity(region),factoryInvestmentSignal:s.factoryInvestmentSignal,demands,margins:{...s.marginEma},tariffSupport:importTariffRate(region,'motor_vehicle')};")
])

apply('js/economy/corporateInfrastructureAi.js',[
("case'factory':return .2+urban*.45;",
"case'factory':return .2+urban*.45+clamp(region.industrialInvestment?.factoryInvestmentSignal||0)*.55;")
])

p=Path('tools/test-industrial-investment.mjs');text=p.read_text()
needle="const unprotected=baseRegion('free');"
insert="""const noFactory=baseRegion('no-factory');\nnoFactory.construction.assets=noFactory.construction.assets.filter(a=>a.typeId!=='factory');\nfor(let i=0;i<8;i++)tickIndustrialInvestment(noFactory,90);\nassert((noFactory.industrialInvestment.factoryInvestmentSignal||0)>.2,'profitable industrial demand should create a private factory investment signal even before capacity exists');\n\nconst privateFactory=baseRegion('private-factory');\nprivateFactory.construction.assets=privateFactory.construction.assets.filter(a=>a.typeId!=='factory');\nprivateFactory.corporateInfrastructure={assets:[{id:'corp-f1',type:'factory',status:'operational',condition:1,baseCapacity:1,effectiveCapacity:1}]};\ntickIndustrialInvestment(privateFactory,90);\nassert((privateFactory.industrialInvestment.last.factoryCapacity||0)>0,'an operational privately-owned corporate factory must count as real industrial capacity');\nassert(privateFactory.industrialPlants.lines.length>0,'private factory capacity should be usable by the component and assembly-line economy');\n\n"""
if insert not in text:
 if needle not in text: raise SystemExit('test insertion point missing')
 text=text.replace(needle,insert+needle,1)
p.write_text(text)
print('industrial firm investment v2 applied')
