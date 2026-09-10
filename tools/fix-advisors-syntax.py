from pathlib import Path

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

for filename in ('js/ui/advisors.js', 'tools/apply-diplomats-ui.py'):
    path = Path(filename)
    text = path.read_text()
    for old, new in replacements:
        if old in text:
            text = text.replace(old, new, 1)
        elif new not in text:
            raise SystemExit(f'Expected syntax anchor not found in {filename}: {old[:80]!r}')
    path.write_text(text)
