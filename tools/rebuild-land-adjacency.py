#!/usr/bin/env python3
"""Recompute land-region centroids, areas and adjacency from checked-in geometry."""
from __future__ import annotations
import json
from pathlib import Path
from pyproj import Geod
from shapely.geometry import shape
from shapely.strtree import STRtree

ROOT=Path(__file__).resolve().parents[1]
GEO=ROOT/'data/world/regions.geo.json'
META=ROOT/'data/world/regions.meta.json'
GEOD=Geod(ellps='WGS84')
TOL=0.025


def area(g):
    a,_=GEOD.geometry_area_perimeter(g)
    return abs(a)/1_000_000


def main():
    geo=json.loads(GEO.read_text()); meta=json.loads(META.read_text())
    features=geo['features']; ids=[f['properties']['id'] for f in features]
    geoms=[shape(f['geometry']) for f in features]
    by_id={m['id']:m for m in meta['regions']}
    for f,rid,g in zip(features,ids,geoms):
        row=by_id.setdefault(rid,{'id':rid})
        row['name']=f['properties'].get('name',rid)
        p=g.representative_point(); row['centroid']=[p.x,p.y]
        row['areaSqKm']=area(g); row['neighbors']=[]
    tree=STRtree(geoms); edges=0
    for i,g in enumerate(geoms):
        minx,miny,maxx,maxy=g.bounds
        for raw in tree.query(g.buffer(TOL)):
            j=int(raw)
            if j<=i: continue
            h=geoms[j]; hminx,hminy,hmaxx,hmaxy=h.bounds
            if hmaxx<minx-TOL or hminx>maxx+TOL or hmaxy<miny-TOL or hminy>maxy+TOL: continue
            if g.distance(h)<=TOL:
                by_id[ids[i]]['neighbors'].append(ids[j]); by_id[ids[j]]['neighbors'].append(ids[i]); edges+=1
    for row in by_id.values(): row['neighbors']=sorted(set(row.get('neighbors',[])))
    # Drop stale metadata for deleted region IDs and preserve feature order.
    meta['regions']=[by_id[rid] for rid in ids]
    META.write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')))
    print(f'LAND_REGIONS={len(ids)}')
    print(f'LAND_ADJACENCY_EDGES={edges}')

if __name__=='__main__': main()
