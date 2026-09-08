from pathlib import Path


def once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

p = Path('js/main.js')
s = p.read_text()
s = once(s,
"            const labels = { military_support: 'military support', tribute: 'tribute', resource_access: 'wood access' };",
"            const labels = { military_support: 'military support', tribute: 'tribute', resource_access: 'wood access', war_commitment: 'war commitment' };",
'war commitment label')
s = once(s,
"        if (!enemy) { document.getElementById('diplomacy-info').textContent = 'Choose which enemy you want them to fight.'; return; }",
"        if (!enemy || enemy.id === target.id) { document.getElementById('diplomacy-info').textContent = 'Choose a different polity as the enemy they should fight.'; return; }",
'prevent self-war invitation')
p.write_text(s)
print('strategic planning v3 UI polish applied')
