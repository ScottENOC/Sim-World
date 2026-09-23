import assert from 'node:assert/strict';
import { advisorForReport, advisorFramedTitle, advisorReviewLabel } from '../js/ui/advisorAttention.js';

assert.equal(advisorForReport('Naval battle', 'Our fleet lost two ships.'), 'marshal');
assert.equal(advisorForReport('Trade route disrupted', 'Merchants report imports have fallen.'), 'treasurer');
assert.equal(advisorForReport('Reservoirs running low', 'Water restrictions may soon be needed.'), 'steward');
assert.equal(advisorForReport('Envoy expelled', 'Our diplomat has been ordered home.'), 'envoy');
assert.equal(advisorForReport('Religious unrest', 'A dispute over doctrine is spreading.'), 'priest');
assert.equal(advisorForReport('Foreign steel observed', 'Traders brought unfamiliar steel tools.'), 'spymaster', 'technology remains knowledge/intelligence even when merchants carry the report');
assert.equal(advisorForReport('Technological breakthrough', 'Our smiths have learned steelmaking.'), 'spymaster');
assert.equal(advisorForReport('Succession dispute', 'The legitimacy of the government is contested.'), 'chancellor');
assert.equal(advisorForReport('A strange matter', 'Something unusual has happened.'), 'chancellor', 'unclassified ruler business should default to the Chancellor');

assert.equal(advisorFramedTitle('Naval battle', 'marshal'), 'Marshal: Naval battle');
assert.equal(advisorFramedTitle('Marshal: Naval battle', 'marshal'), 'Marshal: Naval battle', 'advisor framing must be idempotent');
assert.equal(advisorReviewLabel('steward'), 'Review with Steward');

console.log('Advisor attention regressions passed.');
