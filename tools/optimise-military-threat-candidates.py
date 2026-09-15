#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'js' / 'military' / 'strategicPlanning.js'
text = path.read_text()
anchor = '''  // Preserve activeAgreementBetween's preference for war commitments over
  // ordinary military support, but index the result once for all rulers.
'''
insert = '''  // Tactical threat posture only needs actors that can project force into the
  // region now: land neighbours, contacts sharing a coastal sea, or an active
  // campaign attacker. Long-distance trading contacts belong in strategic
  // planning, not every ruler's monthly emergency scan.
  const regionsBySea = new Map();
  for (const region of regions) {
    for (const seaId of region.adjacentSeaIds || []) {
      let list = regionsBySea.get(seaId);
      if (!list) { list = []; regionsBySea.set(seaId, list); }
      list.push(region);
    }
  }
  const campaignThreatsByDefender = new Map();
  for (const campaign of activeCampaigns || []) {
    if (campaign?.completed || !campaign?.defenderId || !campaign?.attackerId) continue;
    let ids = campaignThreatsByDefender.get(campaign.defenderId);
    if (!ids) { ids = new Set(); campaignThreatsByDefender.set(campaign.defenderId, ids); }
    ids.add(campaign.attackerId);
  }

  // Preserve activeAgreementBetween's preference for war commitments over
  // ordinary military support, but index the result once for all rulers.
'''
if 'const regionsBySea = new Map();' not in text:
    if anchor not in text: raise SystemExit('strategy context anchor not found')
    text = text.replace(anchor, insert, 1)
old_return = '  return { regions, agreements, polities, currentTick, activeCampaigns, regionsById, politiesById, territoriesByPolity, supportByRegion };'
new_return = '  return { regions, agreements, polities, currentTick, activeCampaigns, regionsById, politiesById, territoriesByPolity, supportByRegion, regionsBySea, campaignThreatsByDefender };'
if old_return in text:
    text = text.replace(old_return, new_return, 1)
elif new_return not in text:
    raise SystemExit('strategy context return anchor not found')
old_known = "  const known = [...directContactIds(region)].map((id) => ctx.regionsById.get(id)).filter(Boolean);"
new_known = '''  const directContacts = directContactIds(region);
  const campaignThreats = ctx.campaignThreatsByDefender?.get(region.id) || new Set();
  const candidateIds = new Set(region.neighbors || []);
  for (const seaId of region.adjacentSeaIds || []) {
    for (const other of ctx.regionsBySea?.get(seaId) || []) {
      if (other.id !== region.id) candidateIds.add(other.id);
    }
  }
  for (const id of campaignThreats) candidateIds.add(id);
  const known = [...candidateIds]
    .filter((id) => directContacts.has(id) || campaignThreats.has(id))
    .map((id) => ctx.regionsById.get(id)).filter(Boolean);'''
if old_known in text:
    text = text.replace(old_known, new_known, 1)
elif new_known not in text:
    raise SystemExit('threat candidate anchor not found')
path.write_text(text)
