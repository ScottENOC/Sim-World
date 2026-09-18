from pathlib import Path

def repl(path, old, new):
 p=Path(path); t=p.read_text()
 if new in t: return
 if old not in t: raise SystemExit(f'missing pattern in {path}: {old[:80]}')
 p.write_text(t.replace(old,new,1))

repl('js/economy/tradeGoods.js',
"  clothes:    { label: 'Clothing', basePrice: 7, referenceStock: 600, category: 'consumer_good', cargoKgPerUnit: 0.6 },\n",
"  clothes:    { label: 'Clothing', basePrice: 7, referenceStock: 600, category: 'consumer_good', cargoKgPerUnit: 0.6 },\n  motor_vehicle: { label: 'Motor vehicles', basePrice: 80, referenceStock: 90, category: 'civilian_equipment', cargoKgPerUnit: 900 },\n")

p=Path('js/economy/industrialInvestment.js');t=p.read_text()
old="function manageProductLine(region,productId,demand,margin){\n  const plant=ensureIndustrialPlantState(region);let line=lineFor(plant,productId);\n  if(demand>.08&&margin>.26){\n    if(!line){const candidate=idleCandidate(plant,productId);line=candidate?retoolProductionLine(region,candidate.id,productId):addProductionLine(region,{productId,capacityShare:productId==='motor_vehicle'?.48:.35});}\n    ensureComponentOrdersAndLines(region,productId,demand);\n    region.industrialOrders ||= {};region.industrialOrders[productId]=Math.max(region.industrialOrders[productId]||0,demand);\n  } else if(line&&margin<.14){line.idleWeeks=Math.max(line.idleWeeks||0,104);line.status='mothballed';}\n}\n"
new="function availableInvestmentCapital(region){\n  const firms=region.corporateCapital?.firms?.filter(f=>f.status==='active'&&f.sector==='manufacture')||[];\n  const firmCapital=firms.reduce((s,f)=>s+Math.max(0,f.capitalIndex||0),0);\n  return firmCapital+Math.max(0,region.corporateCapital?.investibleWealth||0)*.08;\n}\nfunction financeTooling(region,cost){\n  if(cost<=0)return true;const available=availableInvestmentCapital(region);if(available<cost)return false;\n  const firms=region.corporateCapital?.firms?.filter(f=>f.status==='active'&&f.sector==='manufacture')||[];let left=cost;\n  for(const f of firms){const take=Math.min(left,Math.max(0,f.capitalIndex||0)*.12);f.capitalIndex=Math.max(0,(f.capitalIndex||0)-take);left-=take;if(left<=0)break;}\n  if(left>0&&region.corporateCapital)region.corporateCapital.investibleWealth=Math.max(0,(region.corporateCapital.investibleWealth||0)-left/.08);\n  return true;\n}\nfunction manageProductLine(region,productId,demand,margin){\n  const plant=ensureIndustrialPlantState(region);let line=lineFor(plant,productId);\n  if(demand>.08&&margin>.26){\n    if(!line){const candidate=idleCandidate(plant,productId);const toolingCost=candidate?.productId?(.14+(1-(candidate.toolingFit||.3))*.18):.32;if(!financeTooling(region,toolingCost))return;line=candidate?retoolProductionLine(region,candidate.id,productId):addProductionLine(region,{productId,capacityShare:productId==='motor_vehicle'?.48:.35});line.investmentCost=(line.investmentCost||0)+toolingCost;}\n    ensureComponentOrdersAndLines(region,productId,demand);\n    region.industrialOrders ||= {};region.industrialOrders[productId]=Math.max(region.industrialOrders[productId]||0,demand);\n  } else if(line&&margin<.14){line.idleWeeks=Math.max(line.idleWeeks||0,104);line.status='mothballed';}\n}\n"
if old not in t: raise SystemExit('missing manageProductLine')
p.write_text(t.replace(old,new,1))
print('industrial investment integration applied')
