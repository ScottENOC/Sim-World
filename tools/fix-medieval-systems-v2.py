from pathlib import Path

p = Path('js/politics/medievalStateSystems.js')
s = p.read_text()

# Repair the preflight syntax typo from the original staged module, if present.
s = s.replace(
    "  const technicalTarget = clamp((s.urban.industrialSpecialisation || 0) * 0.42 + (hasTech(region, 'steelmaking') ? 0.22 : 0) + (hasTech(region, 'gunpowder') ? 0.18 : 0) + (hasTech(region, 'ocean_going_sailing') ? 0.18 : 0);",
    "  const technicalTarget = clamp((s.urban.industrialSpecialisation || 0) * 0.42 + (hasTech(region, 'steelmaking') ? 0.22 : 0) + (hasTech(region, 'gunpowder') ? 0.18 : 0) + (hasTech(region, 'ocean_going_sailing') ? 0.18 : 0));",
)

old = """  for (const c of claimants) c.supportRegionIds = support.get(c.id);
  claimants.sort((a,b)=>b.supportRegionIds.length-a.supportRegionIds.length);
  succession.claimants = claimants;
  succession.crisis = { startedTick: currentTick, leadingClaimantId: claimants[0].id, contested: claimants[1].supportRegionIds.length >= Math.max(1, territories.length * 0.22), resolved: false };
"""
new = """  for (const c of claimants) c.supportRegionIds = support.get(c.id);
  claimants.sort((a,b)=>b.supportRegionIds.length-a.supportRegionIds.length);
  succession.claimants = claimants;
  const leading = claimants[0];
  const viableRivals = claimants.filter(c => c.id !== leading.id && c.supportRegionIds.length > 0)
    .sort((a,b) => b.supportRegionIds.length - a.supportRegionIds.length);
  const rivalSupport = viableRivals.reduce((sum, c) => sum + c.supportRegionIds.length, 0);
  const weakLegitimacyContest = (polity.administration?.legitimacy || 0) < 0.45 && territories.length >= 2 && rivalSupport >= 1;
  const contested = rivalSupport >= Math.max(1, territories.length * 0.22) || weakLegitimacyContest;
  succession.crisis = { startedTick: currentTick, leadingClaimantId: leading.id, contested, resolved: false };
"""
if old not in s:
    raise SystemExit('succession contest block not found')
s = s.replace(old, new, 1)

old = """  const rival = claimants[1];
  if (!rival?.supportRegionIds?.length) return null;
"""
new = """  const rival = claimants.filter(c => c.id !== crisis.leadingClaimantId && c.supportRegionIds?.length)
    .sort((a,b) => b.supportRegionIds.length - a.supportRegionIds.length)[0];
  if (!rival?.supportRegionIds?.length) return null;
"""
if old not in s:
    raise SystemExit('civil-war rival block not found')
s = s.replace(old, new, 1)

p.write_text(s)
