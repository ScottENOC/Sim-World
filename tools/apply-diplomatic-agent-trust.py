from pathlib import Path

# Wire delegated authority breaches into resident-diplomat joint-operation negotiation.
p=Path('js/diplomacy/couriers.js')
s=p.read_text()
s=s.replace("import { diplomatCanCommit, residentDiplomatFor } from './diplomats.js?v=20260909-diplomats1';", "import { diplomatCommitDecision, residentDiplomatFor } from './diplomats.js?v=20260909-agent-trust1';")
s=s.replace("  const residentDiplomat = residentDiplomatFor(target, sender.id);\n  const delegated = diplomatCanCommit(residentDiplomat, 'joint_operation', statedFraction);\n  const route = delegated ? { mode: 'resident', days: 0, diplomatId: residentDiplomat.id } : routeFor(sender, target, regionsById);", "  const residentDiplomat = residentDiplomatFor(target, sender.id);\n  const leadWeeks = Math.max(2, Math.round(options.leadWeeks ?? 12));\n  const commitDecision = residentDiplomat ? diplomatCommitDecision(residentDiplomat, 'joint_operation', statedFraction, currentTick, { urgency: clamp(1 - leadWeeks / 26), rng: options.rng || Math.random }) : { canCommit: false };\n  const delegated = Boolean(commitDecision.canCommit);\n  const route = delegated ? { mode: 'resident', days: 0, diplomatId: residentDiplomat.id } : routeFor(sender, target, regionsById);")
s=s.replace("  const leadWeeks = Math.max(2, Math.round(options.leadWeeks ?? 12));\n  const message = {", "  const message = {")
s=s.replace("    residentDiplomatId: delegated ? residentDiplomat.id : null, delegatedAuthority: delegated ? residentDiplomat.authority : null,", "    residentDiplomatId: delegated ? residentDiplomat.id : null, delegatedAuthority: delegated ? residentDiplomat.authority : null,\n    authorityExceeded: Boolean(delegated && commitDecision.exceededAuthority),")
s=s.replace("    sourceDiplomatId: message.residentDiplomatId || null, delegatedAuthority: message.delegatedAuthority || null,", "    sourceDiplomatId: message.residentDiplomatId || null, delegatedAuthority: message.delegatedAuthority || null,\n    authorityExceeded: Boolean(message.authorityExceeded), authorityRatified: !message.authorityExceeded,")
p.write_text(s)

# Add delayed discovery and a ruler decision for diplomats who exceeded their mandate.
p=Path('js/diplomacy/diplomats.js')
s=p.read_text()
needle="""        if (host) {\n          const hostAction = maybeHostAction(home, host, diplomat, currentTick, elapsedDays, rng, regions);"""
replace="""        const pendingBreach = (diplomat.authorityBreaches || []).find((breach) => !breach.reported && currentTick - (breach.currentTick ?? currentTick) >= 4);\n        if (pendingBreach) {\n          pendingBreach.reported = true;\n          events.push({ type: 'diplomat_authority_breach_reported', homeRegionId: home.id, hostRegionId: diplomat.postedRegionId, diplomat, breach: pendingBreach });\n        }\n        if (host) {\n          const hostAction = maybeHostAction(home, host, diplomat, currentTick, elapsedDays, rng, regions);"""
s=s.replace(needle,replace)
append="""

export function resolveDiplomatAuthorityBreach(home, diplomatId, decision, agreements = [], currentTick = null) {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat) return { resolved: false, reason: 'missing_diplomat' };
  const breach = [...(diplomat.authorityBreaches || [])].reverse().find((b) => b.reported && !b.resolved);
  if (!breach) return { resolved: false, reason: 'no_pending_breach' };
  const affected = (agreements || []).filter((a) => a.active && a.sourceDiplomatId === diplomat.id && a.authorityExceeded && !a.authorityRatified);
  breach.resolved = true; breach.resolution = decision; breach.resolvedTick = currentTick;
  if (decision === 'ratify') {
    for (const agreement of affected) { agreement.authorityRatified = true; agreement.ratifiedTick = currentTick; }
    diplomat.reputation.reliability = clamp(diplomat.reputation.reliability + 0.015);
    return { resolved: true, ratified: true, affectedAgreements: affected.length };
  }
  for (const agreement of affected) { agreement.active = false; agreement.repudiatedForAuthority = true; agreement.repudiatedTick = currentTick; }
  diplomat.authority = DIPLOMAT_AUTHORITY.OBSERVE;
  diplomat.loyalty = clamp((diplomat.loyalty ?? 0.5) - 0.08);
  recordDiplomatPerformance(diplomat, 'authority_breach');
  return { resolved: true, ratified: false, affectedAgreements: affected.length };
}
"""
if 'export function resolveDiplomatAuthorityBreach' not in s: s += append
p.write_text(s)

# Player event handling + exposed gameplay API.
p=Path('js/main.js')
s=p.read_text()
old="import { dispatchDiplomat, ensureDiplomaticService, recallDiplomat, setDiplomatAuthority, syncNextDiplomatId, tickDiplomats } from './diplomacy/diplomats.js?v=20260909-diplomats1';"
new="import { attemptBribeDiplomat, diplomatPublicProfile, dispatchDiplomat, ensureDiplomaticService, expelDiplomat, foreignGovernmentTrust, recallDiplomat, releaseDiplomat, resolveDiplomatAuthorityBreach, setDiplomatAuthority, syncNextDiplomatId, tickDiplomats } from './diplomacy/diplomats.js?v=20260909-agent-trust1';"
s=s.replace(old,new)
old="""    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);\n    const courierEvents = tickDiplomaticCouriers"""
new="""    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);\n    for (const diplomatEvent of diplomatEvents) {\n      if (diplomatEvent.type !== 'diplomat_authority_breach_reported' || diplomatEvent.homeRegionId !== playerRegionId) continue;\n      diplomatEvent.resolveDecision = (choice) => resolveDiplomatAuthorityBreach(regionsById.get(diplomatEvent.homeRegionId), diplomatEvent.diplomat.id, choice, agreements, calendarWeek);\n    }\n    const courierEvents = tickDiplomaticCouriers"""
s=s.replace(old,new)
old="""    diplomatApi: { dispatchDiplomat, recallDiplomat, setDiplomatAuthority, setCounterIntelligencePolicy, sendForgedJointOperationLetter, sendDeceptionJointOperationLetter },"""
new="""    diplomatApi: { dispatchDiplomat, recallDiplomat, setDiplomatAuthority, setCounterIntelligencePolicy, sendForgedJointOperationLetter, sendDeceptionJointOperationLetter, attemptBribeDiplomat, expelDiplomat, releaseDiplomat, diplomatPublicProfile, foreignGovernmentTrust },"""
s=s.replace(old,new)
# Insert event UI before fleet contact handling.
needle="""  if (event.type === 'fleet_contact') {"""
handler="""  if (event.type === 'diplomat_authority_breach_reported') {\n    document.getElementById('event-title').textContent = 'Envoy exceeded his mandate';\n    document.getElementById('event-body').textContent = `${event.diplomat?.name || 'Your envoy'} made a commitment beyond the authority you granted. You can ratify the commitment, accepting it as state policy, or repudiate it at the cost of diplomatic credibility and the envoy's standing.`;\n    const options = document.getElementById('event-options');\n    options.innerHTML = '<button id=\"btn-dip-ratify\">Ratify the commitment</button><button id=\"btn-dip-repudiate\">Repudiate it and restrict the envoy</button>';\n    document.getElementById('event-modal').classList.remove('hidden');\n    const finish = (choice) => {\n      const result = event.resolveDecision?.(choice);\n      document.getElementById('event-body').textContent = choice === 'ratify' ? `The commitment is ratified${result?.affectedAgreements ? ` (${result.affectedAgreements} agreement)` : ''}.` : 'The commitment is repudiated and the envoy is reduced to observation authority.';\n      options.innerHTML = '<button id=\"btn-event-continue\">Continue</button>';\n      document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });\n    };\n    document.getElementById('btn-dip-ratify').addEventListener('click', () => finish('ratify'));\n    document.getElementById('btn-dip-repudiate').addEventListener('click', () => finish('repudiate'));\n    return;\n  }\n  if (['diplomat_expelled','diplomat_detained','diplomat_compromise_suspected'].includes(event.type)) {\n    document.getElementById('event-title').textContent = event.type === 'diplomat_expelled' ? 'Envoy expelled' : event.type === 'diplomat_detained' ? 'Envoy detained' : 'Spymaster questions an envoy';\n    document.getElementById('event-body').textContent = event.type === 'diplomat_expelled' ? `${event.diplomat?.name || 'Your envoy'} has been ordered to leave the foreign court.` : event.type === 'diplomat_detained' ? `${event.diplomat?.name || 'Your envoy'} has been detained and cannot be recalled normally.` : `There are reasons to doubt ${event.diplomat?.name || 'your envoy'}. This is suspicion, not proof of betrayal.`;\n    wireEventContinue(clock,eventQueue); return;\n  }\n"""+needle
s=s.replace(needle,handler,1)
p.write_text(s)
