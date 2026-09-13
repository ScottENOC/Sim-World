#!/usr/bin/env python3
"""Idempotently integrate the fiscal-military Early Modern layer into runtime."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'js' / 'main.js'
CAMPAIGNS = ROOT / 'js' / 'military' / 'campaigns.js'


def insert_once(text, needle, replacement):
    if replacement in text:
        return text
    if needle not in text:
        raise RuntimeError(f'integration anchor not found: {needle[:80]!r}')
    return text.replace(needle, replacement, 1)


def main():
    main_text = MAIN.read_text()
    import_anchor = "import { tickEarlyModernReform } from './society/earlyModernReform.js?v=20260914-reform1';"
    import_line = import_anchor + "\nimport { tickFiscalMilitaryState } from './politics/fiscalMilitaryState.js?v=20260914-fiscal-military1';"
    main_text = insert_once(main_text, import_anchor, import_line)

    tick_anchor = "    const earlyModernReformEvents = profiler.measure('Early-modern religious reform', () => tickEarlyModernReform(regions, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));"
    tick_line = tick_anchor + "\n    const fiscalMilitaryEvents = profiler.measure('Fiscal-military state', () => tickFiscalMilitaryState(regions, polities, activeWars, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));"
    main_text = insert_once(main_text, tick_anchor, tick_line)

    # Surface major player-facing fiscal/fortification milestones through the
    # existing event queue without changing unrelated AI notification behaviour.
    event_anchor = "      ...earlyModernReformEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),"
    if event_anchor in main_text:
        event_line = event_anchor + "\n      ...fiscalMilitaryEvents.filter((event) => event.polityId === activePlayerPolityId),"
        main_text = insert_once(main_text, event_anchor, event_line)
    MAIN.write_text(main_text)

    campaigns = CAMPAIGNS.read_text()
    import_anchor = "import { campaignExternalSupport, applyExternalCampaignLosses } from '../politics/privateMilitaryActors.js?v=20260912-pmc1';"
    import_line = import_anchor + "\nimport { fortificationResistanceMultiplier } from '../politics/fiscalMilitaryState.js?v=20260914-fiscal-military1';"
    campaigns = insert_once(campaigns, import_anchor, import_line)

    power_anchor = "    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * artillery.fortDefenceMultiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');"
    power_line = "    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * artillery.fortDefenceMultiplier *\n    fortificationResistanceMultiplier(defender) * medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');"
    campaigns = insert_once(campaigns, power_anchor, power_line)
    CAMPAIGNS.write_text(campaigns)

    print('Fiscal-military runtime integration applied')


if __name__ == '__main__':
    main()
