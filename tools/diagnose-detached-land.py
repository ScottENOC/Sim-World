#!/usr/bin/env python3
"""Diagnose grossly detached components in the checked-in land map.

This is intentionally conservative: it does not mutate geography. It reports
substantial polygon components, their separation from the feature's largest
component, and the modern Natural Earth country with the greatest overlap.
Modern borders are diagnostic evidence only, not intended simulation borders.
"""
from __future__ import annotations
import json, urllib.request
from pathlib import Path
from pyproj import Geod
from shapely.geometry import shape

ROOT=Path(__file__).resolve().parents[1]
GEO=ROOT/'data/world/regions.geo.json'
ADMIN0='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD=Geod(ellps='WGS84')
FOCUS=('Kaliningrad','Sermersooq')


def area(g):
    if g.is_empty:return 0.0
    a,_=GEOD.geometry_area_perimeter(g)
    return abs(a)/1_000_000


def polygons(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    out=[]
    if hasattr(g,'geoms'):
        for c in g.geoms: out.extend(polygons(c))
    return out


def codes(f):
    p=f.get('properties') or {}
    return str(p.get('ADM0_A3') or p.get('adm0_a3') or p.get('ISO_A3') or p.get('iso_a3') or '?')


def main():
    geo=json.loads(GEO.read_text())
    req=urllib.request.Request(ADMIN0,headers={'User-Agent':'Sim-World detached land audit/1.0'})
    with urllib.request.urlopen(req,timeout=120) as r: admin=json.load(r)
    countries=[(codes(f),shape(f['geometry'])) for f in admin['features']]
    for f in geo['features']:
        p=f.get('properties') or {}; name=str(p.get('name') or '')
        if not any(x in name for x in FOCUS): continue
        g=shape(f['geometry']); parts=sorted(polygons(g),key=area,reverse=True)
        print(f"REGION id={p.get('id')} name={name!r} area={area(g):.1f} parts={len(parts)} bounds={tuple(round(x,3) for x in g.bounds)}")
        core=parts[0] if parts else g
        for i,part in enumerate(parts[:40]):
            a=area(part)
            if i>0 and a<1: continue
            best=('?',0.0)
            for iso,country in countries:
                if not part.intersects(country): continue
                ov=area(part.intersection(country))
                if ov>best[1]: best=(iso,ov)
            print(f"  PART {i:02d} area={a:.1f} distCoreDeg={part.distance(core):.3f} country={best[0]} overlap={best[1]:.1f} bounds={tuple(round(x,3) for x in part.bounds)}")

if __name__=='__main__': main()
