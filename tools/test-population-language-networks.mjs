import assert from 'node:assert/strict';
import {
  adoptInstitutionalLanguage,
  courtLanguageCompetence,
  dominantLanguageId,
  ensureLanguageNetwork,
  languagePopulationProfile,
  recordCulturalExposure,
  recordLanguageContactPopulation,
  sharedCommunicationLanguage,
  specialistLanguageCapability,
} from '../js/diplomacy/languageNetworks.js';
import { chooseMessageMedium, recordLanguageContact } from '../js/diplomacy/languageCommunication.js';

function region(id, cultureId, familyId = cultureId, population = 100000) {
  return {
    id, name: id, population,
    cultureGroups: [{ identityId: cultureId, cultureId, share: 1 }],
    communicationState: { writingAvailable: false, archiveAvailable: false, breakthroughs: [], messengerExperience: 0 },
    languageNetwork: {
      communities: { [`lang:${cultureId}`]: { share: 1, familyId: `langfam:${familyId}` } },
      secondLanguage: {}, specialists: {}, culturalExposure: {}, culturalPrestige: {},
      institutions: { court: [`lang:${cultureId}`], administration: [`lang:${cultureId}`], legal: [], military: [], trade: [], religious: [], cultural: [] },
      mediaPractices: { oral: 0.12, manuscript: 0, print: 0, recorded: 0, broadcast: 0, screen: 0, networked: 0 },
    },
  };
}

const aus = region('aus', 'english', 'germanic', 26000000);
const rus = region('rus', 'russian', 'slavic', 140000000);
recordLanguageContactPopulation(aus, rus, 1, 'diplomacy');
const russian = 'lang:russian';
const pop = languagePopulationProfile(aus, russian);
const specs = specialistLanguageCapability(aus, russian);
assert.ok(pop.workingShare < 0.0001, 'diplomatic contact must not make a meaningful share of the whole population bilingual');
assert.ok(specs.working > 0, 'the same contact can grow a small specialist pool');

// Build the Japanese/Chinese-business-in-English pattern: neither side speaks the other's language,
// but both courts have enough English specialists to use it as a lingua franca.
const japan = region('jp', 'japanese', 'japonic');
const china = region('cn', 'mandarin', 'sinitic');
ensureLanguageNetwork(japan).specialists['lang:english'] = { conversational: 50, working: 20, fluent: 8, literate: 8, scribes: 2, interpreters: 3 };
ensureLanguageNetwork(china).specialists['lang:english'] = { conversational: 80, working: 25, fluent: 10, literate: 12, scribes: 3, interpreters: 4 };
adoptInstitutionalLanguage(japan, 'trade', 'lang:english');
adoptInstitutionalLanguage(china, 'trade', 'lang:english');
let shared = sharedCommunicationLanguage(japan, china, 'spoken');
assert.equal(shared.languageId, 'lang:english');
assert.equal(shared.linguaFranca, true);
assert.ok(shared.competence > 0.5);

// Institutional/legal language can exist independently of household majority language.
const canada = region('ca', 'english', 'germanic');
ensureLanguageNetwork(canada).communities['lang:french'] = { share: 0.2, familyId: 'langfam:romance' };
adoptInstitutionalLanguage(canada, 'legal', 'lang:french');
assert.ok(ensureLanguageNetwork(canada).institutions.legal.includes('lang:french'));

// Cultural prestige/exposure primarily creates passive/basic familiarity, not instant fluent speakers.
const bronzeAudience = region('aud', 'anatolian', 'anatolian');
const greekStorytellers = region('greek', 'greek', 'hellenic');
for (let i = 0; i < 500; i++) recordCulturalExposure(bronzeAudience, greekStorytellers, 1, 'oral');
const greekProfile = languagePopulationProfile(bronzeAudience, 'lang:greek');
assert.ok(greekProfile.passiveShare > greekProfile.workingShare * 4, 'oral prestige should create much more passive familiarity than working bilingualism');
assert.ok(greekProfile.fluentShare < 0.01, 'oral epics should not make a large population fluent');

// Trade creates more population-facing bilingualism than court diplomacy, while still concentrating skill.
const port = region('port', 'portlang', 'x', 50000);
const trader = region('trader', 'merchantlang', 'y', 50000);
for (let i = 0; i < 200; i++) recordLanguageContact(port, trader, 1, { written: false });
const tradeProfile = languagePopulationProfile(port, dominantLanguageId(trader));
assert.ok(tradeProfile.basicShare > 0);
assert.ok(specialistLanguageCapability(port, dominantLanguageId(trader)).working > 1);

// Message choice should use a shared lingua franca when that is the best available court language.
const medium = chooseMessageMedium(japan, china, 0.6, {});
assert.equal(medium.languageId, 'lang:english');
assert.equal(medium.linguaFranca, true);

console.log('population language network regressions passed');
