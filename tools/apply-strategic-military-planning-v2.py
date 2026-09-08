from pathlib import Path


def once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('js/diplomacy/couriers.js')
s = p.read_text()
s = once(s,
"      if (accepted) {\n        agreement = createWarCommitment(message, sender, target, agreements, currentTick);\n        changeAttitude(sender, target.id, 0.08, 'joined_war', currentTick);",
"      if (accepted) {\n        agreement = createWarCommitment(message, sender, target, agreements, currentTick);\n        if (!target.militaryStrategy || typeof target.militaryStrategy !== 'object') target.militaryStrategy = {};\n        target.militaryStrategy.posture = 'prepare_war';\n        target.militaryStrategy.targetRegionId = enemy?.id || message.enemyRegionId;\n        target.militaryStrategy.targetPolityId = message.enemyActorId;\n        target.militaryStrategy.garrisonFloor = Math.min(0.85, Math.max(0.45, Number(target.militaryStrategy.garrisonFloor) || 0.7));\n        target.militaryStrategy.spendingPriority = Math.max(0.6, Number(target.militaryStrategy.spendingPriority) || 0);\n        target.militaryStrategy.desiredPreparationWeeks = Math.min(26, Math.max(8, Number(target.militaryStrategy.desiredPreparationWeeks) || 20));\n        changeAttitude(sender, target.id, 0.08, 'joined_war', currentTick);",
'allied mobilisation on acceptance')
p.write_text(s)
print('strategic planning v2 applied')
