#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))
    return True


def patch_demographics():
    path = 'js/society/demographics.js'
    replace_once(path,
        "import { tickEducation } from './education.js?v=20260906-education1';",
        "import { tickEducation } from './education.js?v=20260906-education1';\nimport { educationFertilityMultiplier, tickMassEducation } from './massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "const EDUCATION_BIRTH_PENALTY = 0.5;\n",
        "")
    replace_once(path,
        "  measureDetail('Demographics: education', () => tickEducation(regions, null, elapsedDays));",
        "  measureDetail('Demographics: education', () => { tickEducation(regions, null, elapsedDays); tickMassEducation(regions, elapsedDays); });")
    replace_once(path,
        "  const annualBirth = BASE_ANNUAL_BIRTH_RATE * (1 - region.educationLevel * EDUCATION_BIRTH_PENALTY) * fertilityMultiplier;",
        "  const annualBirth = BASE_ANNUAL_BIRTH_RATE * educationFertilityMultiplier(region) * fertilityMultiplier;")


def patch_labor():
    path = 'js/economy/laborCore.js'
    replace_once(path,
        "import { agriculturalWaterProfile } from './agriculturalWater.js?v=20260914-water3';",
        "import { agriculturalWaterProfile } from './agriculturalWater.js?v=20260914-water3';\nimport { educationLaborReservation } from '../society/massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "  const emergencyMilitia = Math.max(0, region.emergencyMilitiaPersonnel || 0);\n  const civilianWorkingAge = Math.max(0, workingAge - emergencyMilitia);",
        "  const emergencyMilitia = Math.max(0, region.emergencyMilitiaPersonnel || 0);\n  const educationLabor = educationLaborReservation(region);\n  const civilianWorkingAge = Math.max(0, workingAge - emergencyMilitia - educationLabor.total);")
    replace_once(path,
        "  report.infrastructureMaintenance = { workers: Math.round(actualMaintenanceWorkers) };",
        "  report.infrastructureMaintenance = { workers: Math.round(actualMaintenanceWorkers) };\n  report.educationLabor = { teachers: Math.round(educationLabor.teachers), childLaborEquivalent: Math.round(educationLabor.childLaborEquivalent) };")


def patch_learning():
    path = 'js/technology/learningByDoing.js'
    replace_once(path,
        "import { recordPractice, effectiveRecordedExperience } from '../society/education.js?v=20260906-education1';",
        "import { recordPractice, effectiveRecordedExperience } from '../society/education.js?v=20260906-education1';\nimport { educationSkillMultiplier } from '../society/massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "  return tacit + recorded * RECORDED_EXPERIENCE_WEIGHT;",
        "  return (tacit + recorded * RECORDED_EXPERIENCE_WEIGHT) * educationSkillMultiplier(region, activity);")


def patch_governance():
    path = 'js/society/educationIntegration.js'
    replace_once(path,
        "import { centroidDistanceKm } from '../world/distance.js?v=20260904-kingdom1';",
        "import { centroidDistanceKm } from '../world/distance.js?v=20260904-kingdom1';\nimport { educationAdministrativeCapacity } from './massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "    const availableForGovernment = weightedScribes * 0.62;",
        "    const availableForGovernment = weightedScribes * 0.62 + educationAdministrativeCapacity(capital);")


def patch_proto_industry():
    path = 'js/economy/protoIndustry.js'
    replace_once(path,
        "import { boundedDiffusionChance, combineIndependentChances, technologyComprehension } from '../technology/technologyComprehension.js?v=20260914-rifling1';",
        "import { boundedDiffusionChance, combineIndependentChances, technologyComprehension } from '../technology/technologyComprehension.js?v=20260914-rifling1';\nimport { educationSkillMultiplier } from '../society/massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35));",
        "    asset.productivity = clamp01(suitability * asset.maintenance * (1 - ageWear * 0.35) * educationSkillMultiplier(region, cfg.sector === 'mining' ? 'mining' : 'manufacture'));")


def patch_advisors():
    path = 'js/ui/advisors.js'
    replace_once(path,
        "import { upcomingPlayerJointOperations } from '../military/playerJointOperationAdvisor.js?v=20260909-joint-player1';",
        "import { upcomingPlayerJointOperations } from '../military/playerJointOperationAdvisor.js?v=20260909-joint-player1';\nimport { educationAdvisorReport, setMandatoryEducationYears } from '../society/massEducation.js?v=20260914-mass-education1';")
    replace_once(path,
        "    const available = availableConstructionTypes(player);\n    return `<p class=\"advisor-voice\">",
        "    const available = availableConstructionTypes(player);\n    const education = educationAdvisorReport(player);\n    const educationWarnings = education.warnings.map((text) => `<p class=\\\"advisor-note warning\\\">${text}</p>`).join('');\n    const educationBenefits = education.benefits.map((text) => `<p class=\\\"advisor-note\\\">${text}</p>`).join('');\n    return `<p class=\"advisor-voice\">")
    replace_once(path,
        "      ${section('This season', row('Weather', player.weather?.condition || 'normal') + row('Crop yield effect', percent(player.weather?.yieldMultiplier ?? 1)) + row('Food import dependence', percent(player.foodImportDependence || player.report?.foodPlan?.importDependence || 0)))}",
        "      ${section('This season', row('Weather', player.weather?.condition || 'normal') + row('Crop yield effect', percent(player.weather?.yieldMultiplier ?? 1)) + row('Food import dependence', percent(player.foodImportDependence || player.report?.foodPlan?.importDependence || 0)))}\n      ${section('Public education', `\n        <label class=\"advisor-field advisor-slider\"><span>Mandatory public education <b id=\"education-years-label\">${education.mandatoryYears} years</b></span><input id=\"mandatory-education-years\" type=\"range\" min=\"0\" max=\"13\" step=\"1\" value=\"${education.mandatoryYears}\"></label>\n        ${row('Law requires', `${education.mandatoryYears} years`)}\n        ${row('System can presently deliver', `${education.deliveredYears.toFixed(1)} years`)}\n        ${row('School capacity', `${education.capacityYears.toFixed(1)} years`)}\n        ${row('Teachers in service', number(education.teachers))}\n        ${row('Pupils enrolled', number(education.students))}\n        ${row('Education spending / week', education.weeklyCost.toFixed(1))}\n        ${row('Adult average schooling', `${education.adultAverageYears.toFixed(1)} years`)}\n        ${education.rampYearsEstimate > 0.5 ? row('Estimated time to build capacity', `about ${Math.ceil(education.rampYearsEstimate)} years`, education.rampYearsEstimate > 12 ? 'warning' : '') : ''}\n        <p class=\"advisor-note\">The law can change at once; teachers and schools cannot. Teachers are drawn from the adult workforce, and pupils forgo work they would otherwise contribute at home or in workshops.</p>\n        ${educationWarnings}${educationBenefits}`)}")
    replace_once(path,
        "    const activeWorkers = document.getElementById('construction-workers');",
        "    const educationYears = document.getElementById('mandatory-education-years');\n    educationYears?.addEventListener('input', () => {\n      const label = document.getElementById('education-years-label');\n      if (label) label.textContent = `${educationYears.value} years`;\n    });\n    educationYears?.addEventListener('change', () => {\n      setMandatoryEducationYears(player, educationYears.value, this.clock.elapsedDays || 0);\n      this.render(false);\n    });\n    const activeWorkers = document.getElementById('construction-workers');")


def main():
    patch_demographics()
    patch_labor()
    patch_learning()
    patch_governance()
    patch_proto_industry()
    patch_advisors()
    print('Mass education integration applied')


if __name__ == '__main__':
    main()
