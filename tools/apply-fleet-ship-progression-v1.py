from pathlib import Path

fleet_path = Path('js/military/fleets.js')
fleet = fleet_path.read_text()
warfare = Path('js/military/earlyModernWarfare.js').read_text()

# This helper originally existed to integrate the fleet progression feature on
# its feature branch. Later naval features legitimately extend those same
# functions, so exact old/new block matching is no longer a safe idempotence
# test. If the complete progression is already present, leave newer code alone.
required = [
    "id: 'galley'", "id: 'ocean_sailing_warship'", "id: 'gunpowder_sailing_warship'",
    "id: 'frigate'", "id: 'ship_of_line'", "id: 'paddle_steam_warship'",
    "id: 'steam_frigate'", "id: 'ironclad'", "id: 'steel_warship'",
    'preferredWarshipDesign', 'consumeFleetCoal', 'armourResistance',
]
if all(marker in fleet for marker in required) and 'ship.gunCapacity' in warfare:
    print('fleet ship progression already integrated')
    raise SystemExit(0)

raise SystemExit('fleet ship progression integration is incomplete; reapply from the original feature branch rather than partially patching newer fleet code')
