#!/usr/bin/env node
import fs from 'node:fs';

function replaceOnce(text, oldText, newText, label) {
  if (!text.includes(oldText)) throw new Error(`Missing ${label}`);
  return text.replace(oldText, newText);
}

// Campaigns: submission opens a settlement phase instead of auto-vassalage.
{
  const p = 'js/military/campaigns.js';
  let s = fs.readFileSync(p, 'utf8');
  s = replaceOnce(s,
    "import { establishVassalage, findLandStagingRegion } from '../politics/polities.js?v=20260904-war1';",
    "import { findLandStagingRegion, sovereignPolity } from '../politics/polities.js?v=20260904-war1';\nimport { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement } from '../politics/continuity.js?v=20260907-continuity1';",
    'campaign polity import');
  s = replaceOnce(s,
`  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    establishVassalage(attacker, defender, polities, currentTick, regions);
    return beginReturn(campaign, attacker, defender, currentTick, 'submission');
  }`,
`  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    // Military surrender is not the same thing as accepting the conqueror's
    // political settlement. Sovereignty changes only after the defeated ruler
    // accepts terms or rejects them and the conqueror imposes direct rule.
    return beginReturn(campaign, attacker, defender, currentTick, 'submission_pending');
  }`, 'campaign submission block');
  s = replaceOnce(s,
`export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random) {
  const events = [];`,
`export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random, options = {}) {
  const events = [];`, 'campaign tick signature');
  s = replaceOnce(s,
`    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {`,
`    if (campaign.phase === 'returning' && campaign.outcome === 'submission_pending' && !campaign.settlementResolved && !campaign.settlementQueued) {
      const attackerPolity = sovereignPolity(attacker, polities);
      const defenderPolity = sovereignPolity(defender, polities);
      const playerPolityId = options.playerPolityId || null;
      const playerInvolved = playerPolityId && (attackerPolity?.id === playerPolityId || defenderPolity?.id === playerPolityId);
      if (attackerPolity && defenderPolity && playerInvolved) {
        const playerRole = attackerPolity.id === playerPolityId ? 'conqueror' : 'defeated';
        let offer = null;
        if (playerRole === 'defeated') {
          const type = chooseNpcConquestOffer(attacker, defender, polities, regionList);
          offer = createConquestSettlementOffer(attacker, defender, type, polities, regionList, currentTick);
        }
        campaign.settlementQueued = true;
        events.push({ type: 'settlement_required', campaign, attackerName: attacker.name, defenderName: defender.name,
          attackerId: attacker.id, defenderId: defender.id, attackerPolityId: attackerPolity.id,
          defenderPolityId: defenderPolity.id, playerRole, offer });
      } else if (attackerPolity && defenderPolity) {
        const type = chooseNpcConquestOffer(attacker, defender, polities, regionList);
        const offer = createConquestSettlementOffer(attacker, defender, type, polities, regionList, currentTick);
        const result = resolveNpcSettlement(offer, polities, regionList, currentTick);
        campaign.settlementResolved = true;
        campaign.settlementQueued = true;
        campaign.settlement = offer;
        campaign.settlementResult = result;
        campaign.outcome = 'submission';
        events.push({ type: 'settlement_resolved', campaign, offer, result, attackerName: attacker.name, defenderName: defender.name });
      }
    }
    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {`, 'campaign settlement resolution');
  fs.writeFileSync(p, s);
}

// Save the player's enduring faction separately from their current seat/viewpoint.
{
  const p = 'js/core/saveGame.js';
  let s = fs.readFileSync(p, 'utf8');
  s = replaceOnce(s,
`export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, fogOfWar }) {`,
`export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, playerPolityId = null, fogOfWar }) {`, 'save create signature');
  s = replaceOnce(s,
`    format: 'worldsim-save', version: SAVE_VERSION, savedAt: new Date().toISOString(), worldRegionIds: regions.map((region) => region.id), playerRegionId,`,
`    format: 'worldsim-save', version: SAVE_VERSION, savedAt: new Date().toISOString(), worldRegionIds: regions.map((region) => region.id), playerRegionId, playerPolityId,`, 'save player polity');
  s = replaceOnce(s,
`  return { playerRegionId: snapshot.playerRegionId, savedAt: snapshot.savedAt };`,
`  return { playerRegionId: snapshot.playerRegionId, playerPolityId: snapshot.playerPolityId || null, savedAt: snapshot.savedAt };`, 'restore player polity');
  fs.writeFileSync(p, s);
}

// Main UI/runtime integration.
{
  const p = 'js/main.js';
  let s = fs.readFileSync(p, 'utf8');
  s = replaceOnce(s,
`import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260904-war1';`,
`import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, polityById, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260904-war1';\nimport { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, plausibleGovernedRegions, rejectSettlementOffer, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';`, 'main continuity import');
  s = replaceOnce(s, `async function main() {`, `let activePlayerPolityId = null;\n\nasync function main() {`, 'active player polity global');
  s = replaceOnce(s,
`  const polities = initialisePolities(regions);`,
`  const polities = initialisePolities(regions);\n  initialisePoliticalContinuity(polities, regions, 0);`, 'initialise continuity');
  s = replaceOnce(s,
`    playerRegionId = restored.playerRegionId;`,
`    playerRegionId = restored.playerRegionId;\n    activePlayerPolityId = restored.playerPolityId || regionsById.get(playerRegionId)?.polityId || null;`, 'restore active polity');
  s = replaceOnce(s,
`    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random);`,
`    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId });`, 'campaign options');
  s = replaceOnce(s,
`    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);`,
`    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);\n    const continuityEvents = tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek);`, 'continuity tick');
  s = replaceOnce(s,
`    const playerEvents = [`,
`    for (const settlementEvent of campaignResult.events.filter((event) => event.type === 'settlement_required')) {
      const attacker = regionsById.get(settlementEvent.attackerId);
      const defender = regionsById.get(settlementEvent.defenderId);
      settlementEvent.resolveSettlement = (choice) => {
        let offer = settlementEvent.offer;
        let result;
        if (settlementEvent.playerRole === 'conqueror') {
          offer = createConquestSettlementOffer(attacker, defender, choice, polities, regions, calendarWeek);
          result = choice === 'direct_rule'
            ? rejectSettlementOffer(offer, polities, regions, calendarWeek, true)
            : resolveNpcSettlement(offer, polities, regions, calendarWeek);
        } else {
          if (offer?.type === 'direct_rule') result = rejectSettlementOffer(offer, polities, regions, calendarWeek, true);
          else result = choice === 'accept'
            ? acceptSettlementOffer(offer, polities, regions, calendarWeek)
            : rejectSettlementOffer(offer, polities, regions, calendarWeek, false);
        }
        settlementEvent.campaign.settlementResolved = true;
        settlementEvent.campaign.settlement = offer;
        settlementEvent.campaign.settlementResult = result;
        settlementEvent.campaign.outcome = 'submission';
        const playerPolity = polityById(polities, activePlayerPolityId);
        const newSeat = playerPolity?.continuity?.seatRegionId;
        if (newSeat && regionsById.has(newSeat)) {
          playerRegionId = newSeat;
          fogOfWar.setPlayerRegion(newSeat);
        }
        map.refreshLayer();
        return { result, offer, playerState: playerPolity?.continuity || null };
      };
    }

    const playerEvents = [`, 'bind settlement resolver');
  s = replaceOnce(s,
`      ...polityEvents.filter((event) => event.regionId === playerRegionId),`,
`      ...polityEvents.filter((event) => event.regionId === playerRegionId),\n      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),`, 'continuity player events');
  s = replaceOnce(s,
`        const playerPolity = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;`,
`        const playerPolity = activePlayerPolityId;`, 'raid player polity');
  s = replaceOnce(s,
`        const playerPolity = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;`,
`        const playerPolity = activePlayerPolityId;`, 'campaign filter player polity');
  s = replaceOnce(s,
`      ...campaignResult.events.filter((event) => {\n        const attacker = regionsById.get(event.campaign.attackerId);`,
`      ...campaignResult.events.filter((event) => {\n        if (event.type === 'settlement_required') return event.attackerPolityId === activePlayerPolityId || event.defenderPolityId === activePlayerPolityId;\n        const attacker = regionsById.get(event.campaign.attackerId);`, 'settlement event filter');
  s = replaceOnce(s,
`    playerRegionId = chosen.id;\n    fogOfWar.setPlayerRegion(chosen.id);`,
`    playerRegionId = chosen.id;\n    activePlayerPolityId = chosen.polityId || chosen.governance?.localPolityId || chosen.governance?.sovereignPolityId;\n    fogOfWar.setPlayerRegion(chosen.id);`, 'start player polity');
  s = replaceOnce(s,
`        clock, playerRegionId: getPlayerRegionId(), fogOfWar });`,
`        clock, playerRegionId: getPlayerRegionId(), playerPolityId: activePlayerPolityId, fogOfWar });`, 'save active polity from menu');

  // Permission model: current seat is not automatically domestic ownership.
  s = replaceOnce(s,
`  const playerCapital = regions.find((candidate) => candidate.id === playerRegionId);\n  const playerPolity = sovereignPolity(playerCapital, polities);\n  const isPlayerSubject = playerPolity && region.id !== playerRegionId &&\n    region.governance?.sovereignPolityId === playerPolity.id;`,
`  const playerCapital = regions.find((candidate) => candidate.id === playerRegionId);\n  const playerPolity = polityById(polities, activePlayerPolityId) || sovereignPolity(playerCapital, polities);\n  const playerState = playerPolity?.continuity;\n  const playerHasLocalRule = Boolean(playerPolity && (region.governance?.sovereignPolityId === playerPolity.id ||\n    region.governance?.localPolityId === playerPolity.id));\n  const isPlayerSubject = playerPolity && region.id !== playerRegionId &&\n    region.governance?.sovereignPolityId === playerPolity.id;\n  if (playerState?.status === 'exile') {\n    if (region.id === playerState.seatRegionId) renderExileGovernmentControls(region, regions, polities, playerPolity);\n    else document.getElementById('region-controls').innerHTML = '<div class="raid-status">Your government is in exile. You have no domestic authority here.</div>';\n    return;\n  }`, 'render permission model');
  s = replaceOnce(s,
`  if (region.id !== playerRegionId) {`,
`  if (!playerHasLocalRule) {`, 'domestic permission condition');
  s = replaceOnce(s,
`  const diplomaticTargets = regions\n    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));`,
`  const diplomaticTargets = (playerState?.status === 'vassal' || playerState?.status === 'governor') ? [] : regions\n    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));`, 'vassal foreign policy restriction');

  // Subject UI: autonomy and peaceful liberation/transfer.
  s = replaceOnce(s,
`    <div class="raid-status">Routine labour, trade and local defence remain under the local ruler. Your authority is limited to tribute, broad military obligations and passage.</div>\n  \`;`,
`    <div class="raid-status">Routine labour, trade and local defence remain under the local ruler. Your authority is limited to tribute, broad military obligations and passage.</div>\n    <div class="raid-section"><strong>Political settlement</strong><br>\n      <button id="btn-grant-more-autonomy">Grant another 10% autonomy</button>\n      <div class="raid-status">You may also return or grant this region to a polity with a plausible historical/cultural claim.</div>\n      <select id="transfer-region-target"><option value="">— choose recipient —</option>\n        \\${polities.filter((candidate) => candidate.id !== polity?.id).map((candidate) => { const score = plausibleGovernedRegions(candidate, [region], polities, 0.42)[0]?.score || 0; return score >= 0.42 ? \\`<option value="\\${candidate.id}">\\${candidate.name} (claim \\${Math.round(score*100)}%)</option>\\` : ''; }).join('')}\n      </select>\n      <button id="btn-transfer-region" disabled>Transfer / liberate region</button>\n    </div>\n  \`;`, 'subject political settlement UI');
  s = replaceOnce(s,
`  document.querySelectorAll('[data-delegated-power]').forEach((input) => {\n    input.addEventListener('change', () => setDelegatedPower(region, input.dataset.delegatedPower, input.checked));\n  });\n}\n\nfunction showNextEvent`,
`  document.querySelectorAll('[data-delegated-power]').forEach((input) => {\n    input.addEventListener('change', () => setDelegatedPower(region, input.dataset.delegatedPower, input.checked));\n  });\n  document.getElementById('btn-grant-more-autonomy')?.addEventListener('click', () => {\n    grantRegionalAutonomy(region, 0.1);\n    renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n  });\n  const transferSelect = document.getElementById('transfer-region-target');\n  const transferButton = document.getElementById('btn-transfer-region');\n  transferSelect?.addEventListener('change', () => { if (transferButton) transferButton.disabled = !transferSelect.value; });\n  transferButton?.addEventListener('click', () => {\n    const recipient = polityById(polities, transferSelect.value);\n    if (!recipient || !polity) return;\n    const reason = recipient.continuity?.claims?.[region.id] >= 0.7 ? 'liberation' : 'grant';\n    const result = transferRegion(region, polity, recipient, regions, polities, clock.tickIndex, reason);\n    if (result.transferred) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n  });\n}\n\nfunction renderExileGovernmentControls(hostRegion, regions, polities, playerPolity) {\n  const state = playerPolity.continuity;\n  const claims = plausibleGovernedRegions(playerPolity, regions, polities, 0.32).slice(0, 8);\n  document.getElementById('region-controls').innerHTML = \\`\n    <div class="raid-status"><strong>Government in exile</strong><br>\n      Your court is hosted in \\${hostRegion.name}. You govern no local population here.<br>\n      Exile community: \\${Math.round(state.exilePopulation || 0).toLocaleString()} · legitimacy \\${Math.round((state.legitimacy || 0)*100)}%</div>\n    <div class="raid-section"><strong>Restoration claims</strong>\n      \\${claims.length ? claims.map((item) => \\<div class="raid-status">\\${item.region.name}: \\${Math.round(item.score*100)}% plausible restoration claim</div>\\).join('') : '<div class="raid-status">No strong territorial claim remains.</div>'}\n      <div class="raid-status">Exile gameplay is diplomatic: preserve legitimacy, cultivate hosts and allies, and wait for rebellion, war or negotiated liberation to reopen a territorial path.</div>\n    </div>\n  \\`;\n}\n\nfunction showNextEvent`, 'exile and subject wiring');

  // Settlement choice modal.
  s = replaceOnce(s,
`  const event = eventQueue.shift();\n  if (event.type === 'campaign_arrived') {`,
`  const event = eventQueue.shift();\n  if (event.type === 'settlement_required') {\n    const options = document.getElementById('event-options');\n    document.getElementById('event-title').textContent = event.playerRole === 'conqueror'\n      ? \\`Terms for \\${event.defenderName}\\` : \\`Your government after the fall of \\${event.defenderName}\\`;\n    const closeAfterResolution = (summary) => {\n      document.getElementById('event-body').textContent = summary;\n      options.innerHTML = '<button id="btn-event-continue">Continue</button>';\n      document.getElementById('btn-event-continue').addEventListener('click', () => {\n        document.getElementById('event-modal').classList.add('hidden');\n        if (eventQueue.length > 0) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();\n      });\n    };\n    if (event.playerRole === 'conqueror') {\n      document.getElementById('event-body').textContent = 'Military resistance has collapsed. Choose what political settlement to offer or impose. Recognising the old ruler can make your rule more legitimate; excluding them may create a government in exile.';\n      options.innerHTML = Object.entries(SETTLEMENT_TYPES).map(([id, terms]) => \\<button data-settlement-type="\\${id}">\\${terms.label}</button>\\).join('');\n      options.querySelectorAll('[data-settlement-type]').forEach((button) => button.addEventListener('click', () => {\n        const resolved = event.resolveSettlement(button.dataset.settlementType);\n        const result = resolved?.result;\n        closeAfterResolution(result?.accepted\n          ? \\`The old government accepted \\${resolved.offer.terms.label.toLowerCase()}. Its cooperation adds legitimacy to your settlement.\\`\n          : \\`The old government did not join your settlement. A rival government survives \\${result?.hostPolityId ? 'under foreign protection' : 'without a secure host'}, retaining claims on the conquered territory.\\`);\n      }));\n    } else {\n      const terms = event.offer?.terms;\n      if (event.offer?.type === 'direct_rule') {\n        document.getElementById('event-body').textContent = 'The conqueror offers your government no role and intends direct rule. Your remaining choice is political survival in exile.';\n        options.innerHTML = '<button id="btn-settlement-reject">Form a government in exile</button>';\n        document.getElementById('btn-settlement-reject').addEventListener('click', () => {\n          const resolved = event.resolveSettlement('reject');\n          closeAfterResolution(\\`Your government escapes into exile with about \\${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers. Your territorial claims survive.\\`);\n        });\n      } else {\n        document.getElementById('event-body').textContent = \\`The conqueror offers to \\${terms?.label?.toLowerCase() || 'retain you under their rule'}. Accepting preserves local authority but recognises the conqueror's sovereignty; refusing preserves an independent claim from exile.\\`;\n        options.innerHTML = '<button id="btn-settlement-accept">Accept the settlement</button><button id="btn-settlement-reject">Refuse and flee</button>';\n        document.getElementById('btn-settlement-accept').addEventListener('click', () => { const resolved = event.resolveSettlement('accept'); closeAfterResolution(\\`You remain in office as a \\${resolved?.playerState?.status || 'subject ruler'}, governing locally under the new sovereign.\\`); });\n        document.getElementById('btn-settlement-reject').addEventListener('click', () => { const resolved = event.resolveSettlement('reject'); closeAfterResolution(\\`Your government refuses collaboration and continues in exile with about \\${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers.\\`); });\n      }\n    }\n    document.getElementById('event-modal').classList.remove('hidden');\n    return;\n  }\n  if (event.type === 'campaign_arrived') {`, 'settlement modal');
  s = s.replace("submission: `${event.defenderName} has surrendered and pledged loyalty.`,", "submission_pending: `${event.defenderName} has surrendered militarily; the political settlement is still unresolved.`,\n      submission: `${event.defenderName} has surrendered and a political settlement has been reached.`,");
  fs.writeFileSync(p, s);
}

console.log('POLITICAL_CONTINUITY_PATCH_APPLIED');
