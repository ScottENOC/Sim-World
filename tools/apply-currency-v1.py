from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace_once(path, old, new, label):
    p = root / path
    s = p.read_text()
    count = s.count(old)
    assert count == 1, f'{label}: expected 1 match, got {count}'
    p.write_text(s.replace(old, new, 1))

replace_once('js/economy/stateFinance.js',
"import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260907-classical1';\n",
"import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260907-classical1';\nimport { currencyFiscalModifiers } from './currency.js?v=20260912-currency1';\n",
'state finance import')
replace_once('js/economy/stateFinance.js',
"  const relays = operationalInfrastructure(region, 'relay_stations') ? 1 : 0;\n  return {\n    collection: 1 + standardWeights * 0.08 + formalTaxation * 0.14 + coinage * 0.05 + mint * 0.05,\n    tradeDuty: 1 + standardWeights * 0.1 + coinage * 0.08 + mint * 0.07,\n    adminEfficiency: 1 + formalTaxation * 0.10 + relays * 0.08 + mint * 0.03,\n    payrollEfficiency: 1 + coinage * 0.06 + mint * 0.06,\n  };",
"  const relays = operationalInfrastructure(region, 'relay_stations') ? 1 : 0;\n  const currency = currencyFiscalModifiers(region);\n  return {\n    collection: (1 + standardWeights * 0.08 + formalTaxation * 0.14 + coinage * 0.05 + mint * 0.05) * currency.collection,\n    tradeDuty: (1 + standardWeights * 0.1 + coinage * 0.08 + mint * 0.07) * currency.tradeDuty,\n    adminEfficiency: (1 + formalTaxation * 0.10 + relays * 0.08 + mint * 0.03) * currency.adminEfficiency,\n    payrollEfficiency: (1 + coinage * 0.06 + mint * 0.06) * currency.payrollEfficiency,\n    currency,\n  };",
'state finance modifiers')
replace_once('js/economy/trade.js',
"import { collectTransitTolls, estimateTransitToll } from './transitTolls.js?v=20260907-transit1';\n",
"import { collectTransitTolls, estimateTransitToll } from './transitTolls.js?v=20260907-transit1';\nimport { currencyTradeFriction } from './currency.js?v=20260912-currency1';\n",
'trade import')
replace_once('js/economy/trade.js',
"  if (geometry.adjacent) return LAND_ADJACENT_COST / landTransport;",
"  if (geometry.adjacent) return LAND_ADJACENT_COST / landTransport * currencyTradeFriction(regionA, regionB);",
'trade adjacent cost')
replace_once('js/economy/trade.js',
"    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier * passageFactor;",
"    return SEA_COST_PER_KM * geometry.distanceKm * seaTransportProfile(regionA, regionB).costMultiplier * passageFactor * currencyTradeFriction(regionA, regionB);",
'trade sea cost')
replace_once('js/economy/trade.js',
"  return (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / landTransport;",
"  return (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / landTransport * currencyTradeFriction(regionA, regionB);",
'trade nonadjacent cost')
replace_once('js/economy/trade.js',
"      cost: SEA_COST_PER_KM * geometry.distanceKm * sea.costMultiplier * (1 + physicalFriction),",
"      cost: SEA_COST_PER_KM * geometry.distanceKm * sea.costMultiplier * (1 + physicalFriction) * currencyTradeFriction(origin, dest),",
'venture sea cost')
replace_once('js/economy/trade.js',
"  const cost = geometry.adjacent\n    ? LAND_ADJACENT_COST / directLandTransport\n    : (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / directLandTransport;",
"  const moneyFriction = currencyTradeFriction(origin, dest);\n  const cost = geometry.adjacent\n    ? LAND_ADJACENT_COST / directLandTransport * moneyFriction\n    : (LAND_ADJACENT_COST * 2 + SEA_COST_PER_KM * geometry.distanceKm * 0.25) / directLandTransport * moneyFriction;",
'venture land cost')
replace_once('js/politics/polities.js',
"import { languagePolicyAdministrativeEffects } from './languagePolicy.js?v=20260909-language-policy1';\n",
"import { languagePolicyAdministrativeEffects } from './languagePolicy.js?v=20260909-language-policy1';\nimport { ensureCurrencyInstitution, tickCurrencyInstitution } from '../economy/currency.js?v=20260912-currency1';\n",
'polity currency import')
replace_once('js/politics/polities.js',
"    polities.push(polity);",
"    ensureCurrencyInstitution(polity);\n    polities.push(polity);",
'polity init currency')
replace_once('js/politics/polities.js',
"    updateCapabilities(polity, capital, subjects);\n    const admin = polity.administration;",
"    updateCapabilities(polity, capital, subjects);\n    events.push(...tickCurrencyInstitution(polity, capital, regions, elapsedDays, currentTick));\n    const admin = polity.administration;",
'polity tick currency')
replace_once('index.html',
"  <script type=\"module\" src=\"js/ui/culturalLifeUi.js?v=20260907-art1\"></script>\n  <script type=\"module\" src=\"js/main.js?v=20260912-culture-scale1\"></script>",
"  <script type=\"module\" src=\"js/ui/culturalLifeUi.js?v=20260907-art1\"></script>\n  <script type=\"module\" src=\"js/main.js?v=20260912-currency1\"></script>\n  <script type=\"module\" src=\"js/ui/currencyUi.js?v=20260912-currency1\"></script>",
'index scripts')
