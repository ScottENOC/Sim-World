#!/usr/bin/env python3
"""Conservatively reassign tiny detached mainland scraps without changing footprint.

Only genuinely small detached atoms may move between regions. Earlier versions
allowed any non-core component to transfer to a touching foreign core; during
whole-world reconstruction that could drain substantial components from existing
European regions into a tiny new-region owner (the Kaliningrad/Germany failure).
Large components therefore stay with their original region even if another core
touches them. Genuine islands remain untouched as before.
"""
from __future__ import annotations
import argparse,json
from pathlib import Path
from pyproj import Geod
from shapely.geometry import MultiPolygon,mapping,shape
from shapely.ops import unary_union
from shapely.strtree import STRtree
GEOD=Geod(ellps='WGS84'); SEAM_TOL_DEG=0.003; ADJ_TOL_DEG=0.025; CONSERVATION_TOL=1e-10
MAX_TRANSFER_AREA_KM2=2500.0; MAX_TRANSFER_CORE_FRACTION=0.10

def repair(g): return g if g.is_empty or g.is_valid else g.buffer(0)
def polygons(g):
    if g.is_empty:return
    if g.geom_type=='Polygon':yield g
    elif hasattr(g,'geoms'):
        for c in g.geoms:yield from polygons(c)
def geod_area_km2(g):
    if g.is_empty:return 0.0
    a,_=GEOD.geometry_area_perimeter(g);return abs(a)/1_000_000.0
def parts_by_area(g):return sorted((repair(p) for p in polygons(g) if not p.is_empty),key=geod_area_km2,reverse=True)
def combine(parts):
    ps=[p for p in parts if not p.is_empty]
    if not ps:return MultiPolygon([])
    return repair(ps[0] if len(ps)==1 else unary_union(ps))
def total_area(gs):return sum(geod_area_km2(g) for g in gs)
def global_union(gs):
    ps=[g for g in gs if not g.is_empty];return repair(unary_union(ps)) if ps else MultiPolygon([])
def shared_boundary_length(a,b):
    try:i=a.boundary.intersection(b.boundary)
    except Exception:return 0.0
    if i is None or getattr(i,'is_empty',True):return 0.0
    return float(getattr(i,'length',0.0) or 0.0)
def transferable(part,own_core):
    area=geod_area_km2(part); core=max(geod_area_km2(own_core),1.0)
    return area<=MAX_TRANSFER_AREA_KM2 and area/core<=MAX_TRANSFER_CORE_FRACTION

def assign_atoms(geoms,ids):
    cache=[parts_by_area(g) for g in geoms]; cores=[p[0] if p else MultiPolygon([]) for p in cache]
    tree=STRtree(cores); core_areas=[geod_area_km2(c) for c in cores]; owned=[[] for _ in geoms]; moved=0; protected=0
    for oi,ps in enumerate(cache):
        if not ps:raise RuntimeError(f'ownership repair found empty region {ids[oi]}')
        owned[oi].append(ps[0]); own=cores[oi]
        for part in ps[1:]:
            if part.distance(own)<=SEAM_TOL_DEG:
                owned[oi].append(part);continue
            if not transferable(part,own):
                owned[oi].append(part);protected+=1;continue
            best=None
            for raw in tree.query(part.buffer(SEAM_TOL_DEG)):
                idx=int(raw)
                if idx==oi or cores[idx].is_empty:continue
                d=part.distance(cores[idx])
                if d>SEAM_TOL_DEG:continue
                shared=shared_boundary_length(part,cores[idx]) if d<=1e-7 else 0.0
                score=(1 if shared>1e-8 else 0,shared,-d,core_areas[idx],ids[idx])
                if best is None or score>best[0]:best=(score,idx)
            if best is None:owned[oi].append(part)
            else:owned[best[1]].append(part);moved+=1
    rebuilt=[]
    for idx,ps in enumerate(owned):
        if not ps:raise RuntimeError(f'ownership repair would empty region {ids[idx]}')
        rebuilt.append(combine(ps))
    assign_atoms.last_protected_count=protected
    return rebuilt,moved
assign_atoms.last_protected_count=0

def transfer_pass(geoms,ids):return assign_atoms(geoms,ids)
def conservation_fraction(before,after):
    b=global_union(before);a=global_union(after);base=max(1.0,geod_area_km2(b));return geod_area_km2(repair(b.symmetric_difference(a)))/base

def rebuild_meta(features,geoms,meta_doc):
    by={m['id']:m for m in meta_doc.get('regions',[])};ids=[f['properties']['id'] for f in features]
    for feature,g in zip(features,geoms):
        rid=feature['properties']['id'];feature['geometry']=mapping(g);m=by.get(rid)
        if m is None:m={'id':rid,'name':feature['properties'].get('name',rid)};meta_doc.setdefault('regions',[]).append(m);by[rid]=m
        p=g.representative_point();m['centroid']=[p.x,p.y];m['areaSqKm']=geod_area_km2(g);m['neighbors']=[]
    tree=STRtree(geoms)
    for i,g in enumerate(geoms):
        minx,miny,maxx,maxy=g.bounds
        for raw in tree.query(g.buffer(ADJ_TOL_DEG)):
            j=int(raw)
            if j<=i:continue
            o=geoms[j];ominx,ominy,omaxx,omaxy=o.bounds
            if omaxx<minx-ADJ_TOL_DEG or ominx>maxx+ADJ_TOL_DEG or omaxy<miny-ADJ_TOL_DEG or ominy>maxy+ADJ_TOL_DEG:continue
            if g.distance(o)<=ADJ_TOL_DEG:by[ids[i]]['neighbors'].append(ids[j]);by[ids[j]]['neighbors'].append(ids[i])
    for m in meta_doc.get('regions',[]):m['neighbors']=sorted(set(m.get('neighbors',[])))

def main():
    p=argparse.ArgumentParser();p.add_argument('--geo',default='data/world/regions.geo.json');p.add_argument('--meta',default='data/world/regions.meta.json');p.add_argument('--output-geo');p.add_argument('--output-meta');a=p.parse_args()
    gp=Path(a.geo);mp=Path(a.meta);geo=json.loads(gp.read_text());meta=json.loads(mp.read_text());features=geo.get('features',[]);ids=[f['properties']['id'] for f in features]
    before=[repair(shape(f['geometry'])) for f in features];before_area=total_area(before);before_parts=sum(len(parts_by_area(g)) for g in before)
    geoms,moved=assign_atoms(before,ids);print(f'OWNERSHIP_ATOM_PASS MOVED_COMPONENTS={moved} PROTECTED_SUBSTANTIAL_COMPONENTS={assign_atoms.last_protected_count}')
    change=conservation_fraction(before,geoms)
    if change>CONSERVATION_TOL:raise RuntimeError(f'ownership repair changed global land footprint fraction={change:.3e}')
    rebuild_meta(features,geoms,meta);after_area=total_area(geoms);after_parts=sum(len(parts_by_area(g)) for g in geoms)
    Path(a.output_geo or a.geo).write_text(json.dumps(geo,ensure_ascii=False,separators=(',',':')));Path(a.output_meta or a.meta).write_text(json.dumps(meta,ensure_ascii=False,separators=(',',':')))
    print(f'REGIONS={len(features)}');print(f'MOVED_COMPONENTS_TOTAL={moved}');print(f'POLYGON_PARTS_BEFORE={before_parts}');print(f'POLYGON_PARTS_AFTER={after_parts}');print(f'LAND_AREA_SUM_BEFORE_KM2={before_area:.3f}');print(f'LAND_AREA_SUM_AFTER_KM2={after_area:.3f}');print(f'GLOBAL_FOOTPRINT_CHANGE_FRACTION={change:.3e}')
if __name__=='__main__':main()
