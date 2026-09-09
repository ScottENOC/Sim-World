import assert from 'node:assert/strict';
import { ensureLanguageNetwork, dominantLanguageId } from '../js/diplomacy/languageNetworks.js';
import { languageShiftPressure } from '../js/diplomacy/languageChange.js';
import { LANGUAGE_POLICIES, ensureRegionalLanguagePolicy, regionalLanguagePolicyAssessment, setRegionalLanguagePolicy, tickRegionalLanguagePolicies } from '../js/politics/languagePolicy.js';

function region(id, culture, polityId, relationship = 'core') {
  return {
    id, name: id, population: 10000, stability: 0.6, treasury: 100,
    cultureGroups: [{ identityId: culture, share: 1 }], relations: new Map(),
    governance: {
      sovereignPolityId: polityId, relationship, autonomy: relationship === 'core' ? 0 : 0.4,
      administrativeControl: relationship === 'core' ? 1 : 0.5,
      governor: { competence: 0.7, loyalty: 0.7 }, delegatedPowers: {}, corruption: 0.3,
    },
  };
}

const capital = region('capital', 'state-culture', 'P');
capital.treasury = 1000;
const province = region('province', 'local-culture', 'P', 'delegated');
const polity = { id: 'P', capitalRegionId: 'capital', administration: { officialdom: 0.55, communications: 0.5, recordKeeping: 0.5 } };
const regions = [capital, province];
const polities = [polity];
const stateLang = dominantLanguageId(capital);
const localLang = dominantLanguageId(province);
assert.notEqual(stateLang, localLang);

// Local-language administration protects legitimacy/language but sacrifices central efficiency.
let policy = ensureRegionalLanguagePolicy(province);
policy.mode = LANGUAGE_POLICIES.LOCAL;
const local = regionalLanguagePolicyAssessment(province, capital, polity);
assert.ok(local.controlMultiplier < 1, 'local-language administration should weaken central control when languages differ');
assert.ok(local.stabilityWeekly > 0, 'local-language administration should support local legitimacy/stability');
assert.ok(local.localRetentionBonus > 0, 'local-language administration should protect language retention');

// Bilingual government is usually the politically easier compromise, but it must cost materially more.
let result = setRegionalLanguagePolicy(province, LANGUAGE_POLICIES.BILINGUAL, { playerChoice: true, currentTick: 1 });
assert.equal(result.changed, true);
const bilingual = regionalLanguagePolicyAssessment(province, capital, polity);
assert.ok(bilingual.costPerWeek > local.costPerWeek * 2, 'bilingual administration must consume materially more resources');
assert.ok(bilingual.stabilityWeekly >= 0, 'bilingual administration should not impose the state-language unrest penalty');

// State-language rule is cheap but initially a poor bargain when locals do not understand it.
policy.mode = LANGUAGE_POLICIES.STATE;
let state = regionalLanguagePolicyAssessment(province, capital, polity);
assert.ok(state.costPerWeek < bilingual.costPerWeek, 'state-language standardisation should be cheaper than bilingual administration');
assert.ok(state.stabilityWeekly < 0, 'imposing an unfamiliar state language should create political friction');
assert.ok(state.controlMultiplier < bilingual.controlMultiplier, 'an unfamiliar state language should initially administer worse than a staffed bilingual system');

// Once locals and officials actually know the state language, standardisation can become efficient.
const net = ensureLanguageNetwork(province);
net.secondLanguage[stateLang] = { passive: 0.7, basic: 0.55, working: 0.4, fluent: 0.22, literate: 0.12 };
net.specialists[stateLang] = { conversational: 20, working: 12, fluent: 5, literate: 4, scribes: 2, interpreters: 2 };
state = regionalLanguagePolicyAssessment(province, capital, polity);
assert.ok(state.controlMultiplier > 1, 'state-language administration can become efficient after real language acquisition');
assert.ok(state.reportDelayMultiplier < 1, 'a genuinely shared administrative language should speed reporting');

// Vassal government cannot be micromanaged into a royal language policy.
const vassal = region('vassal', 'vassal-culture', 'P', 'vassal');
result = setRegionalLanguagePolicy(vassal, LANGUAGE_POLICIES.STATE, { playerChoice: true });
assert.equal(result.changed, false);
assert.equal(result.reason, 'local_ruler_controls_administration');

// Weekly policy execution spends real treasury and writes effects used by polity administration.
policy.mode = LANGUAGE_POLICIES.BILINGUAL;
policy.lockedByPlayer = true;
const beforeTreasury = capital.treasury;
tickRegionalLanguagePolicies(regions, polities, 10, 7, { playerPolityId: 'P' });
assert.ok(capital.treasury < beforeTreasury, 'administrative language policy must have a real fiscal cost');
assert.ok(province.governance.languagePolicyEffects?.controlMultiplier > 0);
assert.deepEqual(ensureLanguageNetwork(province).institutions.administration.sort(), [localLang, stateLang].sort(), 'bilingual policy should actually institutionalise both languages');

// Language policy affects generational shift rather than only current administration.
policy.mode = LANGUAGE_POLICIES.LOCAL;
tickRegionalLanguagePolicies(regions, polities, 11, 7, { playerPolityId: 'P' });
const localPressure = languageShiftPressure(province, localLang, stateLang);
policy.mode = LANGUAGE_POLICIES.STATE;
tickRegionalLanguagePolicies(regions, polities, 12, 7, { playerPolityId: 'P' });
const imposedPressure = languageShiftPressure(province, localLang, stateLang);
assert.ok(imposedPressure > localPressure, 'state-language policy should increase long-run shift pressure toward the state language');

console.log('regional language policy regressions passed');
