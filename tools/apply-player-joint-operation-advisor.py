from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# Persist delivered joint-operation replies as information the recipient actually knows.
p = Path('js/diplomacy/couriers.js')
text = p.read_text()
old = """      if (message.type === 'joint_operation_reply') {\n        message.status = 'delivered';\n        message.response = { delivered: true, tick: currentTick, accepted: message.accepted };\n        events.push({ type: 'joint_operation_reply_delivered', message, accepted: message.accepted, jointOperationId: message.jointOperationId });\n        continue;\n      }"""
new = """      if (message.type === 'joint_operation_reply') {\n        message.status = 'delivered';\n        message.response = { delivered: true, tick: currentTick, accepted: message.accepted };\n        recordDiplomaticIntelligence(target, { type: 'joint_operation_reply_received', jointOperationId: message.jointOperationId,\n          senderActorId: message.senderActorId, targetActorId: message.targetActorId, enemyActorId: message.enemyActorId,\n          attackTick: message.proposedAttackTick, accepted: message.accepted, declaredCommitmentFraction: message.declaredCommitmentFraction,\n          learnedTick: currentTick, sourceMessageId: message.id });\n        events.push({ type: 'joint_operation_reply_delivered', message, accepted: message.accepted, jointOperationId: message.jointOperationId });\n        continue;\n      }"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('courier reply anchor missing')
p.write_text(text)

# Main integration: proposals, advisor milestones, and modal actions.
p = Path('js/main.js')
text = p.read_text()
old = "import { sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260908-couriers1';"
new = "import { sendJointOperationProposal, sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260909-joint-player1';\nimport { resolvePlayerJointOperationAdvice, tickPlayerJointOperationAdvisor } from './military/playerJointOperationAdvisor.js?v=20260909-joint-player1';"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main courier import missing')

old = """    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);\n    const warEvents = syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek);"""
new = """    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);\n    const playerCapitalForJointPlan = regionsById.get(playerRegionId);\n    const jointOperationAdvisorEvents = tickPlayerJointOperationAdvisor(playerCapitalForJointPlan, agreements, regionsById, activeCampaigns, calendarWeek);\n    for (const advisoryEvent of jointOperationAdvisorEvents) {\n      advisoryEvent.resolveDecision = (choice) => resolvePlayerJointOperationAdvice(advisoryEvent, choice, playerCapitalForJointPlan, regionsById, activeCampaigns, polities, calendarWeek);\n    }\n    const warEvents = syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek);"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main courier tick anchor missing')

old = """      ...courierEvents.filter((event) => {\n        const message = event.message;\n        return message && (message.senderActorId === activePlayerPolityId || message.targetActorId === activePlayerPolityId || event.interceptingActorId === activePlayerPolityId);\n      }),"""
new = """      ...courierEvents.filter((event) => {\n        const message = event.message;\n        return message && (message.senderActorId === activePlayerPolityId || message.targetActorId === activePlayerPolityId || event.interceptingActorId === activePlayerPolityId);\n      }),\n      ...jointOperationAdvisorEvents,"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('player event anchor missing')

# Add player UI for proposing a dated joint operation.
old = """              <option value=\"join_war\">Ask them to join a war</option>\n              <option value=\"vassalage\">Demand submission as a vassal</option>"""
new = """              <option value=\"join_war\">Ask them to join a war</option>\n              <option value=\"joint_operation\">Plan a joint attack for a future date</option>\n              <option value=\"vassalage\">Demand submission as a vassal</option>"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('diplomacy option anchor missing')

old = """          <label class=\"control-row hidden\" id=\"war-enemy-row\">Ask them to fight\n            <select id=\"war-enemy\"><option value=\"\">— select enemy —</option>${regions.filter((candidate) => candidate.id !== region.id && fogOfWar.isVisible(candidate)).map((candidate) => `<option value=\"${candidate.id}\">${candidate.name}</option>`).join('')}</select>\n          </label>\n          <div id=\"diplomacy-info\" class=\"raid-status\"></div>"""
new = """          <label class=\"control-row hidden\" id=\"war-enemy-row\">Ask them to fight\n            <select id=\"war-enemy\"><option value=\"\">— select enemy —</option>${regions.filter((candidate) => candidate.id !== region.id && fogOfWar.isVisible(candidate)).map((candidate) => `<option value=\"${candidate.id}\">${candidate.name}</option>`).join('')}</select>\n          </label>\n          <label class=\"control-row hidden\" id=\"joint-operation-months-row\">Attack in\n            <input id=\"joint-operation-months\" type=\"number\" min=\"1\" max=\"60\" step=\"1\" value=\"3\"> months\n          </label>\n          <label class=\"control-row hidden\" id=\"joint-operation-share-row\">Promise to commit\n            <input id=\"joint-operation-share\" type=\"number\" min=\"10\" max=\"95\" step=\"5\" value=\"60\">% of the field army\n          </label>\n          <div id=\"diplomacy-info\" class=\"raid-status\"></div>"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('diplomacy fields anchor missing')

old = """      supportRow.classList.toggle('hidden', !['military_support','join_war'].includes(diplomacyAction.value));\n      document.getElementById('war-enemy-row')?.classList.toggle('hidden', diplomacyAction.value !== 'join_war');"""
new = """      supportRow.classList.toggle('hidden', !['military_support','join_war'].includes(diplomacyAction.value));\n      document.getElementById('war-enemy-row')?.classList.toggle('hidden', !['join_war','joint_operation'].includes(diplomacyAction.value));\n      document.getElementById('joint-operation-months-row')?.classList.toggle('hidden', diplomacyAction.value !== 'joint_operation');\n      document.getElementById('joint-operation-share-row')?.classList.toggle('hidden', diplomacyAction.value !== 'joint_operation');"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('diplomacy visibility anchor missing')

old = """      if (diplomacyAction.value === 'join_war') {\n        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);"""
new = """      if (diplomacyAction.value === 'joint_operation') {\n        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);\n        if (!enemy || enemy.id === target.id) { document.getElementById('diplomacy-info').textContent = 'Choose a different polity as the target of the joint attack.'; return; }\n        const currentWeek = calendarWeekIndex(clock.elapsedDays || 0);\n        const months = Math.max(1, Number(document.getElementById('joint-operation-months')?.value) || 3);\n        const share = Math.max(10, Math.min(95, Number(document.getElementById('joint-operation-share')?.value) || 60)) / 100;\n        result = sendJointOperationProposal(region, target, enemy, regions, currentWeek, {\n          attackTick: currentWeek + Math.max(2, Math.round(months * 4.345)), commitmentFraction: share,\n          secrecy: ensureMilitaryStrategy(region).secrecy,\n        });\n        document.getElementById('diplomacy-info').textContent = result.sent\n          ? `Courier dispatched. You propose attacking ${enemy.name} in about ${months} month${months === 1 ? '' : 's'} and promise roughly ${Math.round(share * 100)}% of the field army. Their answer must travel back before you know it.`\n          : `Could not dispatch the plan (${String(result.reason).replaceAll('_', ' ')}).`;\n        return;\n      }\n      if (diplomacyAction.value === 'join_war') {\n        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('diplomacy handler anchor missing')

# Add modal handling for the three advisor milestones before campaign arrival handling.
anchor = """  if (event.type === 'campaign_arrived') {"""
insert = """  if (['joint_operation_mobilise_advice','joint_operation_stage_advice','joint_operation_launch_confirmation'].includes(event.type)) {\n    const assessment = event.assessment || {};\n    const options = document.getElementById('event-options');\n    const isLaunch = event.type === 'joint_operation_launch_confirmation';\n    const isStage = event.type === 'joint_operation_stage_advice';\n    document.getElementById('event-title').textContent = isLaunch ? `Launch the promised attack on ${assessment.enemyName || 'the enemy'}?`\n      : isStage ? 'Marshal: concentrate the army now?' : 'Marshal: begin mobilisation now?';\n    const lead = Math.max(0, (event.plan?.attackTick || 0) - (event.dueTick || 0));\n    document.getElementById('event-body').innerHTML = `${isLaunch\n      ? `This is the date agreed with ${assessment.allyName || 'our ally'}. The decision to attack is still yours.`\n      : isStage\n        ? `The agreed attack is approaching. The Marshal recommends concentrating the promised field army at the relevant border or embarkation area.`\n        : `The Marshal calculates that mobilisation should start now if we are to have the promised force ready on time.`}<br><br>` +\n      `<strong>Council assessment</strong><br>${assessment.marshal || ''}<br>${assessment.treasurer || ''}<br>${assessment.steward || ''}<br>${assessment.envoy || ''}<br>${assessment.spymaster || ''}` +\n      (isLaunch ? `<br><br><strong>Allied participation:</strong> ${assessment.allySummary || 'uncertain'}` : '');\n    const yesLabel = isLaunch ? 'Launch the attack as promised' : isStage ? 'Concentrate the army' : 'Begin mobilisation';\n    const noLabel = isLaunch ? 'Do not attack' : 'Not yet';\n    options.innerHTML = `<button id=\"btn-joint-plan-yes\">${yesLabel}</button><button id=\"btn-joint-plan-no\">${noLabel}</button>`;\n    const finish = (choice) => {\n      const result = event.resolveDecision?.(choice);\n      document.getElementById('event-body').textContent = result?.summary || 'Order recorded.';\n      options.innerHTML = '<button id=\"btn-event-continue\">Continue</button>';\n      document.getElementById('btn-event-continue').addEventListener('click', () => {\n        document.getElementById('event-modal').classList.add('hidden');\n        if (eventQueue.length > 0) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();\n      });\n    };\n    document.getElementById('btn-joint-plan-yes').addEventListener('click', () => finish('yes'));\n    document.getElementById('btn-joint-plan-no').addEventListener('click', () => finish('no'));\n    document.getElementById('event-modal').classList.remove('hidden');\n    return;\n  }\n"""
if insert not in text:
    if anchor not in text:
        raise SystemExit('event modal anchor missing')
    text = text.replace(anchor, insert + anchor, 1)
p.write_text(text)

# Marshal panel: show scheduled joint operations so the player can inspect the plan between prompts.
p = Path('js/ui/advisors.js')
text = p.read_text()
old = "import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';"
new = old + "\nimport { upcomingPlayerJointOperations } from '../military/playerJointOperationAdvisor.js?v=20260909-joint-player1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """  constructor({ regions, polities, religiousWorld, fogOfWar, clock, getPlayerRegionId, getActiveRaids, addRaid,\n    getCampaigns, addCampaign, openRegion }) {"""
new = """  constructor({ regions, polities, religiousWorld, fogOfWar, clock, getPlayerRegionId, getActiveRaids, addRaid,\n    getCampaigns, addCampaign, getAgreements = () => [], openRegion }) {"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('advisor constructor anchor missing')
old = """    this.getCampaigns = getCampaigns;\n    this.addCampaign = addCampaign;"""
new = """    this.getCampaigns = getCampaigns;\n    this.addCampaign = addCampaign;\n    this.getAgreements = getAgreements;"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('advisor assignments missing')
old = """    const siege = ensureSiegeEquipment(player);\n    return `"""
new = """    const siege = ensureSiegeEquipment(player);\n    const jointPlans = upcomingPlayerJointOperations(player, this.getAgreements(), Math.floor((this.clock.elapsedDays || 0) / 7));\n    return `"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('marshal joint plan anchor missing')
old = """      ${section('Active conflicts', campaigns.length\n        ? campaigns.map((campaign) => this.renderCampaignCard(campaign, player)).join('')\n        : '<p class=\"advisor-note\">The realm is not fighting a sustained campaign.</p>')}"""
new = """      ${section('Active conflicts', campaigns.length\n        ? campaigns.map((campaign) => this.renderCampaignCard(campaign, player)).join('')\n        : '<p class=\"advisor-note\">The realm is not fighting a sustained campaign.</p>')}\n      ${jointPlans.length ? section('Agreed joint operations', jointPlans.map(({ plan, weeksUntilAttack, preparation }) => {\n        const allyId = plan.proposerRegionId === player.id ? plan.partnerRegionId : plan.proposerRegionId;\n        const ally = this.regions.find((region) => region.id === allyId);\n        const enemy = this.regions.find((region) => region.id === plan.enemyRegionId);\n        return `<div class=\"advisor-note\"><strong>${enemy?.name || 'Joint attack'}</strong> with ${ally?.name || 'ally'} · ${weeksUntilAttack > 0 ? `${weeksUntilAttack} weeks to agreed attack` : 'attack date reached'}<br>` +\n          `Mobilised: ${preparation.mobilised ? 'yes' : 'not confirmed'} · staged: ${preparation.staged ? 'yes' : 'not confirmed'}</div>`;\n      }).join('')) : ''}"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('marshal section anchor missing')
p.write_text(text)

# Main council constructor receives agreements.
p = Path('js/main.js')
text = p.read_text()
old = """    getCampaigns: () => activeCampaigns,\n    addCampaign: (campaign) => activeCampaigns.push(campaign),"""
new = """    getCampaigns: () => activeCampaigns,\n    addCampaign: (campaign) => activeCampaigns.push(campaign),\n    getAgreements: () => agreements,"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('council construction anchor missing')
p.write_text(text)
