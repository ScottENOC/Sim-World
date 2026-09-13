from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor not found in {path}: {old[:120]}')
    p.write_text(text.replace(old, new, 1))


replace_once(
    'js/world/spatialGraph.js',
    "// Persistent shared geography for regional zoom and subregional movement.\n",
    "import { syncInfrastructureSpatialSites } from './infrastructureSites.js?v=20260913-infrastructure1';\n\n// Persistent shared geography for regional zoom and subregional movement.\n"
)

old_monuments = """  (region.construction?.assets||[]).filter(a=>['monumental_tomb','great_temple','ceremonial_complex','monumental_statue'].includes(a.typeId)).forEach((asset,i)=>{\n    const id=`${region.id}:monument:${asset.id||i}`;const old=graph.sites.get(id);const point=old?[old.lon,old.lat]:sitePoint(region,id,anchors);\n    const site={id,type:asset.typeId,name:asset.name||asset.typeId.replaceAll('_',' '),lon:point[0],lat:point[1],regionId:region.id,persistent:true,condition:asset.condition??1,scale:asset.scale||1};\n    graph.sites.set(id,site);graph.regionIndex.get(region.id).siteIds.add(id);used.push(site);\n  });\n  return used;"""
new_monuments = """  const infrastructure=syncInfrastructureSpatialSites(graph,region);\n  used.push(...infrastructure.sites);\n  return used;"""
replace_once('js/world/spatialGraph.js', old_monuments, new_monuments)

replace_once(
    'js/ui/localRegionView.js',
    "import { spatialFeaturesForRegion, syncRegionSpatialSites } from '../world/spatialGraph.js?v=20260910-spatial1';",
    "import { spatialFeaturesForRegion, syncRegionSpatialSites } from '../world/spatialGraph.js?v=20260913-infrastructure1';"
)

replace_once(
    'js/ui/localRegionView.js',
    "  if(corridor.type==='land_route'){\n    const i=corridor.regionIds?.indexOf(regionId); if(i===0)return [[corridor.points[0],corridor.points[1]]]; if(i===1)return [[corridor.points[1],corridor.points[2]]];\n  }\n  return [];",
    "  if(corridor.type==='land_route'){\n    const i=corridor.regionIds?.indexOf(regionId); if(i===0)return [[corridor.points[0],corridor.points[1]]]; if(i===1)return [[corridor.points[1],corridor.points[2]]];\n  }\n  if(corridor.type==='infrastructure_route' && corridor.regionIds?.includes(regionId)){\n    return (corridor.points||[]).slice(1).map((p,i)=>[corridor.points[i],p]);\n  }\n  return [];"
)

replace_once(
    'js/ui/localRegionView.js',
    "for(const seg of c.segments){const a=this._project(seg[0]),b=this._project(seg[1]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=c.type==='river'?'#4d7890':'#9c835e';ctx.lineWidth=c.type==='river'?Math.max(2,4*(c.strength||.5)):1+3*(c.quality||.2);ctx.globalAlpha=this.mode==='control'?.25:.8;ctx.stroke();}",
    "for(const seg of c.segments){const a=this._project(seg[0]),b=this._project(seg[1]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);const infra=c.type==='infrastructure_route';ctx.strokeStyle=c.type==='river'?'#4d7890':infra?'#b29b72':'#9c835e';ctx.lineWidth=c.type==='river'?Math.max(2,4*(c.strength||.5)):infra?1.5+2.5*(c.quality||.2):1+3*(c.quality||.2);ctx.setLineDash(infra&&['irrigation','aqueduct','relay_stations'].includes(c.infrastructureType)?[5,4]:[]);ctx.globalAlpha=this.mode==='control'?.25:.8;ctx.stroke();ctx.setLineDash([]);}")

replace_once(
    'js/ui/localRegionView.js',
    "const showSite=(s)=>this.mode==='overview'||this.mode==='control'||this.mode==='military'&&(['fort','port','city','principal_settlement','town','village','ruins'].includes(s.type)||s.garrisonPersonnel>0)||this.mode==='economy'&&(['mine','port','principal_settlement','village','town','city','ruins','great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type));",
    "const showSite=(s)=>this.mode==='overview'||this.mode==='control'||this.mode==='military'&&(['fort','fortification','port','harbour','naval_base','city','principal_settlement','town','village','ruins'].includes(s.type)||s.garrisonPersonnel>0)||this.mode==='economy'&&(['mine','industrial_site','infrastructure','port','harbour','shipyard','naval_base','principal_settlement','village','town','city','ruins','great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type));"
)

replace_once(
    'js/ui/localRegionView.js',
    "ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=s.type==='mine'?'#80746b':s.type==='port'?'#6f9fb2':['great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type)?'#d4c7a4':'#d1b987';ctx.fill();",
    "ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=['mine','industrial_site'].includes(s.type)?'#80746b':['port','harbour','shipyard','naval_base'].includes(s.type)?'#6f9fb2':['great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type)?'#d4c7a4':s.type==='fortification'?'#9d8268':'#d1b987';ctx.fill();"
)

replace_once(
    'js/ui/localRegionView.js',
    "${s.resource?`<span>Resource: ${esc(s.resource)}</span>`:''}${s.controllerActorId?`<span>Controlled by: ${esc(s.controllerActorId)}</span>`:''}",
    "${s.infrastructureType?`<span>${esc(s.infrastructureType.replaceAll('_',' '))}</span>`:''}${Number.isFinite(s.condition)?`<span>Condition: ${Math.round(s.condition*100)}%</span>`:''}${s.resource?`<span>Resource: ${esc(s.resource)}</span>`:''}${s.controllerActorId?`<span>Controlled by: ${esc(s.controllerActorId)}</span>`:''}"
)

print('Applied persistent infrastructure spatial integration')
