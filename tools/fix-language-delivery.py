from pathlib import Path
p = Path('js/diplomacy/couriers.js')
text = p.read_text()
old = """      if (currentTick < message.arrivalTick) continue;\n      if (message.type === 'forged_joint_operation_letter') {"""
new = """      if (currentTick < message.arrivalTick) continue;\n      message.receivedTick = currentTick;\n      resolveDeliveryLanguage(message, sender, target);\n      if (message.type === 'forged_joint_operation_letter') {"""
if new not in text:
    if old not in text:
        raise SystemExit('courier delivery anchor missing')
    text = text.replace(old, new, 1)
p.write_text(text)
