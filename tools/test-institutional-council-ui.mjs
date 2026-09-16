import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../js/ui/institutionalCouncilUi.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(index, /institutionalCouncilUi\.js/, 'institutional council integration must be loaded by the app');
assert.match(ui, /renderInstitutionalChancellor/, 'Chancellor should expose institutional state');
assert.match(ui, /data-institution-demand/, 'active institutional demands need player controls');
assert.match(ui, /resolvePlayerInstitutionalDemand/, 'demand buttons must resolve the real crisis state');
assert.match(ui, /executeGovernmentCampaign/, 'offensive campaigns must use governed execution');
assert.match(ui, /chooseNpcInstitutionalApprovals/, 'non-executive institutions must decide whether to approve player offensive wars');
assert.match(ui, /stopImmediatePropagation/, 'legacy direct campaign launch must be intercepted before it bypasses institutions');
assert.match(ui, /advisors\.js\?v=20260905-projects1/, 'UI patch must reuse the exact AdvisorCouncil module instance imported by main');

console.log('institutional council UI regression passed');
