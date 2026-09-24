import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../js/ui/institutionalRegionControlsUi.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

assert.match(index, /institutionalRegionControlsUi\.js/, 'region-sheet institutional gate must be loaded after main');
assert.match(ui, /authoriseRuntimeGovernmentAction/, 'region-sheet controls must use runtime institutional authority');
assert.doesNotMatch(ui, /input-navy|targetNavySize/, 'obsolete scalar navy establishment control must stay removed');
assert.match(ui, /military-spending-priority[\s\S]*change_spending/, 'military budget priority must be governed as spending');
assert.match(ui, /military-posture[\s\S]*change_military_policy/, 'strategic posture must respect legislative military-policy authority');
assert.match(ui, /subject-tribute[\s\S]*change_taxation/, 'subject tribute changes must respect taxation authority');
assert.match(ui, /subject-levy[\s\S]*change_governance_policy/, 'subject levy law must respect legislative authority');
assert.match(ui, /subject-autonomy[\s\S]*change_governance_policy/, 'subject autonomy must respect legislative authority');
assert.match(ui, /subject-form[\s\S]*change_governance_policy/, 'subject governance form must respect legislative authority');
assert.match(ui, /subject-language-policy[\s\S]*change_language_policy/, 'regional language policy must respect legislative authority');
assert.match(ui, /data-delegated-power[\s\S]*change_governance_policy/, 'delegation of subject powers must respect legislative authority');
assert.match(ui, /stopImmediatePropagation/, 'refused institutional actions must prevent legacy mutation handlers');

// Operational command remains operational: this tranche deliberately does not
// redefine scouting, campaign orders or raids as legislation/offensive war.
assert.match(main, /issueCampaignOrder\(/, 'campaign orders remain an operational command path');
assert.match(main, /startScoutingMission\(/, 'scouting remains an operational command path');
assert.match(main, /launchRaid\(/, 'raiding remains outside this constitutional tranche pending a separate design decision');
assert.doesNotMatch(ui, /btn-scout-launch|data-apply-campaign-order|btn-raid-launch/, 'institutional gate should not capture operational controls');

console.log('institutional region control regression passed');
