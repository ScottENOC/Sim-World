#!/usr/bin/env python3
"""Audit the checked-in world map for ocean voids and suspicious land regions."""
from __future__ import annotations
import json, urllib.request
from pathlib import Path
from pyproj import Geod
from shapely.geometry import box, shape
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
LAND=ROOT/'data/world/regions.geo.json'; SEA=ROOT/'data/world/seaRegions.geo.json'; NAV=ROOT/'data/world/region-navigation.json'
OCEAN_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_ocean.geojson'
ADMIN0_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_iso.geojson'
GEOD=Geod(ellps='WGS84')

def fetch_json(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Sim-World world-map-audit/1.1'})
    with urllib.request.urlopen(req,timeout=120) as resp:return json.load(resp)
def area_sqkm(g):
    if g.is_empty:return 0.0
    a,_=GEOD.geometry_area_perimeter(g);return abs(a)/1_000_000.0
def fid(f):return str((f.get('properties') or {}).get('id') or '')
def fname(f):
    p=f.get('properties') or {};return str(p.get('name') or p.get('NAME') or p.get('id') or '?')
def geom_parts(g):return list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
def region_diag(f,nav):
    g=shape(f['geometry']); ps=sorted(geom_parts(g),key=area_sqkm,reverse=True); total=max(area_sqkm(g),1.0)
    return {'id':fid(f),'name':fname(f),'geometryType':g.geom_type,'components':len(ps),'areaSqKm':round(area_sqkm(g)),
      'largestComponentSqKm':round(area_sqkm(ps[0])) if ps else 0,'largestComponentFraction':round(area_sqkm(ps[0])/total,4) if ps else 0,
      'componentCentres':[[round(p.representative_point().x,2),round(p.representative_point().y,2)] for p in ps[:12]],
      'bounds':[round(x,2) for x in g.bounds],'navigation':nav.get('regions',{}).get(fid(f),[]),'properties':f.get('properties') or {}}

def main():
    land=json.loads(LAND.read_text()); sea=json.loads(SEA.read_text()); nav=json.loads(NAV.read_text()) if NAV.exists() else {'regions':{}}
    lf=land.get('features',[]); sf=sea.get('features',[]); byid={fid(f):f for f in lf}
    print(f'LAND_REGIONS={len(lf)}');print(f'SEA_REGIONS={len(sf)}')
    rows=sorted([(area_sqkm(shape(f['geometry'])),fid(f),fname(f),shape(f['geometry']).bounds,nav.get('regions',{}).get(fid(f),[])) for f in lf],reverse=True)
    print('LARGEST_LAND_REGIONS')
    for a,r,n,b,m in rows[:25]:print(json.dumps({'id':r,'name':n,'areaSqKm':round(a),'bounds':[round(x,2) for x in b],'navigation':m},ensure_ascii=False))
    print('SUSPECT_COMPONENT_STRUCTURE')
    if 'r2_81f83805b72' in byid:print(json.dumps(region_diag(byid['r2_81f83805b72'],nav),ensure_ascii=False,default=str))
    for f in lf:
        if 'Sermersooq' in fname(f):print(json.dumps(region_diag(f,nav),ensure_ascii=False,default=str))

    admin0=fetch_json(ADMIN0_URL); cg={}
    for f in admin0.get('features',[]):
        p=f.get('properties') or {}; n=str(p.get('NAME_EN') or p.get('ADMIN') or p.get('NAME') or '')
        if n in {'Germany','Russia','Russian Federation'}:cg[n]=shape(f['geometry'])
    germany=cg.get('Germany'); russia=cg.get('Russia') or cg.get('Russian Federation')
    if germany is not None:
        print('GERMANY_INTERSECTING_REGIONS'); gr=[]
        for a,r,n,b,m in rows:
            g=shape(byid[r]['geometry']); ga=area_sqkm(g.intersection(germany))
            if ga<10:continue
            ra=area_sqkm(g.intersection(russia)) if russia is not None else 0
            gr.append((ga,{'id':r,'name':n,'regionAreaSqKm':round(a),'germanyOverlapSqKm':round(ga),'russiaOverlapSqKm':round(ra),'bounds':[round(x,2) for x in b],'navigation':m}))
        for _,row in sorted(gr,reverse=True):print(json.dumps(row,ensure_ascii=False))

    ocean_doc=fetch_json(OCEAN_URL); ocean=unary_union([shape(f['geometry']) for f in ocean_doc.get('features',[])]).intersection(box(-180,-60,180,85))
    sea_union=unary_union([shape(f['geometry']) for f in sf]) if sf else unary_union([]); uncovered=ocean.difference(sea_union)
    comps=list(uncovered.geoms) if hasattr(uncovered,'geoms') else [uncovered]; voids=[]
    for g in comps:
        a=area_sqkm(g)
        if a<25_000:continue
        c=g.representative_point();voids.append((a,{'areaSqKm':round(a),'representativeLonLat':[round(c.x,2),round(c.y,2)],'bounds':[round(x,2) for x in g.bounds]}))
    voids.sort(reverse=True);print(f'LARGE_OCEAN_VOIDS={len(voids)}');print('LARGEST_OCEAN_VOIDS')
    for _,row in voids[:40]:print(json.dumps(row))
if __name__=='__main__':main()
