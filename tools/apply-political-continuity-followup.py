from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

p = Path('js/politics/continuity.js')
s = p.read_text()
marker = "let nextSettlementId = 1;\n"
insert = '''export function resolvePartialConquest(attackerRegion, defenderRegion, polities, regions, currentTick = 0) {
  const conqueror = sovereignPolity(attackerRegion, polities);
  const defeated = sovereignPolity(defenderRegion, polities);
  if (!conqueror || !defeated || conqueror.id === defeated.id) return null;
  const remaining = regions.filter((r) => r.id !== defenderRegion.id && r.governance?.sovereignPolityId === defeated.id);
  if (remaining.length === 0) return null;

  const state = ensureContinuity(defeated);
  const wasCapital = defeated.capitalRegionId === defenderRegion.id;
  defenderRegion.governance.sovereignPolityId = conqueror.id;
  defenderRegion.governance.localPolityId ||= defeated.id;
  defenderRegion.governance.relationship = 'integrated';
  defenderRegion.governance.autonomy = 0.28;
  defenderRegion.governance.administrativeControl = 0.55;
  defenderRegion.governance.tributeRate = 0;
  defenderRegion.controllingActorId = conqueror.capitalRegionId;
  state.claims[defenderRegion.id] = Math.max(state.claims[defenderRegion.id] || 0, wasCapital ? 1 : 0.9);

  let newSeat = regions.find((r) => r.id === state.seatRegionId && r.governance?.sovereignPolityId === defeated.id);
  if (!newSeat) {
    newSeat = remaining
      .map((region) => ({ region, score: plausibleGovernanceScore(defeated, region, regions, polities) }))
      .sort((a, b) => b.score - a.score)[0]?.region || remaining[0];
  }
  if (wasCapital) {
    state.displacedCapitalRegionId = defenderRegion.id;
    state.seatRegionId = newSeat.id;
    state.status = 'claimant';
    state.legitimacy = clamp(state.legitimacy + 0.05);
    defeated.capitalRegionId = newSeat.id;
    defeated.rulerRegionId = newSeat.id;
  }
  return { partial: true, wasCapital, lostRegionId: defenderRegion.id, newSeatRegionId: newSeat.id,
    defeatedPolityId: defeated.id, conquerorPolityId: conqueror.id };
}

'''
s = rep(s, marker, insert + marker, 'partial conquest insertion')
p.write_text(s)

p = Path('js/military/campaigns.js')
s = p.read_text()
s = rep(s,
"import { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement } from '../politics/continuity.js?v=20260907-continuity1';",
"import { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement, resolvePartialConquest } from '../politics/continuity.js?v=20260907-continuity1';",
'partial conquest import')
old = '''      const playerPolityId = options.playerPolityId || null;
      const playerInvolved = playerPolityId && (attackerPolity?.id === playerPolityId || defenderPolity?.id === playerPolityId);
      if (attackerPolity && defenderPolity && playerInvolved) {'''
new = '''      const partial = attackerPolity && defenderPolity
        ? resolvePartialConquest(attacker, defender, polities, regionList, currentTick) : null;
      if (partial) {
        campaign.settlementResolved = true;
        campaign.settlementQueued = true;
        campaign.outcome = partial.wasCapital ? 'capital_lost' : 'region_lost';
        events.push({ type: 'claimant_retreat', campaign, ...partial, attackerName: attacker.name, defenderName: defender.name });
      }
      const playerPolityId = options.playerPolityId || null;
      const playerInvolved = playerPolityId && (attackerPolity?.id === playerPolityId || defenderPolity?.id === playerPolityId);
      if (!partial && attackerPolity && defenderPolity && playerInvolved) {'''
s = rep(s, old, new, 'partial conquest campaign branch')
s = s.replace("      } else if (attackerPolity && defenderPolity) {", "      } else if (!partial && attackerPolity && defenderPolity) {", 1)
p.write_text(s)

p = Path('js/main.js')
s = p.read_text()
s = rep(s,
'''    for (const settlementEvent of campaignResult.events.filter((event) => event.type === 'settlement_required')) {''',
'''    for (const retreatEvent of campaignResult.events.filter((event) => event.type === 'claimant_retreat')) {
      if (retreatEvent.defeatedPolityId === activePlayerPolityId && retreatEvent.newSeatRegionId) {
        playerRegionId = retreatEvent.newSeatRegionId;
        fogOfWar.setPlayerRegion(playerRegionId);
        map.refreshLayer();
      }
    }
    for (const settlementEvent of campaignResult.events.filter((event) => event.type === 'settlement_required')) {''',
'claimant retreat seat update')
s = rep(s,
'''        if (event.type === 'settlement_required') return event.attackerPolityId === activePlayerPolityId || event.defenderPolityId === activePlayerPolityId;
        const attacker = regionsById.get(event.campaign.attackerId);''',
'''        if (event.type === 'settlement_required') return event.attackerPolityId === activePlayerPolityId || event.defenderPolityId === activePlayerPolityId;
        if (event.type === 'claimant_retreat') return event.conquerorPolityId === activePlayerPolityId || event.defeatedPolityId === activePlayerPolityId;
        const attacker = regionsById.get(event.campaign.attackerId);''',
'claimant event filter')
s = rep(s,
'''  if (event.type === 'settlement_required') {''',
'''  if (event.type === 'claimant_retreat') {
    document.getElementById('event-title').textContent = event.wasCapital ? 'The capital has fallen' : `${event.defenderName} is lost`;
    document.getElementById('event-body').textContent = event.defeatedPolityId === activePlayerPolityId
      ? (event.wasCapital
        ? `Your court and surviving claimant have retreated to another region under your control. ${event.defenderName} remains strongly claimed; losing the capital has changed your position, not ended the game.`
        : `${event.defenderName} has been occupied, but your surviving polity continues elsewhere and retains a restoration claim.`)
      : `${event.defenderName} has been occupied, but the defeated polity survives elsewhere as a claimant. The war has not erased it politically.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'settlement_required') {''',
'claimant event modal')
s = s.replace("submission_pending: `${event.defenderName} has surrendered militarily; the political settlement is unresolved.`,",
              "submission_pending: `${event.defenderName} has surrendered militarily; the political settlement is unresolved.`,\n      capital_lost: `${event.defenderName} has fallen, but the ruling faction has retreated to surviving territory.`,\n      region_lost: `${event.defenderName} has been occupied while the defending polity survives elsewhere.`,", 1)
p.write_text(s)

# Extend the targeted test with the exact capital-loss case.
p = Path('tools/test-political-continuity.mjs')
s = p.read_text()
s = s.replace("transferRegion, grantRegionalAutonomy, canFactionContinue,", "transferRegion, grantRegionalAutonomy, canFactionContinue, resolvePartialConquest,")
needle = "assert(plausibleGovernanceScore(pHome, home, regions, polities) > 0.7, 'Homeland should be strongly governable by former ruler');\n"
extra = '''assert(plausibleGovernanceScore(pHome, home, regions, polities) > 0.7, 'Homeland should be strongly governable by former ruler');

// Losing the capital while another sovereign region survives must move the court,
// not vassalise or delete the whole polity.
const partial = resolvePartialConquest(conquerorRegion, home, polities, regions, 5);
assert(partial?.partial && partial.wasCapital, 'Capital loss should resolve as partial conquest');
assert(pHome.continuity.status === 'claimant' && pHome.continuity.seatRegionId === refuge.id, 'Claimant court should retreat to surviving territory');
assert(refuge.governance.sovereignPolityId === pHome.id, 'Surviving region must remain sovereign');
assert(home.governance.sovereignPolityId === pConq.id, 'Lost capital should pass to conqueror');
// Reset for last-region settlement tests.
home.governance.sovereignPolityId = pHome.id; home.governance.relationship = 'core'; home.governance.localPolityId = pHome.id;
pHome.capitalRegionId = home.id; pHome.rulerRegionId = home.id; pHome.continuity.status = 'sovereign'; pHome.continuity.seatRegionId = home.id;
'''
s = rep(s, needle, extra, 'partial conquest test')
p.write_text(s)

print('POLITICAL_CONTINUITY_FOLLOWUP_APPLIED')
