from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

p = Path('js/politics/continuity.js')
s = p.read_text()
s = rep(s,
"""    rejectedSettlementIds: [],
    lastSettlementTick: null,""",
"""    rejectedSettlementIds: [],
    exileSupport: {},
    lastSettlementTick: null,""",
'initial exile support')
s = rep(s,
"""  polity.continuity.rejectedSettlementIds ||= [];
  return polity.continuity;""",
"""  polity.continuity.rejectedSettlementIds ||= [];
  polity.continuity.exileSupport ||= {};
  return polity.continuity;""",
'ensure exile support')
marker = "export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0) {\n"
insert = '''export function lobbyForRestoration(exilePolity, targetPolity, regions) {
  const state = ensureContinuity(exilePolity);
  if (!state || state.status !== 'exile' || !targetPolity || targetPolity.id === exilePolity.id) return { success: false, reason: 'invalid_lobby' };
  const anchor = culturalAnchor(exilePolity, regions);
  const targetSeat = regions.find((r) => r.id === targetPolity.capitalRegionId);
  if (!anchor || !targetSeat) return { success: false, reason: 'no_diplomatic_channel' };
  const culture = cultureAffinity(anchor, targetSeat);
  const attitude = clamp((attitudeToward(targetSeat, anchor.id) + 1) / 2);
  const hostBonus = state.hostPolityId === targetPolity.id ? 0.08 : 0;
  const gain = clamp(0.025 + culture * 0.055 + attitude * 0.045 + state.legitimacy * 0.04 + hostBonus, 0.02, 0.18);
  state.exileSupport[targetPolity.id] = clamp((state.exileSupport[targetPolity.id] || 0) + gain);
  state.legitimacy = clamp(state.legitimacy + gain * 0.015);
  return { success: true, targetPolityId: targetPolity.id, gain, support: state.exileSupport[targetPolity.id] };
}

export function restorationBacking(exilePolity) {
  const state = ensureContinuity(exilePolity);
  return Object.entries(state.exileSupport || {})
    .map(([polityId, support]) => ({ polityId, support: clamp(support) }))
    .sort((a, b) => b.support - a.support);
}

'''
s = rep(s, marker, insert + marker, 'exile lobby functions')
s = rep(s,
"""      const yearlyDecay = host ? 0.004 : 0.014;
      state.legitimacy = clamp(state.legitimacy - yearlyDecay * elapsedYears + support * 0.002 * elapsedYears);""",
"""      const yearlyDecay = host ? 0.004 : 0.014;
      state.legitimacy = clamp(state.legitimacy - yearlyDecay * elapsedYears + support * 0.002 * elapsedYears);
      // NPC exile governments do not disappear into a passive timer: they use
      // the same diplomatic support channel available to the player.
      if (host && elapsedYears > 0) {
        const gain = lobbyForRestoration(polity, host, regions);
        if (gain.success && gain.support >= 0.7 && !state.restorationBackingAnnounced) {
          state.restorationBackingAnnounced = True if False else true;
          events.push({ type: 'restoration_backing', polityId: polity.id, hostPolityId: host.id, support: gain.support });
        }
      }""",
'NPC exile lobbying')
# Fix Python-looking placeholder in JS replacement.
s = s.replace("state.restorationBackingAnnounced = True if False else true;", "state.restorationBackingAnnounced = true;")
p.write_text(s)

p = Path('js/main.js')
s = p.read_text()
s = rep(s,
"import { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, plausibleGovernedRegions, rejectSettlementOffer, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';",
"import { SETTLEMENT_TYPES, acceptSettlementOffer, createConquestSettlementOffer, grantRegionalAutonomy, initialisePoliticalContinuity, lobbyForRestoration, plausibleGovernedRegions, rejectSettlementOffer, restorationBacking, resolveNpcSettlement, tickPoliticalContinuity, transferRegion } from './politics/continuity.js?v=20260907-continuity1';",
'main exile import')
old = '''  document.getElementById('region-controls').innerHTML = `
    <div class="raid-status"><strong>Government in exile</strong><br>
      Your court is hosted in ${hostRegion.name}. You govern no local population here.<br>
      Exile community: ${Math.round(state.exilePopulation || 0).toLocaleString()} · legitimacy ${Math.round((state.legitimacy || 0) * 100)}%</div>
    <div class="raid-section"><strong>Restoration claims</strong>
      ${claims.length ? claims.map((item) => `<div class="raid-status">${item.region.name}: ${Math.round(item.score * 100)}% plausible restoration claim</div>`).join('') : '<div class="raid-status">No strong territorial claim remains.</div>'}
      <div class="raid-status">Preserve legitimacy and cultivate allies. Rebellion, war or a negotiated liberation can restore territorial rule.</div>
    </div>`;
}'''
new = '''  const backing = restorationBacking(playerPolity);
  const targets = polities.filter((candidate) => candidate.id !== playerPolity.id);
  document.getElementById('region-controls').innerHTML = `
    <div class="raid-status"><strong>Government in exile</strong><br>
      Your court is hosted in ${hostRegion.name}. You govern no local population here.<br>
      Exile community: ${Math.round(state.exilePopulation || 0).toLocaleString()} · legitimacy ${Math.round((state.legitimacy || 0) * 100)}%</div>
    <div class="raid-section"><strong>Restoration claims</strong>
      ${claims.length ? claims.map((item) => `<div class="raid-status">${item.region.name}: ${Math.round(item.score * 100)}% plausible restoration claim</div>`).join('') : '<div class="raid-status">No strong territorial claim remains.</div>'}
    </div>
    <div class="raid-section"><strong>Diplomacy from exile</strong>
      <label class="control-row">Lobby polity
        <select id="exile-lobby-target">${targets.map((candidate) => `<option value="${candidate.id}">${candidate.name}</option>`).join('')}</select>
      </label>
      <button id="btn-exile-lobby">Seek recognition and restoration backing</button>
      <div id="exile-lobby-status" class="raid-status">${backing.length ? backing.slice(0, 5).map((item) => `${polityById(polities, item.polityId)?.name || item.polityId}: ${Math.round(item.support * 100)}% backing`).join(' · ') : 'No foreign government has committed meaningful backing yet.'}</div>
      <div class="raid-status">Backing does not create an army from nothing. It preserves diplomatic leverage for liberation, rebellion and restoration when a host or ally has the opportunity to act.</div>
    </div>`;
  document.getElementById('btn-exile-lobby')?.addEventListener('click', () => {
    const target = polityById(polities, document.getElementById('exile-lobby-target')?.value);
    const result = lobbyForRestoration(playerPolity, target, regions);
    const status = document.getElementById('exile-lobby-status');
    if (status) status.textContent = result.success
      ? `${target.name} restoration backing is now ${Math.round(result.support * 100)}%.`
      : `Lobbying failed (${String(result.reason).replaceAll('_', ' ')}).`;
  });
}'''
s = rep(s, old, new, 'exile diplomacy UI')
s = rep(s,
"""  if (event.type === 'claimant_retreat') {""",
"""  if (event.type === 'restoration_backing') {
    document.getElementById('event-title').textContent = 'Foreign backing strengthens';
    document.getElementById('event-body').textContent = `A host government now gives substantial backing to your restoration claim. This does not guarantee intervention, but makes future liberation or recognition much more plausible.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'claimant_retreat') {""",
'restoration event UI')
p.write_text(s)

p = Path('tools/test-political-continuity.mjs')
s = p.read_text()
s = s.replace("transferRegion, grantRegionalAutonomy, canFactionContinue, resolvePartialConquest,", "transferRegion, grantRegionalAutonomy, canFactionContinue, resolvePartialConquest, lobbyForRestoration, restorationBacking,")
needle = "assert(canFactionContinue(pHome, regions, polities), 'Loss of homeland must not immediately end faction');\n"
extra = '''assert(canFactionContinue(pHome, regions, polities), 'Loss of homeland must not immediately end faction');
const lobby = lobbyForRestoration(pHome, pHost, regions);
assert(lobby.success && lobby.support > 0, 'Exile government should be able to build foreign restoration support');
assert(restorationBacking(pHome)[0]?.polityId === pHost.id, 'Restoration backing should persist by foreign polity');
'''
s = rep(s, needle, extra, 'exile diplomacy tests')
p.write_text(s)

print('EXILE_DIPLOMACY_PATCH_APPLIED')
