from pathlib import Path
root=Path(__file__).resolve().parents[1]

def rep(path, old, new):
    p=root/path; s=p.read_text(); assert old in s, f'missing {path}: {old}'; p.write_text(s.replace(old,new))

p=root/'js/economy/currency.js'
s=p.read_text()
if not s.startswith("import { forexSettlementMultiplier }"):
    s="import { forexSettlementMultiplier } from './forex.js?v=20260912-forex1';\n\n"+s
s=s.replace("  const trust = Math.max(a?.trust ?? 0, b?.trust ?? 0);\n  return Math.max(0.94, Math.min(1.12, 1.02 - trust * 0.08));",
            "  const trust = Math.max(a?.trust ?? 0, b?.trust ?? 0);\n  const acceptance = Math.max(0.94, Math.min(1.12, 1.02 - trust * 0.08));\n  return acceptance * forexSettlementMultiplier(regionA, regionB);")
p.write_text(s)

for path in ['js/economy/stateFinance.js','js/economy/trade.js','js/politics/polities.js','js/ui/currencyUi.js']:
    p=root/path; s=p.read_text().replace('currency.js?v=20260912-currency2','currency.js?v=20260912-currency3'); p.write_text(s)
rep('index.html','js/main.js?v=20260912-currency2','js/main.js?v=20260912-forex1')
rep('index.html','js/ui/currencyUi.js?v=20260912-currency2','js/ui/currencyUi.js?v=20260912-forex1')
