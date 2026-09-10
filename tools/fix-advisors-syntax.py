from pathlib import Path


def replace_required(text, old, new, filename):
    if old in text:
        return text.replace(old, new, 1)
    if new not in text:
        raise SystemExit(f'Expected syntax anchor not found in {filename}: {old[:80]!r}')
    return text

# Fix the materialised browser source.
path = Path('js/ui/advisors.js')
text = path.read_text()
text = replace_required(
    text,
    "    }));\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
    "    });\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
    str(path),
)
text = replace_required(
    text,
    "    }));\n    if (this.activeAdvisor !== 'marshal') return;",
    "    });\n    if (this.activeAdvisor !== 'marshal') return;",
    str(path),
)
path.write_text(text)

# Fix the integration script that generated the bad handlers so a later re-run
# cannot reintroduce them. Its inserted JS ends at the raw triple-quoted block,
# so the second anchor differs from the materialised advisors.js file.
path = Path('tools/apply-diplomats-ui.py')
text = path.read_text()
text = replace_required(
    text,
    "    }));\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
    "    });\n    document.getElementById('send-forged-letter')?.addEventListener('click', () => {",
    str(path),
)
text = replace_required(
    text,
    "      if (status) status.textContent = result.sent ? 'Forged letter dispatched. Whether it survives scrutiny is unknown.' : `Could not send (${result.reason}).`;\n    }));\n'''",
    "      if (status) status.textContent = result.sent ? 'Forged letter dispatched. Whether it survives scrutiny is unknown.' : `Could not send (${result.reason}).`;\n    });\n'''",
    str(path),
)
path.write_text(text)
