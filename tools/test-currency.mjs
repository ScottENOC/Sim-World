import assert from 'node:assert/strict';
import {
  currencyAvailability,
  currencyFiscalModifiers,
  currencyTradeFriction,
  debaseCurrency,
  foundCurrency,
  tickCurrencyInstitution,
} from '../js/economy/currency.js?v=test';

function makeRegion(id, polityId) {
  return {
    id,
    name: id,
    governance: { sovereignPolityId: polityId },
    treasury: 100,
    wallet: 500,
    militaryFinance: { revenueEma: 10 },
    tradeEconomy: { weeklyExports: 100 },
    unlockedTechIds: new Set(['coinage']),
  };
}

const polity = {
  id: 'p1',
  kingdomSinceTick: 10,
  administration: { legitimacy: 0.62, accounting: 0.5 },
};
const capital = makeRegion('capital', polity.id);
const province = makeRegion('province', polity.id);
const regions = [capital, province];

assert.equal(currencyAvailability({ ...polity, kingdomSinceTick: null }, capital).available, false);
assert.equal(currencyAvailability({ ...polity, administration: { legitimacy: 0.4 } }, capital).available, false);
assert.equal(currencyAvailability(polity, capital).available, true);

const founded = foundCurrency(polity, capital, regions, 20);
assert.equal(founded.changed, true);
assert.equal(capital.currencyUse.id, province.currencyUse.id);
assert.ok(currencyFiscalModifiers(capital).collection > 1);
assert.ok(currencyTradeFriction(capital, province) < 1);

const trustBefore = polity.currency.trust;
const treasuryBefore = capital.treasury;
const debased = debaseCurrency(polity, capital, regions, 0.25, 30);
assert.equal(debased.changed, true);
assert.ok(capital.treasury > treasuryBefore);
assert.ok(polity.currency.fineness < 1);
assert.ok(polity.currency.undisclosedDebasement > 0);

let discovered = false;
for (let i = 0; i < 20 && !discovered; i += 1) {
  const events = tickCurrencyInstitution(polity, capital, regions, 365, 40 + i * 52);
  discovered = events.some((event) => event.type === 'currency_debasement_discovered');
}
assert.equal(discovered, true);
assert.equal(polity.currency.undisclosedDebasement, 0);
assert.ok(polity.currency.trust < trustBefore);

capital.currencyUse.trust = 0.1;
province.currencyUse.trust = 0.1;
assert.ok(currencyTradeFriction(capital, province) > 1);
assert.ok(currencyFiscalModifiers(capital).collection <= 1);

console.log('currency institution regressions passed');
