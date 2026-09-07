from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# campaigns.js
p = Path('js/military/campaigns.js')
s = p.read_text()
s = rep(s,
"import { establishVassalage, findLandStagingRegion } from '../politics/polities.js?v=20260904-war1';",
"import { findLandStagingRegion, sovereignPolity } from '../politics/polities.js?v=20260904-war1';\nimport { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement } from '../politics/continuity.js?v=20260907-continuity1';",
'campaign imports')
s = rep(s,
"""  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    establishVassalage(attacker, defender, polities, currentTick, regions);
    return beginReturn(campaign, attacker, defender, currentTick, 'submission');
  }""",
"""  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    // Military surrender begins a political settlement. The defeated ruler can
    // accept terms or continue as a claimant/government in exile.
    return beginReturn(campaign, attacker, defender, currentTick, 'submission_pending');
  }""",
'campaign submission')
s = rep(s,
"export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random) {",
"export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random, options = {}) {",
'tickCampaigns signature')
s = rep(s,
"""    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {""",
"""    if (campaign.phase === 'returning' && campaign.outcome === 'submission_pending' && !campaign.settlementResolved && !campaign.settlementQueued) {
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
    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {""",
'campaign settlement block')
p.write_text(s)

# saveGame.js
p = Path('js/core/saveGame.js')
s = p.read_text()
s = rep(s,
"export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, fogOfWar }) {",
"export function createGameSnapshot({ regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, clock, playerRegionId, playerPolityId = null, fogOfWar }) {",
'save signature')
s = rep(s,
"format: 'worldsim-save', version: SAVE_VERSION, savedAt: new Date().toISOString(), worldRegionIds: regions.map((region) => region.id), playerRegionId,",
"format: 'worldsim-save', version: SAVE_VERSION, savedAt: new Date().toISOString(), worldRegionIds: regions.map((region) => region.id), playerRegionId, playerPolityId,",
'save player polity')
s = rep(s,
"return { playerRegionId: snapshot.playerRegionId, savedAt: snapshot.savedAt };",
"return { playerRegionId: snapshot.playerRegionId, playerPolityId: snapshot.playerPolityId || null, savedAt: snapshot.savedAt };",
'restore player polity')
p.write_text(s)

# main.js
p = Path('js/main.js')
s = p.read_text()
s = rep(s,
"import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260904-war1';",
"import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, polityById, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260904-war1';\nimport { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, plausibleGovernedRegions, rejectSettlementOffer, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';",
'main imports')
s = rep(s, "async function main() {", "let activePlayerPolityId = null;\n\nasync function main() {", 'player polity global')
s = rep(s, "  const polities = initialisePolities(regions);", "  const polities = initialisePolities(regions);\n  initialisePoliticalContinuity(polities, regions, 0);", 'initialise political continuity')
s = rep(s, "    playerRegionId = restored.playerRegionId;", "    playerRegionId = restored.playerRegionId;\n    activePlayerPolityId = restored.playerPolityId || regionsById.get(playerRegionId)?.polityId || null;", 'load player polity')
s = rep(s,
"const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random);",
"const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId });",
'campaign call')
s = rep(s,
"const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);",
"const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);\n    const continuityEvents = tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek);",
'continuity tick')
s = rep(s,
"""    const playerEvents = [""",
"""    for (const settlementEvent of campaignResult.events.filter((event) => event.type === 'settlement_required')) {
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
          result = offer?.type === 'direct_rule'
            ? rejectSettlementOffer(offer, polities, regions, calendarWeek, true)
            : choice === 'accept'
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

    const playerEvents = [""",
'bind player settlement')
s = rep(s,
"...polityEvents.filter((event) => event.regionId === playerRegionId),",
"...polityEvents.filter((event) => event.regionId === playerRegionId),\n      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),",
'continuity player events')
s = s.replace("const playerPolity = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;", "const playerPolity = activePlayerPolityId;", 2)
s = rep(s,
"""      ...campaignResult.events.filter((event) => {
        const attacker = regionsById.get(event.campaign.attackerId);""",
"""      ...campaignResult.events.filter((event) => {
        if (event.type === 'settlement_required') return event.attackerPolityId === activePlayerPolityId || event.defenderPolityId === activePlayerPolityId;
        const attacker = regionsById.get(event.campaign.attackerId);""",
'campaign event filter')
s = rep(s,
"""    playerRegionId = chosen.id;
    fogOfWar.setPlayerRegion(chosen.id);""",
"""    playerRegionId = chosen.id;
    activePlayerPolityId = chosen.polityId || chosen.governance?.localPolityId || chosen.governance?.sovereignPolityId;
    fogOfWar.setPlayerRegion(chosen.id);""",
'new game player polity')
s = rep(s,
"clock, playerRegionId: getPlayerRegionId(), fogOfWar });",
"clock, playerRegionId: getPlayerRegionId(), playerPolityId: activePlayerPolityId, fogOfWar });",
'save player polity call')

# Domestic authority is tied to faction/local rule, not merely the current seat.
s = rep(s,
"""  const playerCapital = regions.find((candidate) => candidate.id === playerRegionId);
  const playerPolity = sovereignPolity(playerCapital, polities);
  const isPlayerSubject = playerPolity && region.id !== playerRegionId &&
    region.governance?.sovereignPolityId === playerPolity.id;""",
"""  const playerCapital = regions.find((candidate) => candidate.id === playerRegionId);
  const playerPolity = polityById(polities, activePlayerPolityId) || sovereignPolity(playerCapital, polities);
  const playerState = playerPolity?.continuity;
  const playerHasLocalRule = Boolean(playerPolity && (region.governance?.sovereignPolityId === playerPolity.id ||
    region.governance?.localPolityId === playerPolity.id));
  const isPlayerSubject = playerPolity && region.id !== playerRegionId && region.governance?.sovereignPolityId === playerPolity.id;
  if (playerState?.status === 'exile') {
    if (region.id === playerState.seatRegionId) renderExileGovernmentControls(region, regions, polities, playerPolity);
    else document.getElementById('region-controls').innerHTML = '<div class="raid-status">Your government is in exile. You have no domestic authority here.</div>';
    return;
  }""",
'player authority model')
s = rep(s, "  if (region.id !== playerRegionId) {", "  if (!playerHasLocalRule) {", 'local rule check')
s = rep(s,
"""  const diplomaticTargets = regions
    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));""",
"""  const diplomaticTargets = (playerState?.status === 'vassal' || playerState?.status === 'governor') ? [] : regions
    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));""",
'vassal foreign policy restriction')

# Add peaceful autonomy and transfer controls to subject regions.
s = rep(s,
"""    <div class="raid-status">Routine labour, trade and local defence remain under the local ruler. Your authority is limited to tribute, broad military obligations and passage.</div>
  `;""",
"""    <div class="raid-status">Routine labour, trade and local defence remain under the local ruler. Your authority is limited to tribute, broad military obligations and passage.</div>
    <div class="raid-section"><strong>Political settlement</strong><br>
      <button id="btn-grant-more-autonomy">Grant another 10% autonomy</button>
      <div class="raid-status">You can return or grant this region to a polity with a plausible historical/cultural claim.</div>
      <select id="transfer-region-target"><option value="">— choose recipient —</option></select>
      <button id="btn-transfer-region" disabled>Transfer / liberate region</button>
    </div>
  `;""",
'subject transfer UI')
s = rep(s,
"""  document.querySelectorAll('[data-delegated-power]').forEach((input) => {
    input.addEventListener('change', () => setDelegatedPower(region, input.dataset.delegatedPower, input.checked));
  });
}

function showNextEvent""",
"""  document.querySelectorAll('[data-delegated-power]').forEach((input) => {
    input.addEventListener('change', () => setDelegatedPower(region, input.dataset.delegatedPower, input.checked));
  });
  document.getElementById('btn-grant-more-autonomy')?.addEventListener('click', () => {
    grantRegionalAutonomy(region, 0.1);
    renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
  const transferSelect = document.getElementById('transfer-region-target');
  const transferButton = document.getElementById('btn-transfer-region');
  for (const candidate of polities) {
    if (candidate.id === polity?.id) continue;
    const score = plausibleGovernedRegions(candidate, [region], polities, 0.42)[0]?.score || 0;
    if (score < 0.42) continue;
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.name} (claim ${Math.round(score * 100)}%)`;
    transferSelect?.appendChild(option);
  }
  transferSelect?.addEventListener('change', () => { if (transferButton) transferButton.disabled = !transferSelect.value; });
  transferButton?.addEventListener('click', () => {
    const recipient = polityById(polities, transferSelect.value);
    if (!recipient || !polity) return;
    const reason = (recipient.continuity?.claims?.[region.id] || 0) >= 0.7 ? 'liberation' : 'grant';
    const result = transferRegion(region, polity, recipient, regions, polities, clock.tickIndex, reason);
    if (result.transferred) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
  });
}

function renderExileGovernmentControls(hostRegion, regions, polities, playerPolity) {
  const state = playerPolity.continuity;
  const claims = plausibleGovernedRegions(playerPolity, regions, polities, 0.32).slice(0, 8);
  document.getElementById('region-controls').innerHTML = `
    <div class="raid-status"><strong>Government in exile</strong><br>
      Your court is hosted in ${hostRegion.name}. You govern no local population here.<br>
      Exile community: ${Math.round(state.exilePopulation || 0).toLocaleString()} · legitimacy ${Math.round((state.legitimacy || 0) * 100)}%</div>
    <div class="raid-section"><strong>Restoration claims</strong>
      ${claims.length ? claims.map((item) => `<div class="raid-status">${item.region.name}: ${Math.round(item.score * 100)}% plausible restoration claim</div>`).join('') : '<div class="raid-status">No strong territorial claim remains.</div>'}
      <div class="raid-status">Preserve legitimacy and cultivate allies. Rebellion, war or a negotiated liberation can restore territorial rule.</div>
    </div>`;
}

function showNextEvent""",
'exile/transfer controls')

# Player choice modal for settlement.
s = rep(s,
"""  const event = eventQueue.shift();
  if (event.type === 'campaign_arrived') {""",
"""  const event = eventQueue.shift();
  if (event.type === 'settlement_required') {
    const options = document.getElementById('event-options');
    const finish = (summary) => {
      document.getElementById('event-body').textContent = summary;
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
        if (eventQueue.length > 0) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
      });
    };
    document.getElementById('event-title').textContent = event.playerRole === 'conqueror'
      ? `Terms for ${event.defenderName}` : `Your government after the fall of ${event.defenderName}`;
    if (event.playerRole === 'conqueror') {
      document.getElementById('event-body').textContent = 'Military resistance has collapsed. Choose what role, if any, to offer the defeated government. Recognition can legitimise your rule; exclusion may create a rival government in exile.';
      options.innerHTML = Object.entries(SETTLEMENT_TYPES).map(([id, terms]) => `<button data-settlement-type="${id}">${terms.label}</button>`).join('');
      options.querySelectorAll('[data-settlement-type]').forEach((button) => button.addEventListener('click', () => {
        const resolved = event.resolveSettlement(button.dataset.settlementType);
        finish(resolved?.result?.accepted
          ? `The defeated government accepted ${resolved.offer.terms.label.toLowerCase()}. Its cooperation adds legitimacy to your settlement.`
          : `The defeated government remains a rival claimant${resolved?.result?.hostPolityId ? ' under foreign protection' : ''}.`);
      }));
    } else if (event.offer?.type === 'direct_rule') {
      document.getElementById('event-body').textContent = 'The conqueror offers your government no role and intends direct rule. Your political alternative is exile.';
      options.innerHTML = '<button id="btn-settlement-reject">Form a government in exile</button>';
      document.getElementById('btn-settlement-reject').addEventListener('click', () => {
        const resolved = event.resolveSettlement('reject');
        finish(`Your government survives in exile with about ${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers and retains its claims.`);
      });
    } else {
      document.getElementById('event-body').textContent = `${event.offer?.terms?.label || 'A subordinate role'} is offered. Accepting preserves local authority but recognises the conqueror's sovereignty; refusing preserves an independent claim from exile.`;
      options.innerHTML = '<button id="btn-settlement-accept">Accept the settlement</button><button id="btn-settlement-reject">Refuse and flee</button>';
      document.getElementById('btn-settlement-accept').addEventListener('click', () => { const resolved = event.resolveSettlement('accept'); finish(`You remain in office as a ${resolved?.playerState?.status || 'subject ruler'} under the new sovereign.`); });
      document.getElementById('btn-settlement-reject').addEventListener('click', () => { const resolved = event.resolveSettlement('reject'); finish(`Your government continues in exile with about ${Math.round(resolved?.playerState?.exilePopulation || 0).toLocaleString()} followers.`); });
    }
    document.getElementById('event-modal').classList.remove('hidden');
    return;
  }
  if (event.type === 'campaign_arrived') {""",
'settlement modal')
s = s.replace("submission: `${event.defenderName} has surrendered and pledged loyalty.`,",
              "submission_pending: `${event.defenderName} has surrendered militarily; the political settlement is unresolved.`,\n      submission: `${event.defenderName} has surrendered and a political settlement has been reached.`,", 1)
p.write_text(s)

print('POLITICAL_CONTINUITY_PATCH_APPLIED')
