import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../js/ui/institutionalCouncilUi.js', import.meta.url), 'utf8');
const spendingUi = fs.readFileSync(new URL('../js/ui/institutionalCouncilSpendingUi.js', import.meta.url), 'utf8');
const mobileGameplayUi = fs.readFileSync(new URL('../js/ui/mobileGameplayControls.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(index, /institutionalCouncilUi\.js/, 'institutional council integration must be loaded by the app');
assert.match(index, /institutionalCouncilSpendingUi\.js/, 'budget and security controls must load their institutional patch');
assert.match(ui, /renderInstitutionalChancellor/, 'Chancellor should expose institutional state');
assert.match(ui, /data-institution-demand/, 'active institutional demands need player controls');
assert.match(ui, /resolvePlayerInstitutionalDemand/, 'demand buttons must resolve the real crisis state');
assert.match(ui, /executeGovernmentCampaign/, 'offensive campaigns must use governed execution');
assert.match(ui, /executeGovernmentMilitaryPolicy/, 'standing military policy must use governed execution when institutions share power');
assert.match(ui, /executeGovernmentAction/, 'non-military Council policy controls need governed execution');
assert.match(ui, /change_taxation/, 'transit taxation controls must respect taxation authority');
assert.match(ui, /change_spending/, 'education spending controls must respect spending authority');
assert.match(ui, /change_economic_policy/, 'embargo and passage controls must respect economic-regulation authority');
assert.match(ui, /order_intelligence_operation/, 'deception operations must respect intelligence-operation authority');
assert.match(ui, /chooseNpcInstitutionalApprovals/, 'non-executive institutions must decide whether to approve player government actions');
assert.match(ui, /stopImmediatePropagation/, 'legacy direct mutations must be intercepted before they bypass institutions');
assert.match(ui, /advisors\.js\?v=20260905-projects1/, 'UI patch must reuse the exact AdvisorCouncil module instance imported by main');

for (const id of ['council-army-target', 'target-rams', 'target-catapults']) {
  assert.match(spendingUi, new RegExp(id), `${id} must be institutionally governed`);
}
assert.doesNotMatch(spendingUi, /council-navy-target/, 'obsolete scalar navy spending control must stay removed');
assert.match(mobileGameplayUi, /setNavalClassTarget/, 'naval procurement must use class-specific targets');
assert.doesNotMatch(mobileGameplayUi, /targetNavySize/, 'class-specific naval procurement must not recreate the scalar navy target');
assert.match(spendingUi, /startConstruction/, 'new public works must be governed spending');
assert.match(spendingUi, /startRepair/, 'repair commissioning must be governed spending');
assert.match(spendingUi, /setConstructionWorkers/, 'active public-works labour must be governed spending');
assert.match(spendingUi, /cancelConstruction/, 'cancelling an active appropriation must be governed spending');
assert.match(spendingUi, /change_spending/, 'establishment, procurement and construction controls must use spending authority');
assert.match(spendingUi, /change_intelligence_policy/, 'standing counter-intelligence settings need a distinct institutional action');
assert.match(spendingUi, /setCounterIntelligencePolicy/, 'counter-intelligence settings must mutate only through governed execution');
assert.match(spendingUi, /stopImmediatePropagation/, 'new interceptors must block the legacy direct mutation handlers');

console.log('institutional council UI regression passed');
