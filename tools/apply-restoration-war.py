from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# campaigns.js: liberation is a distinct objective whose beneficiary is the exile claimant.
p = Path('js/military/campaigns.js')
s = p.read_text()
s = rep(s,
"""  punitive: { label: 'Inflict damage and withdraw', pressureRate: 1.2, damageRate: 1.1 },
});""",
"""  punitive: { label: 'Inflict damage and withdraw', pressureRate: 1.2, damageRate: 1.1 },
  liberation: { label: 'Liberate for an allied claimant', pressureRate: 1, damageRate: 0.55 },
});""",
'liberation objective')
s = rep(s,
"import { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement, resolvePartialConquest } from '../politics/continuity.js?v=20260907-continuity1';",
"import { createConquestSettlementOffer, chooseNpcConquestOffer, resolveNpcSettlement, resolvePartialConquest, transferRegion } from '../politics/continuity.js?v=20260907-continuity1';",
'campaign continuity imports')
s = rep(s,
"""    siegeEquipment,
    pressure: 0, damage: 0,""",
"""    siegeEquipment,
    beneficiaryPolityId: options.beneficiaryPolityId || null,
    pressure: 0, damage: 0,""",
'campaign beneficiary')
needle = """  if (campaign.objective === 'subjugation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {"""
insert = """  if (campaign.objective === 'liberation' && (campaign.pressure >= 0.98 || campaign.defenderMorale <= 0.05)) {
    const currentOwner = sovereignPolity(defender, polities);
    const beneficiary = polities.find((p) => p.id === campaign.beneficiaryPolityId);
    if (currentOwner && beneficiary && currentOwner.id !== beneficiary.id) {
      const result = transferRegion(defender, currentOwner, beneficiary, regions, polities, currentTick, 'liberation');
      if (result.transferred) {
        beneficiary.continuity ||= {};
        beneficiary.continuity.status = 'claimant';
        beneficiary.continuity.seatRegionId = defender.id;
        beneficiary.continuity.hostPolityId = null;
        beneficiary.continuity.exilePopulation = 0;
        beneficiary.capitalRegionId = defender.id;
        beneficiary.rulerRegionId = defender.id;
        return beginReturn(campaign, attacker, defender, currentTick, 'liberated');
      }
    }
    return beginReturn(campaign, attacker, defender, currentTick, 'liberation_failed');
  }
"""
s = rep(s, needle, insert + needle, 'liberation resolution')
p.write_text(s)

# nationAi.js: strong backing creates a liberation-war opportunity, but still requires contact, reach and strength.
p = Path('js/ai/nationAi.js')
s = p.read_text()
s = rep(s,
"""function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0 || region.army.personnel < 100) return;
  if (rng() > considerationChance) return;
  const candidates = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);""",
"""function maybeCampaign(region, regionsById, activeCampaigns, polities, religiousWorld, currentTick, toolTypes, rng, considerationChance = CAMPAIGN_CONSIDERATION_CHANCE_PER_WEEK) {
  if (region.army.away > 0 || region.army.personnel < 100) return;
  if (rng() > considerationChance) return;
  const candidates = [...directContactIds(region)].map((id) => regionsById.get(id)).filter(Boolean);

  // A recognised government in exile can remain strategically relevant.
  // Strong restoration backing gives this polity a reason to fight for a
  // claimant's occupied homeland rather than annexing it for itself.
  const hostPolity = polities.find((p) => p.capitalRegionId === region.id);
  if (hostPolity) {
    let restoration = null;
    for (const claimant of polities) {
      const continuity = claimant.continuity;
      const backing = continuity?.exileSupport?.[hostPolity.id] || 0;
      if (continuity?.status !== 'exile' || backing < 0.7) continue;
      for (const target of candidates) {
        const claim = continuity.claims?.[target.id] || 0;
        if (claim < 0.65 || target.governance?.sovereignPolityId === claimant.id) continue;
        const reach = canCampaign(region, target, activeCampaigns, [...regionsById.values()], polities);
        if (!reach.possible) continue;
        const estimatedDefenders = Math.max(25, (target.army?.personnel || target.population * 0.006) * 1.8);
        const advantage = region.army.personnel / estimatedDefenders;
        if (advantage < 1.4) continue;
        const score = backing * 0.5 + claim * 0.35 + Math.min(2.5, advantage) * 0.15;
        if (!restoration || score > restoration.score) restoration = { claimant, target, backing, claim, advantage, score };
      }
    }
    if (restoration) {
      const requested = Math.floor(region.army.personnel * (0.65 + rng() * 0.2));
      const campaign = launchCampaign(region, restoration.target, 'liberation', requested, currentTick,
        { campaigns: activeCampaigns, regions: [...regionsById.values()], polities, beneficiaryPolityId: restoration.claimant.id });
      if (campaign) { activeCampaigns.push(campaign); return; }
    }
  }""",
'restoration campaign AI')
p.write_text(s)

# UI event text.
p = Path('js/main.js')
s = p.read_text()
s = rep(s,
"""      submission: `${event.defenderName} has surrendered and a political settlement has been reached.`,
      devastated:""",
"""      submission: `${event.defenderName} has surrendered and a political settlement has been reached.`,
      liberated: `${event.defenderName} has been liberated and restored to the recognised claimant government.`,
      liberation_failed: `The attempted liberation of ${event.defenderName} failed to produce a viable restoration.`,
      devastated:""",
'liberation event text')
p.write_text(s)

# Targeted test: liberation transfer itself is already covered by transferRegion;
# assert the new objective carries a beneficiary through launchCampaign.
p = Path('tools/test-political-continuity.mjs')
s = p.read_text()
s = rep(s,
"import {\n  initialisePoliticalContinuity,",
"import { launchCampaign, CAMPAIGN_OBJECTIVES } from '../js/military/campaigns.js';\nimport {\n  initialisePoliticalContinuity,",
'test campaign import')
needle = "console.log('POLITICAL_CONTINUITY_TESTS_OK', {\n"
extra = '''assert(CAMPAIGN_OBJECTIVES.liberation, 'Liberation campaign objective must exist');
// Campaign launch plumbing retains the beneficiary polity for later victory transfer.
conquerorRegion.army = { personnel: 500, away: 0 }; home.army = { personnel: 50, away: 0 };
conquerorRegion.adjacentSeaIds = []; home.adjacentSeaIds = [];
conquerorRegion.neighbors = ['home'];
conquerorRegion.knowledge.directContactIds.add('home');
home.knowledge.directContactIds.add('conqueror');
const liberationCampaign = launchCampaign(conquerorRegion, home, 'liberation', 200, 200,
  { campaigns: [], regions, polities, beneficiaryPolityId: pHome.id });
assert(liberationCampaign?.beneficiaryPolityId === pHome.id, 'Liberation campaign must preserve beneficiary claimant');

'''
s = rep(s, needle, extra + needle, 'liberation campaign test')
p.write_text(s)
print('RESTORATION_WAR_PATCH_APPLIED')
