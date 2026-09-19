from pathlib import Path


def replace_once(path, old, new, marker=None):
    p=Path(path); text=p.read_text()
    if marker and marker in text:
        return False
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old,new,1)); return True

replace_once(
    'js/diplomacy/nuclearArmsControl.js',
    "    safeguards:Boolean(terms.safeguards??type===NUCLEAR_TREATY_TYPES.MATERIAL_SAFEGUARDS),",
    "    safeguards:Boolean(terms.safeguards??type===NUCLEAR_TREATY_TYPES.MATERIAL_SAFEGUARDS),\n    prohibitForeignNuclearBasing:Boolean(terms.prohibitForeignNuclearBasing??false),",
    'prohibitForeignNuclearBasing:Boolean'
)
replace_once(
    'js/diplomacy/nuclearArmsControl.js',
    "const active=activeTreaties(region),out={prohibitAcquisition:false,prohibitTesting:false,safeguards:false,maxLandLaunchers:null,maxStrategicSubmarines:null,maxPrototypes:null,verification:0,inspectionAccess:0,securityAssurance:0};",
    "const active=activeTreaties(region),out={prohibitAcquisition:false,prohibitTesting:false,safeguards:false,prohibitForeignNuclearBasing:false,maxLandLaunchers:null,maxStrategicSubmarines:null,maxPrototypes:null,verification:0,inspectionAccess:0,securityAssurance:0};",
    'out={prohibitAcquisition:false,prohibitTesting:false,safeguards:false,prohibitForeignNuclearBasing:false'
)
replace_once(
    'js/diplomacy/nuclearArmsControl.js',
    "out.prohibitAcquisition ||= t.prohibitAcquisition;out.prohibitTesting ||= t.prohibitTesting;out.safeguards ||= t.safeguards;",
    "out.prohibitAcquisition ||= t.prohibitAcquisition;out.prohibitTesting ||= t.prohibitTesting;out.safeguards ||= t.safeguards;out.prohibitForeignNuclearBasing ||= t.prohibitForeignNuclearBasing;",
    'out.prohibitForeignNuclearBasing ||='
)
replace_once(
    'js/diplomacy/nuclearArmsControl.js',
    "  if(c.maxPrototypes!=null&&weapons.prototypeCount>c.maxPrototypes)violations.push('prototype_ceiling');",
    "  if(c.maxPrototypes!=null&&weapons.prototypeCount>c.maxPrototypes)violations.push('prototype_ceiling');\n  if(c.prohibitForeignNuclearBasing&&Object.values(subject.nuclearAlliance?.deployments||{}).some(d=>d.role==='host'&&d.status==='active'))violations.push('foreign_nuclear_basing_prohibited');",
    "foreign_nuclear_basing_prohibited"
)
replace_once(
    'js/diplomacy/nuclearAlliedDeployments.js',
    "import { strategicForceReadiness, STRATEGIC_BOMBER_DELIVERY_TECH_ID, STRATEGIC_MISSILE_TECH_ID, STRATEGIC_MISSILE_SUBMARINE_TECH_ID } from '../military/strategicDelivery.js?v=20260920-nuclear-alliance1';",
    "import { strategicForceReadiness, STRATEGIC_BOMBER_DELIVERY_TECH_ID, STRATEGIC_MISSILE_TECH_ID, STRATEGIC_MISSILE_SUBMARINE_TECH_ID } from '../military/strategicDelivery.js?v=20260920-nuclear-alliance1';\nimport { nuclearTreatyConstraints } from './nuclearArmsControl.js?v=20260920-nuclear-diplomacy1';",
    "nuclearTreatyConstraints"
)
replace_once(
    'js/diplomacy/nuclearAlliedDeployments.js',
    "  if(!ha.hostConsent)return{deployed:false,reason:'host_consent_required'};",
    "  if(!ha.hostConsent)return{deployed:false,reason:'host_consent_required'};\n  if(nuclearTreatyConstraints(host).prohibitForeignNuclearBasing)return{deployed:false,reason:'treaty_prohibits_foreign_nuclear_basing'};",
    "treaty_prohibits_foreign_nuclear_basing"
)
replace_once(
    'js/diplomacy/nuclearDeterrence.js',
    "import { tickNuclearArmsControl } from './nuclearArmsControl.js?v=20260920-arms-control1';",
    "import { tickNuclearArmsControl } from './nuclearArmsControl.js?v=20260920-arms-control1';\nimport { tickNuclearDiplomacy } from './nuclearDiplomacy.js?v=20260920-nuclear-diplomacy1';",
    "tickNuclearDiplomacy"
)
replace_once(
    'js/diplomacy/nuclearDeterrence.js',
    "  events.push(...tickNuclearArmsControl(regions,currentTick,elapsedDays));",
    "  events.push(...tickNuclearArmsControl(regions,currentTick,elapsedDays));\n  events.push(...tickNuclearDiplomacy(regions,currentTick,elapsedDays));",
    "events.push(...tickNuclearDiplomacy"
)
print('nuclear diplomacy integration applied')
