#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'js/military/campaigns.js'
text = p.read_text()
old = """  const attackerFirearms = firearmCombatProfile(attacker, defender, campaign.personnel, { consumeSupplies: true, elapsedDays: 7 });
  const defenderFirearms = firearmCombatProfile(defender, attacker, defender.army.personnel, { consumeSupplies: true, elapsedDays: 7 });
"""
new = """  const attackerFirearms = firearmCombatProfile(attacker, defender, campaign.personnel, {
    consumeSupplies: true, elapsedDays: 7, logisticsSupply: campaign.supply,
  });
  const defenderFirearms = firearmCombatProfile(defender, attacker, defender.army.personnel, {
    consumeSupplies: true, elapsedDays: 7, logisticsSupply: 1,
  });
"""
if new in text:
    print('Campaign firearm logistics already applied')
elif old in text:
    p.write_text(text.replace(old, new, 1))
    print('Applied campaign firearm logistics')
else:
    raise RuntimeError('Expected campaign firearm profile block not found')
