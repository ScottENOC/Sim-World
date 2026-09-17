from pathlib import Path

# Government economic AI reviews regulation alongside investment/procurement.
p=Path('js/economy/governmentEconomicPolicy.js'); s=p.read_text()
if "reviewNpcEconomicRegulation" not in s:
    s="import { reviewNpcEconomicRegulation } from './economicRegulation.js';\n"+s
old="    chooseNpcProcurementPolicy(polity,{securityThreat:security,industrialAmbition:ambition,domesticCapability:capability,capitalShortage:shortage,foreignDependence:dependence});\n    const nextInvestment=ensureInvestmentPolicy(polity),nextProcurement=ensureProcurementPolicy(polity).infrastructure;"
new="    chooseNpcProcurementPolicy(polity,{securityThreat:security,industrialAmbition:ambition,domesticCapability:capability,capitalShortage:shortage,foreignDependence:dependence});\n    const regulationReview=reviewNpcEconomicRegulation(polity,territories,{securityThreat:security,industrialAmbition:ambition,capitalShortage:shortage,foreignDependence:dependence});\n    const nextInvestment=ensureInvestmentPolicy(polity),nextProcurement=ensureProcurementPolicy(polity).infrastructure;"
if old not in s: raise RuntimeError('government policy anchor missing')
s=s.replace(old,new,1)
s=s.replace("changes.push({polityId:polity.id,investment:{...nextInvestment},procurement:nextProcurement,metrics:","changes.push({polityId:polity.id,investment:{...nextInvestment},procurement:nextProcurement,regulationChanges:regulationReview.changes,metrics:",1)
p.write_text(s)

# Private firms receive the dimension-specific regulation profile.
p=Path('js/economy/corporateCapital.js'); s=p.read_text()
old="const leverage = firm.debtIndex / Math.max(0.01, firm.capitalIndex);const regulation=clamp(region.economicRegulation?.enterpriseStandards ?? region.economicRegulation?.labourStandards ?? s.corporateLaw*.35);const labourPower=clamp(region.medievalSociety?.urban?.guilds || 0);"
new="const leverage = firm.debtIndex / Math.max(0.01, firm.capitalIndex);const regulation=region.economicRegulation || clamp(s.corporateLaw*.35);const labourPower=clamp(region.medievalSociety?.urban?.guilds || 0);"
if old not in s: raise RuntimeError('corporate regulation anchor missing')
s=s.replace(old,new,1); p.write_text(s)

# SOE/infrastructure assets receive the same dimension-specific regulation profile.
p=Path('js/economy/corporateInfrastructure.js'); s=p.read_text()
old="regulation:clamp(region.economicRegulation?.enterpriseStandards ?? .25)"
new="regulation:(region.economicRegulation || .25)"
if old not in s: raise RuntimeError('infrastructure regulation anchor missing')
s=s.replace(old,new); p.write_text(s)

# Load the player Treasurer regulation panel.
p=Path('index.html'); s=p.read_text()
anchor='  <script type="module" src="js/ui/institutionalCouncilSpendingUi.js?v=20260916-institution-ui2"></script>\n'
addition=anchor+'  <script type="module" src="js/ui/economicRegulationUi.js?v=20260917-regulation1"></script>\n'
if 'economicRegulationUi.js' not in s:
    if anchor not in s: raise RuntimeError('index UI anchor missing')
    s=s.replace(anchor,addition,1)
p.write_text(s)
print('admin regulation integration applied')
