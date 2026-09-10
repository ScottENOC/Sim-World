from pathlib import Path

path = Path('js/ui/advisors.js')
text = path.read_text()

replacements = [
    (
        "    }));\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
        "    });\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
    ),
    (
        "    }));\n    if (this.activeAdvisor !== 'marshal') return;",
        "    });\n    if (this.activeAdvisor !== 'marshal') return;",
    ),
]

for old, new in replacements:
    if old in text:
        text = text.replace(old, new, 1)
    elif new not in text:
        raise SystemExit(f'Expected advisors.js syntax anchor not found: {old[:80]!r}')

path.write_text(text)
