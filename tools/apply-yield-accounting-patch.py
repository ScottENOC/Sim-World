from pathlib import Path

path = Path('js/main.js')
text = path.read_text()
old = """  const nextUiFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const yieldForUi = async () => {
    do { await nextUiFrame(); } while (clock.isInteractionDeferred());
  };
"""
new = """  const nextUiFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const yieldForUi = async () => {
    const yieldStartedAt = performance.now();
    do { await nextUiFrame(); } while (clock.isInteractionDeferred());
    clock.recordCooperativeYield(performance.now() - yieldStartedAt);
  };
"""
if text.count(old) != 1:
    raise SystemExit('yield helper did not match exactly once')
path.write_text(text.replace(old, new))
Path('.github/workflows/performance-yield-accounting-patch.yml').unlink()
Path('tools/apply-yield-accounting-patch.py').unlink()
