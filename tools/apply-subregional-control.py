from pathlib import Path

p = Path('js/military/campaigns.js')
s = p.read_text()

anchor = "import { marchSpeedMultiplier, moraleShockMultiplier, professionalLogisticsMultiplier, retreatLossMultiplier } from './professionalisation.js?v=20260908-prof1';\n"
insert = anchor + "import { advanceCampaignControl, establishCampaignFootprint, occupationSummary, releaseUnsupportedOccupation } from './subregionalControl.js?v=20260908-subregion1';\n"
if "subregionalControl.js" not in s:
    assert anchor in s
    s = s.replace(anchor, insert)

old = "    battlefield: null,\n  };"
new = "    battlefield: null,\n    occupationActorId: attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id,\n    occupationSummary: null,\n  };"
if "occupationActorId:" not in s:
    assert old in s
    s = s.replace(old, new, 1)

old = "  campaign.phase = 'returning';\n  campaign.stage = 'withdrawing';"
new = "  if (!['submission_pending', 'liberated'].includes(outcome)) {\n    campaign.occupationRelease = releaseUnsupportedOccupation(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, currentTick);\n    campaign.occupationSummary = occupationSummary(defender);\n  }\n  campaign.phase = 'returning';\n  campaign.stage = 'withdrawing';"
if "campaign.occupationRelease = releaseUnsupportedOccupation" not in s:
    assert old in s
    s = s.replace(old, new, 1)

old = "  defender.conflictPressure = campaign.pressure;\n  const week = { tick: currentTick, stage: campaign.stage, terrain, pressureDelta, pressure: campaign.pressure,"
new = "  defender.conflictPressure = campaign.pressure;\n  campaign.occupationSummary = advanceCampaignControl(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, pressureDelta, campaign.pressure, currentTick);\n  const week = { tick: currentTick, stage: campaign.stage, terrain, pressureDelta, pressure: campaign.pressure,"
if "campaign.occupationSummary = advanceCampaignControl" not in s:
    assert old in s
    s = s.replace(old, new, 1)

old = "      campaign.battlefield ||= chooseBattlefield({\n        attacker,\n        defender,"
new = "      campaign.occupationSummary = occupationSummary(defender);\n      establishCampaignFootprint(defender, campaign.occupationActorId || attacker.governance?.sovereignPolityId || attacker.controllingActorId || attacker.id, campaign.arriveTick, { viaSea: campaign.viaSea });\n      campaign.occupationSummary = occupationSummary(defender);\n      campaign.battlefield ||= chooseBattlefield({\n        attacker,\n        defender,"
if "establishCampaignFootprint(defender" not in s:
    assert old in s
    s = s.replace(old, new, 1)

p.write_text(s)
print('subregional campaign integration applied')
