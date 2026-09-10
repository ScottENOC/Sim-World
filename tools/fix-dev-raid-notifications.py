from pathlib import Path

path = Path('js/main.js')
text = path.read_text()

old = """    // The player does not get a global news feed. Only raids involving their\n    // own region are shown; other AI conflicts remain behind the fog.\n    const playerRaidEvents = fogOfWar.devMode\n      ? events\n      : events.filter((event) => {\n        const playerPolityId = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;\n        const attacker = regionsById.get(event.raid.attackerId);\n        const defender = regionsById.get(event.raid.defenderId);\n        return event.raid.attackerId === playerRegionId || event.raid.defenderId === playerRegionId ||\n          attacker?.governance?.sovereignPolityId === playerPolityId ||\n          defender?.governance?.sovereignPolityId === playerPolityId;\n      });\n"""
new = """    // Dev mode reveals diagnostic/map state, but it must not become a global\n    // player notification feed. Raid modals are always limited to the player's\n    // own region/polity so unrelated AI wars cannot pause or block the game.\n    const playerRaidEvents = events.filter((event) => {\n      const playerPolityId = regionsById.get(playerRegionId)?.governance?.sovereignPolityId;\n      if (!playerRegionId || !playerPolityId) return false;\n      const attacker = regionsById.get(event.raid.attackerId);\n      const defender = regionsById.get(event.raid.defenderId);\n      return event.raid.attackerId === playerRegionId || event.raid.defenderId === playerRegionId ||\n        attacker?.governance?.sovereignPolityId === playerPolityId ||\n        defender?.governance?.sovereignPolityId === playerPolityId;\n    });\n"""
if old not in text:
    raise SystemExit('raid notification block not found')
text = text.replace(old, new, 1)
path.write_text(text)
