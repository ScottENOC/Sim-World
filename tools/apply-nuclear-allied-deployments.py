from pathlib import Path


def replace_once(path, old, new, already_contains=None):
    p = Path(path)
    text = p.read_text()
    if already_contains and already_contains in text:
        return False
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))
    return True

replace_once(
    'js/diplomacy/nuclearDeterrence.js',
    "import { tickNuclearArmsControl } from './nuclearArmsControl.js?v=20260920-arms-control1';",
    "import { tickNuclearArmsControl } from './nuclearArmsControl.js?v=20260920-arms-control1';\nimport { estimateExtendedDeterrenceForAttack, tickAlliedNuclearDeployments } from './nuclearAlliedDeployments.js?v=20260920-nuclear-alliance1';",
    "tickAlliedNuclearDeployments"
)
replace_once(
    'js/diplomacy/nuclearDeterrence.js',
    "  const perceivedRisk=clamp((best?.score||.03)*(.28+.72*capability)*survivabilitySignal*(1-deniability*.34)*(1-reversible*.22));\n  return {perceivedRisk,capabilityConfidence:estimate.confidence,estimatedRetaliationConfidence:clamp(secondStrike.retaliationConfidence*estimate.confidence),matchedRedLineId:best?.line.id||null,publicRedLine:Boolean(best),salamiOpportunity:clamp((1-perceivedRisk)*(.45+.35*deniability+.20*reversible))};",
    "  const ownPerceivedRisk=clamp((best?.score||.03)*(.28+.72*capability)*survivabilitySignal*(1-deniability*.34)*(1-reversible*.22));\n  const allied=estimateExtendedDeterrenceForAttack(observer,target,action);\n  const perceivedRisk=Math.max(ownPerceivedRisk,allied.perceivedRisk||0);\n  return {perceivedRisk,ownPerceivedRisk,alliedDeterrenceRisk:allied.perceivedRisk||0,alliedProviderActorId:allied.providerActorId||null,capabilityConfidence:estimate.confidence,estimatedRetaliationConfidence:clamp(secondStrike.retaliationConfidence*estimate.confidence),matchedRedLineId:best?.line.id||null,publicRedLine:Boolean(best),salamiOpportunity:clamp((1-perceivedRisk)*(.45+.35*deniability+.20*reversible))};",
    "alliedDeterrenceRisk"
)
replace_once(
    'js/diplomacy/nuclearDeterrence.js',
    "  events.push(...tickNuclearArmsControl(regions,currentTick,elapsedDays));",
    "  events.push(...tickAlliedNuclearDeployments(regions,currentTick,elapsedDays));\n  events.push(...tickNuclearArmsControl(regions,currentTick,elapsedDays));",
    "events.push(...tickAlliedNuclearDeployments"
)
replace_once(
    'js/diplomacy/nuclearArmsControl.js',
    "  const assurance=constraints.securityAssurance;",
    "  const assurance=clamp(Math.max(constraints.securityAssurance,region.nuclearAlliance?.extendedDeterrenceAssurance||0));",
    "nuclearAlliance?.extendedDeterrenceAssurance"
)
print('allied nuclear deployment integration applied')
