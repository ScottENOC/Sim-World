from pathlib import Path

p=Path('js/economy/employmentAndHardship.js')
s=p.read_text()
s=s.replace("import { availableResidentHousing } from './housing.js?v=20260916-housing1';\n", "import { availableResidentHousing } from './housing.js?v=20260916-housing1';\nimport { tickUrbanHousing } from '../society/urbanHousing.js?v=20260918-urban-housing1';\n")
s=s.replace("import '../ui/labourRelationsUi.js?v=20260918-labour-relations1';\n", "import '../ui/labourRelationsUi.js?v=20260918-labour-relations1';\nimport '../ui/urbanHousingUi.js?v=20260918-urban-housing1';\n")
s=s.replace("    const h=hardshipAssessment(region,a);\n", "    const h=hardshipAssessment(region,a);\n    const polityId=region.governance?.sovereignPolityId||region.polityId||null;\n    const isPlayer=polityId===playerPolityId;\n    const urban=tickUrbanHousing(region,currentTick,elapsedDays,{isPlayer});\n    h.hardship=clamp(h.hardship+(urban.hardshipPenalty||0));\n    h.povertyPressure=clamp(h.povertyPressure+(urban.hardshipPenalty||0)*0.8);\n")
s=s.replace("    previous.migrationPressure=clamp(previous.unemploymentRate*0.48+previous.hardship*0.52);\n", "    previous.migrationPressure=clamp(Math.max(previous.unemploymentRate*0.48+previous.hardship*0.52,urban.migrationPenalty||0));\n")
s=s.replace("previous.causes={housing:a.housingBlocked,credit:a.bankContraction,firmFailures:a.firmFailure,tradeDisruption:a.tradeDisruption,foodPrices:h.foodStress,lowWealth:h.lowWealth,minimumWageHiring:a.hiringPenalty,protectionCost:h.protectionCost};", "previous.causes={housing:a.housingBlocked,urbanHousing:urban.slumPressure||0,rentPressure:urban.rentPressure||0,credit:a.bankContraction,firmFailures:a.firmFailure,tradeDisruption:a.tradeDisruption,foodPrices:h.foodStress,lowWealth:h.lowWealth,minimumWageHiring:a.hiringPenalty,protectionCost:h.protectionCost};")
s=s.replace("    const polityId=region.governance?.sovereignPolityId||region.polityId||null;\n    const isPlayer=polityId===playerPolityId;\n    const protection=tickSocialProtection", "    const protection=tickSocialProtection")
s=s.replace("    region.report.socialProtection=protection;\n", "    region.report.socialProtection=protection;\n    region.report.urbanHousing=urban;\n")
p.write_text(s)
