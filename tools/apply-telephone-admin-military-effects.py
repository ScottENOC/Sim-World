#!/usr/bin/env python3
from pathlib import Path

def replace_once(path, old, new):
    p=Path(path); s=p.read_text()
    if old not in s: raise RuntimeError(f'missing anchor in {path}: {old[:100]!r}')
    p.write_text(s.replace(old,new,1))

p=Path('js/economy/localCommunications.js'); s=p.read_text()
if 'telephoneMobilisationMultiplier' not in s:
    anchor="export function telephoneMilitaryCommandMultiplier(region) {\n  return 1 + clamp01(region.localCommunications?.militaryCoordination || 0) * 0.08;\n}\n"
    block=anchor+"\nexport function telephoneMobilisationMultiplier(region) {\n  return 1 + clamp01(region.localCommunications?.militaryCoordination || 0) * 0.30;\n}\n"
    if anchor not in s: raise RuntimeError('local communications anchor missing')
    p.write_text(s.replace(anchor,block,1))

p=Path('js/politics/polities.js'); s=p.read_text()
if 'telephoneAdministrativeMultiplier' not in s:
    anchor="import { ensureCurrencyInstitution, tickCurrencyInstitution } from '../economy/currency.js?v=20260912-currency3';"
    if anchor not in s: raise RuntimeError('polities import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { telephoneAdministrativeMultiplier } from '../economy/localCommunications.js?v=20260918-telephone2';",1)
    old="  const elitePoliticsMultiplier = clamp(region.governance?.elitePoliticsControlMultiplier ?? 1, 0.6, 1.1);\n  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus *\n    (languageEffects.controlMultiplier || 1) * elitePoliticsMultiplier / (distanceBurden * scaleBurden * resistance), 0.05, 0.95);"
    new="  const elitePoliticsMultiplier = clamp(region.governance?.elitePoliticsControlMultiplier ?? 1, 0.6, 1.1);\n  const localTelephone = telephoneAdministrativeMultiplier(region);\n  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus *\n    (languageEffects.controlMultiplier || 1) * elitePoliticsMultiplier * localTelephone / (distanceBurden * scaleBurden * resistance), 0.05, 0.95);"
    if old not in s: raise RuntimeError('desired admin control anchor missing')
    s=s.replace(old,new,1)
    old2="      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08 + (languageEffects.corruptionDelta || 0) +\n        (governance.elitePoliticsCorruptionDelta || 0), 0.08, 0.85);"
    new2="      const telephoneFrictionReduction = Math.max(0, telephoneAdministrativeMultiplier(subject) - 1) * 0.6;\n      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 - telephoneFrictionReduction +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08 + (languageEffects.corruptionDelta || 0) +\n        (governance.elitePoliticsCorruptionDelta || 0), 0.08, 0.85);"
    if old2 not in s: raise RuntimeError('governance corruption anchor missing')
    s=s.replace(old2,new2,1)
    p.write_text(s)

p=Path('js/military/campaigns.js'); s=p.read_text()
if 'telephoneMobilisationMultiplier' not in s:
    anchor="import { campaignExternalSupport, applyExternalCampaignLosses } from '../politics/privateMilitaryActors.js?v=20260912-pmc1';"
    if anchor not in s: raise RuntimeError('campaign import anchor missing')
    s=s.replace(anchor,anchor+"\nimport { telephoneMobilisationMultiplier } from '../economy/localCommunications.js?v=20260918-telephone2';",1)
    old="  const raised = Math.floor(available * clamp(fraction, 0.05, 0.25));"
    new="  const response = telephoneMobilisationMultiplier(defender);\n  const raised = Math.floor(available * clamp(fraction * response, 0.05, 0.25));"
    if old not in s: raise RuntimeError('mobilisation anchor missing')
    s=s.replace(old,new,1)
    old2="  campaign.militia = raised;\n  defender.emergencyMilitiaPersonnel = raised;"
    new2="  campaign.militia = raised;\n  campaign.mobilisationResponseMultiplier = response;\n  defender.emergencyMilitiaPersonnel = raised;"
    if old2 not in s: raise RuntimeError('militia assignment anchor missing')
    s=s.replace(old2,new2,1)
    p.write_text(s)

print('telephone administration and mobilisation integration applied')
# trigger
