from pathlib import Path

path = Path('js/main.js')
text = path.read_text()
replacements = {
    "./ui/militaryAssistanceUi.js?v=20260920-aid-ui1": "./ui/militaryAssistanceUi.js?v=20260920-aid-ui2",
    "./diplomacy/militaryAidDiplomacy.js?v=20260920-aid-diplomacy1": "./diplomacy/militaryAidDiplomacy.js?v=20260920-aid-diplomacy2",
}
changed = False
for old, new in replacements.items():
    if old in text:
        text = text.replace(old, new)
        changed = True
    elif new not in text:
        raise SystemExit(f'integration anchor not found: {old}')
if changed:
    path.write_text(text)
