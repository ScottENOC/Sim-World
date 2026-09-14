#!/usr/bin/env python3
"""Repair tiny land-neighbour seams for Latin America after water regions are known."""
import json
from pathlib import Path
from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT=Path(__file__).resolve().parents[1]
GEO_PATH=ROOT/'data/world/regions.geo.json'
META_PATH=ROOT/'data/world/regions.meta.json'
SEA_META_PATH=ROOT/'data/world/seaRegions.meta.json'
REVIEW_PATH=ROOT/'data/world/latin-america-v1-review.json'
SOURCE_GROUP='latin_america_caribbean_v1'
MAX_SEAM_DEGREES=0.08

def main():
    geo=json.loads(GEO_PATH.read_text()); meta_doc=json.loads(META_PATH.read_text())
    seas=json.loads(SEA_META_PATH.read_text()).get('seaRegions',[])
    review=json.loads(REVIEW_PATH.read_text()) if REVIEW_PATH.exists() else []
    review_by_id={r['id']:r for r in review}
    features=geo.get('features',[]); meta_by_id={m['id']:m for m in meta_doc.get('regions',[])}
    feature_by_id={f['properties']['id']:f for f in features}
    new_ids={f['properties']['id'] for f in features if f.get('properties',{}).get('sourceGroup')==SOURCE_GROUP}
    coastal=set(); [coastal.update(s.get('adjacentLand',[])) for s in seas]
    ids=list(feature_by_id); geoms=[shape(feature_by_id[r]['geometry']) for r in ids]; tree=STRtree(geoms)
    index_by_id={rid:i for i,rid in enumerate(ids)}; repaired=[]
    for rid in sorted(new_ids):
        meta=meta_by_id[rid]
        if meta.get('neighbors') or rid in coastal: continue
        geom=geoms[index_by_id[rid]]; best=None
        for raw_j in tree.query(geom.buffer(MAX_SEAM_DEGREES)):
            j=int(raw_j); oid=ids[j]
            if oid==rid: continue
            d=geom.distance(geoms[j])
            if d<=1e-9 or d>MAX_SEAM_DEGREES: continue
            score=(d,0 if oid in new_ids else 1,oid)
            if best is None or score<best[0]: best=(score,oid,d)
        if best:
            _,oid,d=best; meta.setdefault('neighbors',[]).append(oid); meta_by_id[oid].setdefault('neighbors',[]).append(rid)
            meta['neighbors']=sorted(set(meta['neighbors'])); meta_by_id[oid]['neighbors']=sorted(set(meta_by_id[oid]['neighbors'])); repaired.append((rid,oid,d))
    still=[]
    for rid in new_ids:
        if not meta_by_id[rid].get('neighbors') and rid not in coastal: still.append((rid,meta_by_id[rid].get('name',rid)))
    if still:
        for rid,name in still:
            geom=geoms[index_by_id[rid]]; nearest=sorted((geom.distance(other),oid,meta_by_id.get(oid,{}).get('name',oid),oid in new_ids) for oid,other in zip(ids,geoms) if oid!=rid)
            print(f'UNRESOLVED_INLAND_ORPHAN {rid} {name}')
            print('ORPHAN_SOURCE_UNITS='+json.dumps(review_by_id.get(rid,{}).get('sourceUnits',[]),ensure_ascii=False))
            print('ORPHAN_BOUNDS='+json.dumps([round(v,6) for v in geom.bounds]))
            for d,oid,oname,isnew in nearest[:8]: print(f'ORPHAN_NEAREST distanceDegrees={d:.6f} new={int(isnew)} id={oid} name={oname}')
        raise RuntimeError(f'{len(still)} inland Latin America regions remain disconnected')
    META_PATH.write_text(json.dumps(meta_doc,ensure_ascii=False,separators=(',',':')))
    print(f'REPAIRED_SOURCE_SEAMS={len(repaired)}')
    print(f'WATER_ONLY_REGIONS={sum(1 for rid in new_ids if not meta_by_id[rid].get("neighbors") and rid in coastal)}')

if __name__=='__main__': main()
