from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))

# ---- diplomats learn host language and observation quality depends on it ----
p = Path('js/diplomacy/diplomats.js')
text = p.read_text()
old = "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';"
new = old + "\nimport { diplomatLanguageComprehension, trainDiplomatLanguage } from './languageCommunication.js?v=20260909-language1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """      localFamiliarity: 0, compromised: false, credentialsCompromised: false,\n      route: null, departTick: null, arrivalTick: null,"""
new = """      localFamiliarity: 0, languageSkills: {}, compromised: false, credentialsCompromised: false,\n      route: null, departTick: null, arrivalTick: null,"""
if old in text:
    text = text.replace(old, new, 1)
old = """function postObservation(home, host, diplomat, currentTick, rng) {\n  home.diplomaticIntelligence ||= [];\n  const skill = clamp(diplomat.observationSkill + diplomat.localFamiliarity * 0.25);"""
new = """function postObservation(home, host, diplomat, currentTick, rng) {\n  home.diplomaticIntelligence ||= [];\n  const language = diplomatLanguageComprehension(diplomat, home, host);\n  const skill = clamp((diplomat.observationSkill + diplomat.localFamiliarity * 0.25) * (0.62 + language * 0.38));"""
if old in text:
    text = text.replace(old, new, 1)
old = """    confidence: clamp(0.35 + skill * 0.55), learnedTick: currentTick,"""
new = """    confidence: clamp(0.22 + skill * 0.48 + language * 0.22), languageComprehension: language, learnedTick: currentTick,"""
if old in text:
    text = text.replace(old, new, 1)
old = """      } else if (diplomat.status === 'posted') {\n        diplomat.localFamiliarity = clamp(diplomat.localFamiliarity + elapsedDays / 365.2425 * 0.18);\n        const host = regionsById.get(diplomat.postedRegionId);"""
new = """      } else if (diplomat.status === 'posted') {\n        diplomat.localFamiliarity = clamp(diplomat.localFamiliarity + elapsedDays / 365.2425 * 0.18);\n        const host = regionsById.get(diplomat.postedRegionId);\n        if (host) trainDiplomatLanguage(diplomat, home, host, elapsedDays);"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)

# ---- authentication capabilities are emergent, not modern defaults ----
p = Path('js/diplomacy/counterIntelligence.js')
text = p.read_text()
old = "import { residentDiplomatFor } from './diplomats.js?v=20260909-diplomats1';"
new = old + "\nimport { communicationCapabilities } from './languageCommunication.js?v=20260909-language1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """  if (!Number.isFinite(ci.credentialSecurity)) ci.credentialSecurity = 0.38;\n  if (!Number.isFinite(ci.codePractice)) ci.codePractice = 0.16;"""
new = """  const caps = communicationCapabilities(region);\n  if (!Number.isFinite(ci.credentialSecurity)) ci.credentialSecurity = caps.seals ? 0.38 : 0.16;\n  if (!Number.isFinite(ci.codePractice)) ci.codePractice = caps.ciphers ? 0.18 : caps.challengePhrases ? 0.07 : 0;"""
if old in text:
    text = text.replace(old, new, 1)
old = """export function credentialQuality(region) {\n  const ci = ensureCounterIntelligence(region);\n  const admin = region.governance?.administrativeControl ?? region.polityAdministration?.recordKeeping ?? 0.25;\n  return clamp(0.24 + ci.credentialSecurity * 0.42 + ci.codePractice * 0.18 + clamp(admin) * 0.16);\n}"""
new = """export function credentialQuality(region) {\n  const ci = ensureCounterIntelligence(region);\n  const caps = communicationCapabilities(region);\n  const admin = region.governance?.administrativeControl ?? region.polityAdministration?.recordKeeping ?? 0.25;\n  const seal = caps.seals ? 0.12 + caps.sealPractice * 0.18 : 0;\n  const challenge = caps.challengePhrases ? caps.challengePhrasePractice * 0.08 : 0;\n  return clamp(0.16 + ci.credentialSecurity * 0.34 + clamp(admin) * 0.16 + seal + challenge);\n}"""
if old in text:
    text = text.replace(old, new, 1)
old = """    coded: Boolean(options.coded),\n    strategicTruth: options.strategicTruth !== false,"""
new = """    sealed: communicationCapabilities(sender).seals,\n    coded: Boolean(options.coded) && communicationCapabilities(sender).ciphers,\n    strategicTruth: options.strategicTruth !== false,"""
if old in text:
    text = text.replace(old, new, 1)
old = """  const detectChance = clamp(0.08 + defence * 0.72 - forgery * 0.58 + (auth.coded ? ci.codePractice * 0.12 : 0), 0.03, 0.92);"""
new = """  const caps = communicationCapabilities(receiver);\n  const sealCheck = auth.sealed && caps.seals ? 0.1 + caps.sealPractice * 0.12 : 0;\n  const codeCheck = auth.coded && caps.ciphers ? 0.08 + caps.cipherPractice * 0.12 : 0;\n  const detectChance = clamp(0.06 + defence * 0.62 + sealCheck + codeCheck - forgery * 0.58, 0.02, 0.94);"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)

# ---- courier media, oral memorisation, language comprehension and interrogation ----
p = Path('js/diplomacy/couriers.js')
text = p.read_text()
old = "import { assessMessageAuthenticity, forgeryAuthentication, genuineAuthentication, intelligenceCredibilityFromMessage } from './counterIntelligence.js?v=20260909-counterintel1';"
new = old + "\nimport { chooseMessageMedium, communicationCapabilities, courierProfile, interceptedContentChance, languageComprehension, recordLanguageContact } from './languageCommunication.js?v=20260909-language1';"
if new not in text:
    text = text.replace(old, new, 1)
anchor = "function ensureMailbox(region) {"
helper = r'''function prepareCommunication(message, sender, target, complexity = 0.5, options = {}) {
  const choice = chooseMessageMedium(sender, target, complexity, options);
  message.medium = choice.medium;
  message.languageComprehensionAtDispatch = choice.comprehension;
  message.courier = courierProfile(sender, choice.medium, complexity);
  message.contentRecovered = null;
  message.deliveryComprehension = null;
  if (message.authentication) {
    const caps = communicationCapabilities(sender);
    message.authentication.sealed = Boolean(caps.seals && choice.medium === 'sealed_written');
    message.authentication.coded = Boolean(message.authentication.coded && caps.ciphers);
  }
  return message;
}

function resolveDeliveryLanguage(message, sender, target) {
  const mode = ['written','sealed_written'].includes(message.medium) ? 'written' : 'spoken';
  const understood = languageComprehension(target, sender, mode);
  const memory = message.medium === 'oral_memorised' ? (message.courier?.memoryAccuracy ?? 0.85) : 1;
  message.deliveryComprehension = clamp(understood * memory);
  recordLanguageContact(target, sender, 1.4, { written: mode === 'written' });
  recordLanguageContact(sender, target, 0.6, { written: mode === 'written' });
  return message.deliveryComprehension;
}

'''
if helper not in text:
    text = text.replace(anchor, helper + anchor, 1)

# Add preparation before each outbound message is queued. The same exact push text occurs in several functions.
replacements = [
("""  sender.diplomaticMessages.push(message);\n  return { sent: true, message };\n}\n\nfunction jointOperationAcceptance""",
 """  prepareCommunication(message, sender, target, 0.82, { interpreterAvailable: Boolean(residentDiplomat) });\n  sender.diplomaticMessages.push(message);\n  return { sent: true, message };\n}\n\nfunction jointOperationAcceptance"""),
("""  target.diplomaticMessages.push(reply);\n  return reply;""",
 """  prepareCommunication(reply, target, sender, 0.55, { interpreterAvailable: Boolean(original.residentDiplomatId) });\n  target.diplomaticMessages.push(reply);\n  return reply;"""),
("""  forger.diplomaticMessages.push(message);\n  return { sent: true, message };""",
 """  prepareCommunication(message, forger, target, 0.78);\n  forger.diplomaticMessages.push(message);\n  return { sent: true, message };"""),
("""  sender.diplomaticMessages.push(message);\n  return { sent: true, message };\n}\n\nfunction recordApparentPlan""",
 """  prepareCommunication(message, sender, target, 0.72);\n  sender.diplomaticMessages.push(message);\n  return { sent: true, message };\n}\n\nfunction recordApparentPlan"""),
]
for old, new in replacements:
    if old in text and new not in text:
        text = text.replace(old, new, 1)
# War invitation final push: select the occurrence nearest sendWarInvitation body by replacing the first remaining exact block after its declaration.
war_start = text.find('export function sendWarInvitation')
if war_start >= 0:
    idx = text.find('  sender.diplomaticMessages.push(message);', war_start)
    if idx >= 0 and 'prepareCommunication(message, sender, target, 0.68' not in text[war_start:idx+200]:
        text = text[:idx] + '  prepareCommunication(message, sender, target, 0.68);\n' + text[idx:]

# Language affects acceptance: poor interpretation makes complex military proposals risky/misunderstood.
old = """  const delegatedBonus = message.residentDiplomatId ? 0.12 : 0;\n  const authenticityPenalty = authenticity?.verdict === 'uncertain' ? 0.16 : authenticity?.detectedForgery ? 0.8 : 0;\n  return clamp(0.06 + friend * 0.38 + enemyHostility * 0.28 + readiness * 0.16 + warning * 0.12 + delegatedBonus - authenticityPenalty);"""
new = """  const delegatedBonus = message.residentDiplomatId ? 0.12 : 0;\n  const authenticityPenalty = authenticity?.verdict === 'uncertain' ? 0.16 : authenticity?.detectedForgery ? 0.8 : 0;\n  const language = clamp(message.deliveryComprehension ?? message.languageComprehensionAtDispatch ?? 0.25);\n  const languagePenalty = language < 0.2 ? 0.38 : language < 0.45 ? 0.17 : 0;\n  return clamp(0.06 + friend * 0.38 + enemyHostility * 0.28 + readiness * 0.16 + warning * 0.12 + delegatedBonus - authenticityPenalty - languagePenalty);"""
if old in text:
    text = text.replace(old, new, 1)

# On interception, an oral courier may reveal nothing even if captured; a written letter usually yields contents.
old = """        message.intercepted = true;\n        message.compromised = true;"""
new = """        message.intercepted = true;\n        message.compromised = true;\n        message.contentRecovered = rng() < interceptedContentChance(message, 0.55);"""
if old in text:
    text = text.replace(old, new, 1)
old = """        if (interceptorRegion && ['joint_operation_proposal','joint_operation_reply','forged_joint_operation_letter','deception_joint_operation_letter'].includes(message.type)) {"""
new = """        if (message.contentRecovered && interceptorRegion && ['joint_operation_proposal','joint_operation_reply','forged_joint_operation_letter','deception_joint_operation_letter'].includes(message.type)) {"""
if old in text:
    text = text.replace(old, new, 1)

# Once a message reaches its intended court, resolve actual comprehension before processing it.
old = """      message.status = 'delivered';\n      message.receivedTick = currentTick;"""
new = """      message.status = 'delivered';\n      message.receivedTick = currentTick;\n      resolveDeliveryLanguage(message, sender, target);"""
if old in text:
    text = text.replace(old, new, 1)

p.write_text(text)

# ---- main simulation ticks communication practice before diplomats/couriers ----
p = Path('js/main.js')
text = p.read_text()
old = "import { ensureCounterIntelligence, setCounterIntelligencePolicy } from './diplomacy/counterIntelligence.js?v=20260909-counterintel1';"
new = old + "\nimport { ensureCommunicationState, tickCommunicationPractices } from './diplomacy/languageCommunication.js?v=20260909-language1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """  for (const region of regions) { ensureDiplomaticService(region); ensureCounterIntelligence(region); }"""
new = """  for (const region of regions) { ensureCommunicationState(region); ensureDiplomaticService(region); ensureCounterIntelligence(region); }"""
text = text.replace(old, new)
old = """    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);\n    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);"""
new = """    tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, time.elapsedDays);\n    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);\n    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)
