from pathlib import Path

def patch(path, replacements):
    p=Path(path); text=p.read_text()
    for old,new in replacements:
        if old not in text:
            raise SystemExit(f'missing pattern in {path}: {old[:100]!r}')
        text=text.replace(old,new,1)
    p.write_text(text)

patch('js/technology/breakthroughs.js', [
("import { tickTelephoneBreakthroughs } from './telephone.js?v=20260918-telephone1';", "import { tickTelephoneBreakthroughs } from './telephone.js?v=20260918-telephone1';\nimport { tickMedicalBreakthroughs } from './medicalProgress.js?v=20260918-medical1';"),
("  events.push(...tickTelephoneBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickModernLandBreakthroughs", "  events.push(...tickTelephoneBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickMedicalBreakthroughs(regions, currentTick, rng, elapsedDays));\n  events.push(...tickModernLandBreakthroughs"),
])

patch('js/society/publicHealth.js', [
("import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';", "import { elapsedWeeks } from '../core/simTime.js?v=20260905-time1';\nimport { medicalKnowledgeIndex, preventionKnowledgeEffect, treatmentKnowledgeEffect } from '../technology/medicalProgress.js?v=20260918-medical1';"),
("  const literacySignal=literacy(region);\n  const admin=stateCapacity(region);\n  s.staffingRatio=clamp(0.18+literacySignal*0.78+admin*0.18);", "  const literacySignal=literacy(region);\n  const admin=stateCapacity(region);\n  const medicalKnowledge=medicalKnowledgeIndex(region);\n  s.staffingRatio=clamp(0.12+literacySignal*0.35+admin*0.15+medicalKnowledge*0.55);"),
("    hospitalSpend:s.hospitalSpend,hospitalBuildSpend:s.hospitalBuildSpend,publicBedsBuilt:s.publicBedsBuilt,\n  };", "    hospitalSpend:s.hospitalSpend,hospitalBuildSpend:s.hospitalBuildSpend,publicBedsBuilt:s.publicBedsBuilt,\n    medicalKnowledge:medicalKnowledgeIndex(region),\n  };"),
("  const medicalKnowledge=clamp(0.10+literacy(region)*0.55+stateCapacity(region)*0.10);\n  const treatability=PATHOGEN_TREATABILITY[pathogenId]??0.25;\n  return clamp(bedCoverage*s.staffingRatio*s.fundingRatio*medicalKnowledge*treatability,0,0.65);", "  const medicalKnowledge=treatmentKnowledgeEffect(region,pathogenId);\n  const treatability=PATHOGEN_TREATABILITY[pathogenId]??0.25;\n  return clamp(bedCoverage*s.staffingRatio*s.fundingRatio*medicalKnowledge*treatability,0,0.75);"),
("  return clamp(admin*0.16+sanitation*admin*0.12,0,0.28);", "  const knowledge=preventionKnowledgeEffect(region);\n  return clamp(admin*0.16+sanitation*admin*0.12+knowledge*admin,0,0.48);"),
])

patch('js/society/disease.js', [
("import { tickActiveHydrology } from '../world/hydrology.js?v=20260914-water1';", "import { tickActiveHydrology } from '../world/hydrology.js?v=20260914-water1';\nimport { vaccinationProtection } from '../technology/medicalProgress.js?v=20260918-medical1';"),
("      const susceptible = Math.max(0, 1 - resistance - oldPrevalence);", "      const vaccineProtection = vaccinationProtection(region, id);\n      const susceptible = Math.max(0, 1 - resistance - oldPrevalence) * (1 - vaccineProtection);"),
])

patch('js/military/campaigns.js', [
("import { bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile, modernInfantryProfile } from './modernLandWarfare.js?v=20260918-modern-war1';", "import { bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile, modernInfantryProfile } from './modernLandWarfare.js?v=20260918-modern-war1';\nimport { resolveMilitaryCasualties } from '../technology/medicalProgress.js?v=20260918-medical1';"),
("    attackerCasualties: 0, defenderCasualties: 0, civilianDeaths: 0,", "    attackerCasualties: 0, defenderCasualties: 0, civilianDeaths: 0,\n    attackerDeaths: 0, defenderDeaths: 0, attackerWoundedSurvivors: 0, defenderWoundedSurvivors: 0,"),
("  const attackerLosses = combatAttackerLosses + logisticsLosses;", "  const attackerMedical = resolveMilitaryCasualties(attacker, combatAttackerLosses, { deployedPersonnel: campaign.personnel, homeCare: false, logistics: campaign.supply });\n  const attackerLosses = combatAttackerLosses + logisticsLosses;\n  const attackerDeaths = attackerMedical.deaths + logisticsLosses;"),
("  const defenderLosses = Math.min(defender.army.personnel, defenderLossPool - militiaLosses);", "  const defenderLosses = Math.min(defender.army.personnel, defenderLossPool - militiaLosses);\n  const defenderMedical = resolveMilitaryCasualties(defender, defenderLosses, { deployedPersonnel: defender.army.personnel, homeCare: true, logistics: 1 });\n  const militiaMedical = resolveMilitaryCasualties(defender, militiaLosses, { deployedPersonnel: Math.max(1,campaign.militia), homeCare: true, logistics: 0.75 });\n  const defenderDeaths = defenderMedical.deaths + militiaMedical.deaths;"),
("  if (militiaLosses > 0) {\n    defender.demographics.workingAge = Math.max(0, defender.demographics.workingAge - militiaLosses);", "  if (militiaLosses > 0) {\n    defender.demographics.workingAge = Math.max(0, defender.demographics.workingAge - militiaMedical.deaths);"),
("  campaign.attackerCasualties += attackerLosses;\n  campaign.defenderCasualties += defenderLosses + militiaLosses;", "  campaign.attackerCasualties += attackerLosses;\n  campaign.defenderCasualties += defenderLosses + militiaLosses;\n  campaign.attackerDeaths += attackerDeaths;\n  campaign.defenderDeaths += defenderDeaths;\n  campaign.attackerWoundedSurvivors += attackerMedical.survivingWounded;\n  campaign.defenderWoundedSurvivors += defenderMedical.survivingWounded;\n  campaign.militiaWoundedSurvivors = (campaign.militiaWoundedSurvivors || 0) + militiaMedical.survivingWounded;"),
("    attackerLosses, externalLosses, externalPersonnel: externalSupport.personnel, logisticsLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,", "    attackerLosses, attackerDeaths, attackerWoundedSurvivors: attackerMedical.survivingWounded, attackerMedicalCapacity: attackerMedical.capacityRatio,\n    externalLosses, externalPersonnel: externalSupport.personnel, logisticsLosses, defenderLosses, militiaLosses, defenderDeaths,\n    defenderWoundedSurvivors: defenderMedical.survivingWounded + militiaMedical.survivingWounded, defenderMedicalCapacity: defenderMedical.capacityRatio, civilianDeaths, attackerMorale: campaign.attackerMorale,"),
("      attacker.army.personnel += campaign.personnel;\n      attacker.army.away = Math.max(0, (attacker.army.away || 0) - campaign.personnel);", "      attacker.army.personnel += campaign.personnel + Math.max(0, campaign.attackerWoundedSurvivors || 0);\n      defender.army.personnel += Math.max(0, campaign.defenderWoundedSurvivors || 0);\n      attacker.army.away = Math.max(0, (attacker.army.away || 0) - campaign.personnel);"),
])
print('medical progression integration applied')
