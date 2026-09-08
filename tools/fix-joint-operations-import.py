from pathlib import Path
p = Path('js/military/subregionalArmyBattles.js')
text = p.read_text()
text = text.replace("import { battleParticipationFraction } from './jointOperations.js?v=20260909-joint-ops1';", "import { battleParticipationFraction } from './battleCommand.js?v=20260909-joint-ops1';")
p.write_text(text)
