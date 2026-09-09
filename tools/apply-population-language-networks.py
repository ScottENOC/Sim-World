from pathlib import Path

p = Path('js/diplomacy/couriers.js')
text = p.read_text()
old = "import { chooseMessageMedium, communicationCapabilities, courierProfile, interceptedContentChance, languageComprehension, recordLanguageContact } from './languageCommunication.js?v=20260909-language1';"
new = "import { chooseMessageMedium, communicationCapabilities, courierProfile, interceptedContentChance, languageComprehension, recordLanguageContact } from './languageCommunication.js?v=20260909-language-networks1';\nimport { courtLanguageCompetence } from './languageNetworks.js?v=20260909-language-networks1';"
if old in text:
    text = text.replace(old, new, 1)

old = """  message.medium = choice.medium;\n  message.languageComprehensionAtDispatch = choice.comprehension;\n  message.courier = courierProfile(sender, choice.medium, complexity);"""
new = """  message.medium = choice.medium;\n  message.languageId = choice.languageId || null;\n  message.linguaFranca = Boolean(choice.linguaFranca);\n  message.languageComprehensionAtDispatch = choice.comprehension;\n  message.courier = courierProfile(sender, choice.medium, complexity);"""
if old in text:
    text = text.replace(old, new, 1)

old = """  const mode = ['written','sealed_written'].includes(message.medium) ? 'written' : 'spoken';\n  const understood = languageComprehension(target, sender, mode);\n  const memory = message.medium === 'oral_memorised' ? (message.courier?.memoryAccuracy ?? 0.85) : 1;"""
new = """  const mode = ['written','sealed_written'].includes(message.medium) ? 'written' : 'spoken';\n  // The recipient must understand the language the message was actually composed in.\n  // Do not silently switch to some other shared language when it arrives.\n  const understood = message.languageId\n    ? courtLanguageCompetence(target, message.languageId, mode)\n    : languageComprehension(target, sender, mode);\n  const memory = message.medium === 'oral_memorised' ? (message.courier?.memoryAccuracy ?? 0.85) : 1;"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)

# Institutional adoption can break ties between already-usable languages, but must
# never manufacture comprehension where neither court has a speaker/interpreter.
p = Path('js/diplomacy/languageNetworks.js')
text = p.read_text()
old = """    const score = competence + (institutional ? 0.035 : 0);\n    if (score > best.competence) best = { languageId, competence: clamp(score), linguaFranca: neitherNative };"""
new = """    const score = competence > 0 ? competence + (institutional ? 0.035 : 0) : 0;\n    if (score > best.competence) best = { languageId, competence: clamp(score), linguaFranca: neitherNative };"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)
