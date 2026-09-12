import assert from 'node:assert/strict';
import { medievalFxQuote, forexSettlementMultiplier, currencyCommodityValue } from '../js/economy/forex.js?v=test';

function currency(id, trust, fineness, issuer = id) {
  return { id, name: id, issuerPolityId: issuer, trust, fineness, active: true };
}
function region(id, use, contacts = {}) {
  return {
    id,
    currencyUse: use,
    currencyContacts: contacts,
    unlockedTechIds: new Set(['coinage']),
    tradeEconomy: { weeklyExports: 100 },
    construction: { completed: [] },
  };
}

const soundA = currency('a', 0.9, 1);
const soundB = currency('b', 0.88, 1);
const debased = currency('bad', 0.3, 0.55);
const a = region('ra', soundA, { b: soundB, bad: debased });
const b = region('rb', soundB, { a: soundA });

assert.ok(currencyCommodityValue(soundA) > currencyCommodityValue(debased));
const quote = medievalFxQuote(a, soundA, soundB);
assert.equal(quote.available, true);
assert.ok(quote.rate > 0);
assert.ok(quote.spread > 0 && quote.spread < 0.2);

const badQuote = medievalFxQuote(a, debased, soundB);
assert.ok(badQuote.midRate < quote.midRate, 'debased coin should exchange at a lower underlying value');
assert.ok(badQuote.spread > quote.spread, 'distrusted coin should attract a wider changer spread');

assert.equal(forexSettlementMultiplier(a, a), 1);
assert.ok(forexSettlementMultiplier(a, b) > 1, 'different currencies should add conversion cost');

console.log('medieval forex regressions passed');
