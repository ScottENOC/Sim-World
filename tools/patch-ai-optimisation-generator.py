from pathlib import Path

path = Path('tools/apply-ai-performance-optimisations.py')
text = path.read_text()
old = """  const indexed = strategyContext?.supportByRegion.get(region.id);
  const candidates = indexed
    ? [...indexed.entries()].map(([otherId, active]) => ({ other: strategyContext.regionsById.get(otherId), active }))
    : regions.map((other) => ({
        other,
        active: other.id === region.id ? null : activeAgreementBetween(agreements, region.id, other.id, 'war_commitment') || activeAgreementBetween(agreements, region.id, other.id, 'military_support'),
      }));
"""
new = """  const indexed = strategyContext?.supportByRegion.get(region.id);
  const candidates = strategyContext
    ? (indexed ? [...indexed.entries()].map(([otherId, active]) => ({ other: strategyContext.regionsById.get(otherId), active })) : [])
    : regions.map((other) => ({
        other,
        active: other.id === region.id ? null : activeAgreementBetween(agreements, region.id, other.id, 'war_commitment') || activeAgreementBetween(agreements, region.id, other.id, 'military_support'),
      }));
"""
if text.count(old) != 1:
    raise SystemExit('generator ally candidate block did not match exactly once')
text = text.replace(old, new)
old = """  let nominal = 0; let expected = 0; const sources = [];
  const indexed = strategyContext?.supportByRegion.get(region.id);
  const candidates = strategyContext
"""
new = """  let nominal = 0; let expected = 0; const sources = [];
  // When a strategy context exists, absence from the index means exactly that:
  // this ruler has no active military-support agreement. Falling back to a
  // full regions × agreements scan here made the common no-allies case O(N²).
  const indexed = strategyContext?.supportByRegion.get(region.id);
  const candidates = strategyContext
"""
if text.count(old) != 1:
    raise SystemExit('generator ally comment anchor did not match exactly once')
text = text.replace(old, new)
path.write_text(text)
Path('.github/workflows/patch-ai-optimisation-generator.yml').unlink()
Path('tools/patch-ai-optimisation-generator.py').unlink()
