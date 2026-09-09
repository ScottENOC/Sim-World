from pathlib import Path
p = Path('tools/test-joint-operations-command.mjs')
text = p.read_text()
old = "import { resolveSubregionalArmyBattles } from '../js/military/subregionalArmyBattles.js';"
new = old + "\nimport { ensureCommunicationState } from '../js/diplomacy/languageCommunication.js';"
if new not in text:
    if old not in text: raise SystemExit('joint-operation test import anchor missing')
    text = text.replace(old, new, 1)
old = """const regions = [sender, ally, essex];\nconst agreements = [];"""
new = """const regions = [sender, ally, essex];\n// This regression is about courier timing/betrayal, not first-contact translation.\n// Give the two negotiating courts an already-shared diplomatic language.\nensureCommunicationState(sender).languageId = 'lang:diplomatic-test';\nensureCommunicationState(ally).languageId = 'lang:diplomatic-test';\nconst agreements = [];"""
if new not in text:
    if old not in text: raise SystemExit('joint-operation test setup anchor missing')
    text = text.replace(old, new, 1)
p.write_text(text)
