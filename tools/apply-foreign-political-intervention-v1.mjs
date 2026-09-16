import fs from 'node:fs';

function replaceOnce(path, before, after) {
  const src = fs.readFileSync(path, 'utf8');
  if (!src.includes(before)) throw new Error(`${path}: anchor not found`);
  const next = src.replace(before, after);
  if (next === src) throw new Error(`${path}: replacement made no change`);
  fs.writeFileSync(path, next);
}

// Expand the model beyond restoration claimants: foreign governments can also
// fund revolutionary or coup networks, which feed the existing regime-change
// risk model rather than creating instant rebel armies.
replaceOnce('js/politics/foreignPoliticalIntervention.js',
`function uprisingCandidate(exilePolity, targetPolity, regions) {`,
`export function ensureDestabilisationOperation(targetPolity, sponsorPolityId, mode = 'revolution') {
  if (!targetPolity || !sponsorPolityId || !['revolution', 'coup'].includes(mode)) return null;
  targetPolity.foreignPoliticalIntervention ||= {};
  targetPolity.foreignPoliticalIntervention.operations ||= {};
  const key = \`${'${sponsorPolityId}'}:${'${mode}'}\`;
  targetPolity.foreignPoliticalIntervention.operations[key] ||= {
    sponsorPolityId,
    mode,
    funding: 0,
    network: 0,
    materialSupport: 0,
    propaganda: 0,
    eliteContacts: 0,
    exposure: 0,
    detected: false,
    lastSupportTick: null,
  };
  return targetPolity.foreignPoliticalIntervention.operations[key];
}

export function fundPoliticalDestabilisation(sponsorPolity, targetPolity, regions, currentTick, mode = 'revolution', amount = 10, rng = Math.random) {
  if (!sponsorPolity || !targetPolity || sponsorPolity.id === targetPolity.id || !['revolution', 'coup'].includes(mode)) {
    return { funded: false, reason: 'invalid_parties' };
  }
  if (targetPolity.continuity?.status === 'exile') return { funded: false, reason: 'target_not_governing' };
  const sponsorCapital = capitalRegion(sponsorPolity, regions);
  if (!sponsorCapital) return { funded: false, reason: 'no_sponsor_capital' };
  const spend = Math.max(0, Math.min(Number(amount) || 0, sponsorCapital.treasury || 0));
  if (spend < 1) return { funded: false, reason: 'insufficient_treasury' };

  sponsorCapital.treasury -= spend;
  const operation = ensureDestabilisationOperation(targetPolity, sponsorPolity.id, mode);
  operation.funding += spend;
  operation.lastSupportTick = currentTick;

  const tradecraft = sponsorTradecraft(sponsorPolity, regions);
  const defence = targetCounterIntelligence(targetPolity, regions);
  const efficiency = clamp(0.22 + tradecraft * 0.46 - defence * 0.22, 0.06, 0.68);
  const gain = clamp((spend / 100) * efficiency, 0, 0.16);
  operation.network = clamp(operation.network + gain * (mode === 'coup' ? 0.32 : 0.5));
  operation.materialSupport = clamp(operation.materialSupport + gain * (mode === 'coup' ? 0.24 : 0.34));
  operation.propaganda = clamp(operation.propaganda + gain * (mode === 'coup' ? 0.12 : 0.5));
  operation.eliteContacts = clamp(operation.eliteContacts + gain * (mode === 'coup' ? 0.62 : 0.1));

  const detectionChance = clamp(0.035 + defence * 0.26 + spend / 500 * 0.18 - tradecraft * 0.2, 0.01, 0.58);
  const detected = rng() < detectionChance;
  operation.exposure = clamp(operation.exposure + detectionChance * (detected ? 0.7 : 0.08));
  if (detected) operation.detected = true;

  const crisis = ensureInstitutionalCrisisState(targetPolity);
  if (mode === 'revolution') {
    crisis.pressure = clamp(crisis.pressure + gain * 0.15);
    crisis.protests = clamp(crisis.protests + gain * 0.1);
    crisis.revolutionRisk = clamp(crisis.revolutionRisk + gain * (0.18 + operation.network * 0.12));
  } else {
    crisis.pressure = clamp(crisis.pressure + gain * 0.05);
    crisis.coupRisk = clamp(crisis.coupRisk + gain * (0.2 + operation.eliteContacts * 0.15));
  }
  if (detected) {
    targetPolity.institutionalPolicy ||= {};
    targetPolity.institutionalPolicy.repression = clamp((targetPolity.institutionalPolicy.repression || 0) + 0.015 + operation.exposure * 0.02);
  }

  return { funded: true, amount: spend, mode, gain, detected, detectionChance, operation };
}

function uprisingCandidate(exilePolity, targetPolity, regions) {`);

// Detection is knowledge belonging to the target government, not magically to
// the sponsor or exile claimant.
replaceOnce('js/politics/foreignPoliticalIntervention.js',
`        playerRelevant: options.playerPolityId === target.id || options.playerPolityId === exile.id || options.playerPolityId === host.id,`,
`        playerRelevant: options.playerPolityId === target.id,`);

// Diplomatic-service UI: explicit, constitutionally governed covert operations.
replaceOnce('js/ui/diplomaticServicePanel.js',
`import { authoriseRuntimeGovernmentAction } from '../politics/institutionalRuntimeAuthority.js?v=20260916-institution-diplomacy1';`,
`import { authoriseRuntimeGovernmentAction } from '../politics/institutionalRuntimeAuthority.js?v=20260916-institution-diplomacy1';
import { fundPoliticalDestabilisation, fundRestorationOperation, restorationTarget } from '../politics/foreignPoliticalIntervention.js?v=20260917-intervention1';`);

replaceOnce('js/ui/diplomaticServicePanel.js',
`function foreignCard(d) {`,
`function interventionTargets(home, regions, options = {}) {
  const polities = options.polities || [];
  const sponsorId = actorId(home);
  const sponsor = polities.find((candidate) => candidate.id === sponsorId) || null;
  const visible = new Set(options.visiblePolityIds || []);
  const exiles = polities
    .filter((candidate) => candidate.continuity?.status === 'exile')
    .map((exile) => ({ exile, target: restorationTarget(exile, polities) }))
    .filter(({ exile, target }) => target && target.id !== sponsorId &&
      (exile.continuity?.hostPolityId === sponsorId || (exile.continuity?.exileSupport?.[sponsorId] || 0) >= 0.1));
  const destabilise = polities.filter((candidate) => candidate.id !== sponsorId && candidate.continuity?.status !== 'exile' &&
    (!visible.size || visible.has(candidate.id)));
  return { sponsor, exiles, destabilise };
}

function interventionHtml(view) {
  if (!view.sponsor) return '';
  const exileOptions = view.exiles.map(({ exile, target }) =>
    \`<option value="${'${esc(exile.id)}'}">${'${esc(exile.name)}'} → ${'${esc(target.name)}'}</option>\`).join('');
  const targetOptions = view.destabilise.map((target) => \`<option value="${'${esc(target.id)}'}">${'${esc(target.name)}'}</option>\`).join('');
  return \`<div class="diplomatic-covert"><strong>Covert political intervention</strong>
    <div class="raid-status">These are state intelligence operations, not omnipotent commands. Money builds networks over time; counter-intelligence can expose them, and coups or revolutions still depend on conditions inside the target state.</div>
    ${'${exileOptions ? `<label class="control-row">Back exile claimant<select data-covert-exile>${exileOptions}</select></label><label class="control-row">Funding <input data-covert-exile-amount type="number" min="1" step="5" value="10"></label><button data-covert-restoration>Fund restoration network</button>` : `<div class="raid-status">No exile claimant is currently hosted by or meaningfully connected to your government.</div>`}'}
    ${'${targetOptions ? `<label class="control-row">Destabilise government<select data-covert-target>${targetOptions}</select></label><label class="control-row">Operation<select data-covert-mode><option value="revolution">Support revolutionary underground</option><option value="coup">Cultivate coup network</option></select></label><label class="control-row">Funding <input data-covert-target-amount type="number" min="1" step="5" value="10"></label><button data-covert-destabilise>Authorise covert support</button>` : `<div class="raid-status">No known foreign government is currently available as a covert-action target.</div>`}'}
    <div class="raid-status" data-covert-result></div></div>\`;
}

function foreignCard(d) {`);

replaceOnce('js/ui/diplomaticServicePanel.js',
`  const view = diplomaticServiceView(home, regions);
  const section = document.createElement('div');`,
`  const view = diplomaticServiceView(home, regions);
  const covert = interventionTargets(home, regions, options);
  const section = document.createElement('div');`);

replaceOnce('js/ui/diplomaticServicePanel.js',
`    <div class="raid-status" data-dip-government-result></div>
    <div class="diplomatic-own"><strong>Your envoys</strong>`,
`    <div class="raid-status" data-dip-government-result></div>
    ${'${interventionHtml(covert)}'}
    <div class="diplomatic-own"><strong>Your envoys</strong>`);

replaceOnce('js/ui/diplomaticServicePanel.js',
`  const rerender = () => { section.remove(); renderDiplomaticServicePanel(container, home, regions, currentTick, options); };`,
`  const rerender = () => { section.remove(); renderDiplomaticServicePanel(container, home, regions, currentTick, options); };
  const authoriseCovertAction = (targetPolityId) => authoriseRuntimeGovernmentAction(home, 'order_intelligence_operation', {
    polities: options.polities,
    approvals: options.intelligenceApprovals,
    context: { evidence: 0.25, legalBasis: 0.25, emergency: 0, foreignActorId: targetPolityId },
    rng: options.institutionalRng,
    currentTick,
    registerRefusal: options.registerInstitutionalRefusal !== false,
  });
  section.querySelector('[data-covert-restoration]')?.addEventListener('click', () => {
    const exileId = section.querySelector('[data-covert-exile]')?.value;
    const exile = (options.polities || []).find((candidate) => candidate.id === exileId);
    const target = exile ? restorationTarget(exile, options.polities || []) : null;
    const out = section.querySelector('[data-covert-result]');
    if (!covert.sponsor || !exile || !target) return;
    const authorisation = authoriseCovertAction(target.id);
    if (!authorisation.allowed) {
      if (out) out.textContent = 'The required institution refused authority for this covert operation.';
      options.onAction?.({ funded: false, reason: 'institutional_authorisation_refused', authorisation });
      return;
    }
    const amount = Number(section.querySelector('[data-covert-exile-amount]')?.value || 0);
    const result = fundRestorationOperation(covert.sponsor, exile, target, regions, currentTick, amount, options.operationRng || Math.random);
    if (out) out.textContent = result.funded
      ? `${'${result.amount.toFixed(1)}'} treasury units committed. The network's true penetration and whether the target noticed it remain uncertain.`
      : `Operation could not be funded (${'${String(result.reason).replaceAll(\'_\', \' \')}'}).`;
    options.onAction?.({ ...result, detected: undefined, authorisation });
  });
  section.querySelector('[data-covert-destabilise]')?.addEventListener('click', () => {
    const targetId = section.querySelector('[data-covert-target]')?.value;
    const target = (options.polities || []).find((candidate) => candidate.id === targetId);
    const mode = section.querySelector('[data-covert-mode]')?.value || 'revolution';
    const out = section.querySelector('[data-covert-result]');
    if (!covert.sponsor || !target) return;
    const authorisation = authoriseCovertAction(target.id);
    if (!authorisation.allowed) {
      if (out) out.textContent = 'The required institution refused authority for this covert operation.';
      options.onAction?.({ funded: false, reason: 'institutional_authorisation_refused', authorisation });
      return;
    }
    const amount = Number(section.querySelector('[data-covert-target-amount]')?.value || 0);
    const result = fundPoliticalDestabilisation(covert.sponsor, target, regions, currentTick, mode, amount, options.operationRng || Math.random);
    if (out) out.textContent = result.funded
      ? `${'${result.amount.toFixed(1)}'} treasury units committed to ${'${mode === \'coup\' ? \'elite/coup contacts\' : \'an underground revolutionary network\'}'}. Effectiveness and detection remain intelligence uncertainties.`
      : `Operation could not be funded (${'${String(result.reason).replaceAll(\'_\', \' \')}'}).`;
    options.onAction?.({ ...result, detected: undefined, authorisation });
  });`);

// Main loop integration and player handoff after a successful restoration uprising.
replaceOnce('js/main.js',
`import { tickRegimeCivilWars } from './politics/regimeCivilWar.js?v=20260917-regime-war1';`,
`import { tickRegimeCivilWars } from './politics/regimeCivilWar.js?v=20260917-regime-war1';
import { tickForeignPoliticalIntervention } from './politics/foreignPoliticalIntervention.js?v=20260917-intervention1';`);

replaceOnce('js/main.js',
`    const regimeCivilWarEvents = profiler.measure('Regime civil wars', () =>
      tickRegimeCivilWars(polities, regions, activeCampaigns, calendarWeek, Math.random, { playerPolityId: activePlayerPolityId }));`,
`    const foreignInterventionEvents = profiler.measure('Foreign political intervention', () =>
      tickForeignPoliticalIntervention(polities, regions, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));
    for (const interventionEvent of foreignInterventionEvents) {
      if (interventionEvent.type !== 'foreign_backed_restoration_uprising' || interventionEvent.exilePolityId !== activePlayerPolityId || !interventionEvent.targetRegionId) continue;
      if (regionsById.has(interventionEvent.targetRegionId)) {
        playerRegionId = interventionEvent.targetRegionId;
        selectedRegion = regionsById.get(playerRegionId);
        map.selectedId = playerRegionId;
        fogOfWar.setPlayerRegion(playerRegionId);
        map.refreshLayer();
      }
    }
    const regimeCivilWarEvents = profiler.measure('Regime civil wars', () =>
      tickRegimeCivilWars(polities, regions, activeCampaigns, calendarWeek, Math.random, { playerPolityId: activePlayerPolityId }));`);

replaceOnce('js/main.js',
`  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0));`,
`  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0), {
    polities,
    visiblePolityIds: [...new Set(regions.filter((candidate) => fogOfWar.isVisible(candidate)).map((candidate) => candidate.governance?.sovereignPolityId).filter(Boolean))],
  });`);

replaceOnce('js/main.js',
`      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),
      ...medievalPoliticalEvents.filter`,
`      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),
      ...foreignInterventionEvents.filter((event) => event.playerRelevant),
      ...regimeCivilWarEvents.filter((event) => event.playerRelevant),
      ...medievalPoliticalEvents.filter`);

replaceOnce('js/main.js',
`  if (event.type === 'restoration_backing') {
    document.getElementById('event-title').textContent = 'Foreign backing strengthens';`,
`  if (event.type === 'foreign_restoration_support_detected') {
    document.getElementById('event-title').textContent = 'Foreign covert support detected';
    document.getElementById('event-body').textContent = event.summary || 'Counter-intelligence has detected foreign material support for a restoration network inside your state.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'foreign_backed_restoration_uprising') {
    document.getElementById('event-title').textContent = event.exilePolityId === activePlayerPolityId ? 'Your restoration uprising succeeds' : 'Foreign-backed restoration uprising';
    document.getElementById('event-body').textContent = event.summary || 'An exile claimant has re-established territorial government and a civil war has begun.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'restoration_uprising_failed') {
    document.getElementById('event-title').textContent = 'Restoration uprising fails';
    document.getElementById('event-body').textContent = event.summary || 'A restoration network attempted to rise and was suppressed.';
    wireEventContinue(clock, eventQueue); return;
  }
  if (event.type === 'restoration_backing') {
    document.getElementById('event-title').textContent = 'Foreign backing strengthens';`);

// Focused regressions.
fs.writeFileSync('tools/test-foreign-political-intervention.mjs', `import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialisePoliticalContinuity } from '../js/politics/continuityCore.js';
import { ensureInstitutionalCrisisState } from '../js/politics/institutionalCrises.js';
import { attemptRestorationUprising, ensureRestorationOperation, fundPoliticalDestabilisation, fundRestorationOperation } from '../js/politics/foreignPoliticalIntervention.js';

function region(id, polityId, neighbors = []) {
  return {
    id, name: id, polityId, neighbors, population: 10000, treasury: 200, stability: 0.35,
    army: { personnel: 300, away: 0 }, navy: { personnel: 0 },
    governance: { sovereignPolityId: polityId, localPolityId: polityId, localRulerId: id, relationship: 'core', autonomy: 0, administrativeControl: 0.5 },
    popularWellbeing: { grievance: 0.75, mobilisationPotential: 0.68 },
    counterIntelligence: { credentialSecurity: 0.25, codePractice: 0.15, verificationCaution: 0.35, compromisedCredentialActors: [], detectedForgeries: [] },
  };
}
function polity(id, capitalRegionId) {
  return { id, name: id, capitalRegionId, rulerRegionId: capitalRegionId,
    administration: { legitimacy: 0.3, officialdom: 0.25, experience: { recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0 }, breakthroughs: new Set() },
    report: { tributeReceived: 0, subjectCount: 0, administrativeLoad: 0, administrativeCapacity: 0 } };
}

const sponsor = polity('sponsor', 's');
const incumbent = polity('incumbent', 'a');
const exile = polity('exile', 'x');
const regions = [region('s', sponsor.id), region('a', incumbent.id, ['b']), region('b', incumbent.id, ['a'])];
const polities = [sponsor, incumbent, exile];
initialisePoliticalContinuity([sponsor, incumbent], regions, 0);
exile.continuity = { status: 'exile', seatRegionId: 's', hostPolityId: sponsor.id, legitimacy: 0.55, prestige: 0.3,
  exilePopulation: 70, claims: { a: 0.9, b: 0.7 }, historicalControl: {}, acceptedSettlementIds: [], rejectedSettlementIds: [], exileSupport: { [sponsor.id]: 0.8 } };

{
  const before = regions[0].treasury;
  const funded = fundRestorationOperation(sponsor, exile, incumbent, regions, 10, 20, () => 0.99);
  assert.equal(funded.funded, true);
  assert.equal(regions[0].treasury, before - 20);
  assert.ok(funded.operation.network > 0 && funded.operation.materialSupport > 0);
}

{
  const operation = ensureRestorationOperation(exile, incumbent.id);
  operation.network = 0.9; operation.materialSupport = 0.8; operation.propaganda = 0.7; operation.sponsorPolityId = sponsor.id;
  const uprising = attemptRestorationUprising(exile, incumbent, polities, regions, 20, () => 0);
  assert.equal(uprising.succeeded, true);
  assert.equal(regions.find(r => r.id === uprising.targetRegionId).governance.sovereignPolityId, exile.id);
  assert.equal(exile.continuity.status, 'claimant');
  assert.equal(incumbent.regimeConflict.status, 'active');
  assert.equal(exile.regimeConflict.type, 'restoration');
}

{
  const target = polity('target-rev', 't');
  const t = region('t', target.id);
  const worldRegions = [regions[0], t];
  const crisis = ensureInstitutionalCrisisState(target);
  const beforeRisk = crisis.revolutionRisk;
  const beforeTreasury = regions[0].treasury;
  const result = fundPoliticalDestabilisation(sponsor, target, worldRegions, 30, 'revolution', 12, () => 0.99);
  assert.equal(result.funded, true);
  assert.equal(regions[0].treasury, beforeTreasury - 12);
  assert.ok(crisis.revolutionRisk > beforeRisk);
  assert.ok(result.operation.network > 0 && result.operation.propaganda > 0);
}

{
  const target = polity('target-coup', 'u');
  const u = region('u', target.id);
  const crisis = ensureInstitutionalCrisisState(target);
  const beforeRisk = crisis.coupRisk;
  const result = fundPoliticalDestabilisation(sponsor, target, [regions[0], u], 40, 'coup', 12, () => 0.99);
  assert.equal(result.funded, true);
  assert.ok(crisis.coupRisk > beforeRisk);
  assert.ok(result.operation.eliteContacts > result.operation.propaganda);
}

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../js/ui/diplomaticServicePanel.js', import.meta.url), 'utf8');
assert.match(main, /tickForeignPoliticalIntervention\(/);
assert.match(main, /foreignInterventionEvents\.filter\(\(event\) => event\.playerRelevant\)/);
assert.match(main, /foreign_backed_restoration_uprising/);
assert.match(panel, /order_intelligence_operation/);
assert.match(panel, /fundRestorationOperation/);
assert.match(panel, /fundPoliticalDestabilisation/);
assert.match(panel, /Effectiveness and detection remain intelligence uncertainties/);
assert.doesNotMatch(panel, /result\.detected\s*\?/);
console.log('foreign political intervention regressions passed');
`);

// CI coverage.
replaceOnce('.github/workflows/institutional-actions.yml',
`'feature/regime-change-*']`,
`'feature/regime-change-*', 'feature/foreign-political-intervention-*']`);
replaceOnce('.github/workflows/institutional-actions.yml',
`      - 'js/politics/regimeChange.js'`,
`      - 'js/politics/regimeChange.js'\n      - 'js/politics/foreignPoliticalIntervention.js'`);
replaceOnce('.github/workflows/institutional-actions.yml',
`      - 'js/ui/useOfForceUi.js'`,
`      - 'js/ui/useOfForceUi.js'\n      - 'js/ui/diplomaticServicePanel.js'`);
replaceOnce('.github/workflows/institutional-actions.yml',
`      - 'tools/test-regime-change.mjs'`,
`      - 'tools/test-regime-change.mjs'\n      - 'tools/test-foreign-political-intervention.mjs'`);
replaceOnce('.github/workflows/institutional-actions.yml',
`          node --check js/politics/regimeChange.js`,
`          node --check js/politics/regimeChange.js\n          node --check js/politics/foreignPoliticalIntervention.js`);
replaceOnce('.github/workflows/institutional-actions.yml',
`          node tools/test-regime-change.mjs`,
`          node tools/test-regime-change.mjs\n          node tools/test-foreign-political-intervention.mjs`);

console.log('foreign political intervention integration applied');
