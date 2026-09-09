import assert from 'node:assert/strict';
import { adoptInstitutionalLanguage, ensureLanguageNetwork, nativeShare, refreshNativeLanguageCommunities } from '../js/diplomacy/languageNetworks.js';
import { languageShiftPressure, tickGenerationalLanguageChange } from '../js/diplomacy/languageChange.js';

function region(id, groups) {
  return {
    id, population: 100000, cultureGroups: groups.map(([identityId, share]) => ({ identityId, share })),
    tradePartnerIds: [], recentTradePartners: new Map(), urbanisation: 0.2,
  };
}

// Language and ancestry/culture are related but no longer the same state variable.
const r = region('r', [['a', 0.8], ['b', 0.2]]);
refreshNativeLanguageCommunities(r);
const a = 'lang:a', b = 'lang:b';
assert.ok(Math.abs(nativeShare(r, a) - 0.8) < 1e-9);
const n = ensureLanguageNetwork(r);
n.secondLanguage[b] = { passive: 0.5, basic: 0.4, working: 0.3, fluent: 0.1, literate: 0 };
adoptInstitutionalLanguage(r, 'administration', b);
adoptInstitutionalLanguage(r, 'court', b);
n.culturalPrestige[b] = 0.8;
const pressure = languageShiftPressure(r, a, b);
assert.ok(pressure > 0.05, 'prestigious institutional bilingual language should exert shift pressure');
tickGenerationalLanguageChange([r], 365.2425 * 30);
assert.ok(nativeShare(r, a) < 0.8, 'language shift should change native language share across generations');
assert.ok(nativeShare(r, b) > 0.2);

// Culture migration still changes the language population, but does not erase prior language shift.
const beforeMigrationB = nativeShare(r, b);
r.cultureGroups[0].share = 0.7;
r.cultureGroups[1].share = 0.3;
refreshNativeLanguageCommunities(r);
assert.ok(nativeShare(r, b) > beforeMigrationB, 'new migrant/cultural population should bring its native language');
assert.ok(nativeShare(r, a) < 0.7 + 0.02, 'refresh must not snap language state back to culture shares');

// A concentrated minority with its own cultural/religious institutions resists replacement.
const protectedMinority = region('protected', [['x', 0.7], ['y', 0.3]]);
refreshNativeLanguageCommunities(protectedMinority);
const pn = ensureLanguageNetwork(protectedMinority);
pn.secondLanguage['lang:x'] = { passive: 0.6, basic: 0.5, working: 0.4, fluent: 0.2, literate: 0 };
adoptInstitutionalLanguage(protectedMinority, 'religious', 'lang:y');
adoptInstitutionalLanguage(protectedMinority, 'cultural', 'lang:y');
const protectedPressure = languageShiftPressure(protectedMinority, 'lang:y', 'lang:x');
const unprotected = region('unprotected', [['x2', 0.7], ['y2', 0.3]]);
refreshNativeLanguageCommunities(unprotected);
const un = ensureLanguageNetwork(unprotected);
un.secondLanguage['lang:x2'] = { passive: 0.6, basic: 0.5, working: 0.4, fluent: 0.2, literate: 0 };
const unprotectedPressure = languageShiftPressure(unprotected, 'lang:y2', 'lang:x2');
assert.ok(protectedPressure < unprotectedPressure, 'minority institutions should materially improve language retention');

// Long-lived, strongly bilingual mixed communities can produce a new mixed language.
const mixed = region('mixed', [['m1', 0.52], ['m2', 0.48]]);
refreshNativeLanguageCommunities(mixed);
const mn = ensureLanguageNetwork(mixed);
mn.secondLanguage['lang:m1'] = { passive: 0.4, basic: 0.3, working: 0.15, fluent: 0.08, literate: 0 };
mn.secondLanguage['lang:m2'] = { passive: 0.4, basic: 0.3, working: 0.15, fluent: 0.08, literate: 0 };
let events = tickGenerationalLanguageChange([mixed], 365.2425 * 70);
assert.ok(events.some(e => e.type === 'mixed_language_emerged'), 'sustained bilingual contact can eventually generate a mixed language');
const mixedId = events.find(e => e.type === 'mixed_language_emerged').languageId;
assert.ok(nativeShare(mixed, mixedId) > 0);

// Isolated speech communities can eventually diverge into daughter languages.
const isolated = region('island', [['old', 1]]);
refreshNativeLanguageCommunities(isolated);
events = tickGenerationalLanguageChange([isolated], 365.2425 * 320);
assert.ok(events.some(e => e.type === 'daughter_language_emerged'), 'centuries of strong isolation can produce a daughter language');

console.log('generational language change regressions passed');
