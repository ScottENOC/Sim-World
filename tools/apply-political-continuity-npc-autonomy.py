from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

p = Path('js/politics/continuity.js')
s = p.read_text()
s = rep(s,
"export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0) {",
"export function tickPoliticalContinuity(polities, regions, elapsedYears = 0, currentTick = 0, options = {}) {",
'tick signature')
s = rep(s,
"""    const sovereignRegions = regions.filter((r) => r.governance?.sovereignPolityId === polity.id);
    for (const region of sovereignRegions) recordFactionControl(polity, region, elapsedYears, currentTick);

    if (state.status === 'exile') {""",
"""    const sovereignRegions = regions.filter((r) => r.governance?.sovereignPolityId === polity.id);
    for (const region of sovereignRegions) recordFactionControl(polity, region, elapsedYears, currentTick);

    // Non-player governments use the same autonomy/liberation tools as the
    // player. Review slowly (roughly annually) so borders do not churn monthly.
    state.npcPolicyAccumulatorYears = (state.npcPolicyAccumulatorYears || 0) + Math.max(0, elapsedYears);
    if (polity.id !== options.playerPolityId && state.npcPolicyAccumulatorYears >= 1) {
      const reviewYears = Math.floor(state.npcPolicyAccumulatorYears);
      state.npcPolicyAccumulatorYears -= reviewYears;
      for (const subject of sovereignRegions.filter((r) => r.id !== polity.capitalRegionId && r.governance?.relationship !== 'core')) {
        const g = subject.governance;
        const strain = clamp((0.5 - (subject.stability ?? 1)) * 1.1 + (0.35 - (g.administrativeControl ?? 0.5)) * 0.8);
        if (strain > 0.18) {
          const before = g.autonomy;
          grantRegionalAutonomy(subject, Math.min(0.12, 0.035 * reviewYears + strain * 0.05));
          if (g.autonomy > before + 0.001) events.push({ type: 'autonomy_granted', polityId: polity.id, regionId: subject.id, autonomy: g.autonomy });
        }
        if (g.autonomy >= 0.97 && g.administrativeControl <= 0.16) {
          const candidates = polities
            .filter((candidate) => candidate.id !== polity.id && candidate.id !== options.playerPolityId)
            .map((candidate) => ({ candidate, score: plausibleGovernanceScore(candidate, subject, regions, polities) }))
            .filter((item) => item.score >= 0.76)
            .sort((a, b) => b.score - a.score);
          const best = candidates[0];
          const ownerClaim = clamp(state.claims[subject.id] || 0);
          if (best && best.score > ownerClaim + 0.22) {
            const result = transferRegion(subject, polity, best.candidate, regions, polities, currentTick, 'liberation');
            if (result.transferred) events.push({ type: 'region_liberated', polityId: polity.id, regionId: subject.id, recipientPolityId: best.candidate.id });
          }
        }
      }
    }

    if (state.status === 'exile') {""",
'NPC policy block')
p.write_text(s)

p = Path('js/main.js')
s = p.read_text()
s = rep(s,
"const continuityEvents = tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek);",
"const continuityEvents = tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId });",
'main continuity options')
p.write_text(s)

p = Path('tools/test-political-continuity.mjs')
s = p.read_text()
needle = "console.log('POLITICAL_CONTINUITY_TESTS_OK', {\n"
extra = '''// NPCs should use the same autonomy tool when a remote subject becomes hard to govern.
const strained = refuge;
strained.governance.sovereignPolityId = pConq.id;
strained.governance.localPolityId = pHome.id;
strained.governance.relationship = 'integrated';
strained.governance.autonomy = 0.55;
strained.governance.administrativeControl = 0.1;
strained.stability = 0.15;
const autonomyBefore = strained.governance.autonomy;
const npcEvents = (await import('../js/politics/continuity.js')).tickPoliticalContinuity(polities, regions, 1.1, 100, { playerPolityId: pHome.id });
assert(strained.governance.autonomy > autonomyBefore, 'NPC sovereign should grant autonomy to an ungovernable subject');
assert(npcEvents.some((event) => event.type === 'autonomy_granted' && event.regionId === strained.id), 'NPC autonomy decision should emit an event');

'''
s = rep(s, needle, extra + needle, 'NPC parity test')
p.write_text(s)
print('NPC_AUTONOMY_PATCH_APPLIED')
