from pathlib import Path
p=Path('js/politics/polities.js'); s=p.read_text()
old="""export function polityById(polities, id) {
  return polities.find((polity) => polity.id === id) || null;
}"""
new="""const POLITY_INDEX_CACHE = new WeakMap();

function polityIndex(polities) {
  let index = POLITY_INDEX_CACHE.get(polities);
  if (!index || index.size !== polities.length) {
    index = new Map(polities.map((polity) => [polity.id, polity]));
    POLITY_INDEX_CACHE.set(polities, index);
  }
  return index;
}

export function polityById(polities, id) {
  return polityIndex(polities).get(id) || null;
}"""
if old not in s: raise SystemExit('polityById anchor missing')
s=s.replace(old,new,1)
old2="""  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const events = [];
  for (const polity of polities) {"""
new2="""  const regionsById = new Map(regions.map((region) => [region.id, region]));
  // Build the sovereignty index once. The old code filtered the entire region
  // list once per polity, which becomes O(polities × regions) as the world grows.
  const territoriesByPolity = new Map();
  for (const region of regions) {
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    if (!polityId) continue;
    let territories = territoriesByPolity.get(polityId);
    if (!territories) { territories = []; territoriesByPolity.set(polityId, territories); }
    territories.push(region);
  }
  const events = [];
  for (const polity of polities) {"""
if old2 not in s: raise SystemExit('tick index anchor missing')
s=s.replace(old2,new2,1)
old3="""    const subjects = polityTerritories(polity, regions).filter((region) => region.id !== capital.id);"""
new3="""    const territories = territoriesByPolity.get(polity.id) || [];
    const subjects = territories.length <= 1 ? [] : territories.filter((region) => region.id !== capital.id);"""
if old3 not in s: raise SystemExit('subjects anchor missing')
s=s.replace(old3,new3,1)
p.write_text(s)
