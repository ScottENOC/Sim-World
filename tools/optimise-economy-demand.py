from pathlib import Path
p=Path('js/economy/laborCore.js'); s=p.read_text()
old="""  for (const region of regions) {
    region._externalBronzeDemand = region.neighbors.reduce((sum, id) =>
      sum + (regionsById.get(id)?.marketDemand?.bronze || 0), 0
    ) * 0.25;
    region._externalManufacturedDemand = {};
    for (const key of MANUFACTURED_ORDER_KEYS) {
      region._externalManufacturedDemand[key] = region.neighbors.reduce((sum, id) =>
        sum + (regionsById.get(id)?.marketDemand?.[key] || 0), 0
      );
    }
  }"""
new="""  for (const region of regions) {
    let externalBronzeDemand = 0;
    const externalManufacturedDemand = Object.fromEntries(
      MANUFACTURED_ORDER_KEYS.map((key) => [key, 0]));
    // One neighbour pass supplies every workshop order signal. Previously we
    // re-walked the same neighbours once for bronze and once for every finished
    // good, multiplying this fixed local calculation by ~12.
    for (const id of region.neighbors) {
      const demand = regionsById.get(id)?.marketDemand;
      if (!demand) continue;
      externalBronzeDemand += demand.bronze || 0;
      for (const key of MANUFACTURED_ORDER_KEYS) {
        externalManufacturedDemand[key] += demand[key] || 0;
      }
    }
    region._externalBronzeDemand = externalBronzeDemand * 0.25;
    region._externalManufacturedDemand = externalManufacturedDemand;
  }"""
if old not in s: raise SystemExit('external demand anchor missing')
p.write_text(s.replace(old,new,1))
