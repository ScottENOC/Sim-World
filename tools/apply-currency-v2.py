from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace_once(path, old, new, label):
    p = root / path
    s = p.read_text()
    count = s.count(old)
    assert count == 1, f'{label}: expected 1 match, got {count}'
    p.write_text(s.replace(old, new, 1))

# Trade records which currencies merchants actually encounter.
replace_once('js/economy/trade.js',
"import { currencyTradeFriction } from './currency.js?v=20260912-currency1';",
"import { currencyTradeFriction, recordCurrencyContact } from './currency.js?v=20260912-currency2';",
'trade currency import')
replace_once('js/economy/trade.js',
"    recordDirectTrade(origin, dest, venture.soldVolume, currentTick);\n    recordDiplomaticTrade(origin, dest, payment, currentTick);",
"    recordDirectTrade(origin, dest, venture.soldVolume, currentTick);\n    recordCurrencyContact(origin, dest, currentTick);\n    recordDiplomaticTrade(origin, dest, payment, currentTick);",
'trade currency contact')

# Currency implementation changed; bust dependent module caches too.
replace_once('js/economy/stateFinance.js',
"./currency.js?v=20260912-currency1",
"./currency.js?v=20260912-currency2",
'state finance cache')
replace_once('js/politics/polities.js',
"../economy/currency.js?v=20260912-currency1",
"../economy/currency.js?v=20260912-currency2",
'polities cache')

replace_once('js/main.js',
"./economy/trade.js?v=20260912-deep-profiler1",
"./economy/trade.js?v=20260912-currency2",
'main trade cache')
replace_once('js/main.js',
"./economy/stateFinance.js?v=20260905-projects1",
"./economy/stateFinance.js?v=20260912-currency2",
'main state finance cache')
replace_once('js/main.js',
"./politics/polities.js?v=20260904-war1",
"./politics/polities.js?v=20260912-currency2",
'main polity cache')

replace_once('index.html',
"js/main.js?v=20260912-currency1",
"js/main.js?v=20260912-currency2",
'index main cache')
replace_once('index.html',
"js/ui/currencyUi.js?v=20260912-currency1",
"js/ui/currencyUi.js?v=20260912-currency2",
'index currency UI cache')
