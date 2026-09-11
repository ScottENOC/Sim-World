import assert from 'node:assert/strict';
import {
  chooseCurrencyForTerritories,
  currencyAvailability,
  currencyFiscalModifiers,
  currencyTradeFriction,
  debaseCurrency,
  foundCurrency,
  recordCurrencyContact,
  reformCurrency,
  tickCurrencyInstitution,
} from '../js/economy/currency.js?v=test';

function makeRegion(id, polityId) {
  return {
    id,
    name: id,
    governance: { sovereignPolityId: polityId },
    treasury: 1000,
    wallet: 500,
    militaryFinance: { revenueEma: 10, arrearsWeeks: 0 },
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
globalThis.__worldsim = { activePlayerPolityId: polity.id };

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

// A trusted foreign currency encountered through trade can displace a failed domestic currency.
const foreignPolity = {
  id: 'p2', kingdomSinceTick: 10,
  administration: { legitimacy: 0.8, accounting: 0.7 },
};
const foreignCapital = makeRegion('foreign', foreignPolity.id);
const allRegions = [...regions, foreignCapital];
foundCurrency(foreignPolity, foreignCapital, allRegions, 20);
foreignPolity.currency.trust = 0.92;
foreignCapital.currencyUse = { ...foreignCapital.currencyUse, trust: 0.92 };
polity.currency.trust = 0.2;
capital.currencyUse = { ...capital.currencyUse, trust: 0.2 };
recordCurrencyContact(capital, foreignCapital, 200);
chooseCurrencyForTerritories(polity, allRegions, 200);
assert.equal(capital.currencyUse.id, foreignCapital.currencyUse.id);
assert.notEqual(capital.currencyUse.issuerPolityId, polity.id);
assert.ok(currencyFiscalModifiers(capital).collection >= 1);

// Monetary failure is a regime history, not a permanent national stain.
const oldId = polity.currency.id;
polity.administration.legitimacy = 0.72;
polity.administration.accounting = 0.7;
capital.treasury = 10000;
const reformed = reformCurrency(polity, capital, allRegions, 400);
assert.equal(reformed.changed, true);
assert.notEqual(polity.currency.id, oldId);
assert.equal(polity.currency.fineness, 1);
assert.ok(polity.currency.trust > 0.65);
assert.equal(polity.currency.history.at(-1).id, oldId);

console.log('currency institution regressions passed');
