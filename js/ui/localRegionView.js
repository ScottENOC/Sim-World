import { spatialFeaturesForRegion, syncRegionSpatialSites } from '../world/spatialGraph.js?v=20260913-infrastructure1';
import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260908-subregion1';

const MODES = Object.freeze(['overview','economy','control','military']);

function actor(region){return region?.governance?.sovereignPolityId||region?.controllingActorId||region?.id;}
function boundsFor(region){
  const g=region?.feature?.geometry; const pts=[];
  const walk=(x)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number')pts.push(x);else x.forEach(walk);}; walk(g?.coordinates||[]);
  if(!pts.length){const c=region?.centroid||[0,0];return [[c[0]-.5,c[1]-.5],[c[0]+.5,c[1]+.5]];}
  return [[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]];
}

function corridorSegmentsForRegion(corridor, regionId){
  if(corridor.type==='river') return (corridor.regionSegments||[]).filter(s=>s.regionId===regionId).map(s=>[s.from,s.to]);
  if(corridor.type==='land_route'){
    const i=corridor.regionIds?.indexOf(regionId); if(i===0)return [[corridor.points[0],corridor.points[1]]]; if(i===1)return [[corridor.points[1],corridor.points[2]]];
  }
  if(corridor.type==='infrastructure_route' && corridor.regionIds?.includes(regionId)){
    return (corridor.points||[]).slice(1).map((p,i)=>[corridor.points[i],p]);
  }
  return [];
}

export function buildLocalRegionScene(graph, region, { campaigns=[], fleets=[] }={}){
  const control=ensureSubregionalControl(region);
  syncRegionSpatialSites(graph,region,control.places);
  const features=spatialFeaturesForRegion(graph,region.id);
  const controlById=new Map(control.places.map(p=>[p.id,p]));
  const sites=features.sites.map(site=>{
    const p=controlById.get(site.sourcePlaceId||site.id);
    return {...site,controllerActorId:p?.controllerActorId||site.controllerActorId||actor(region),occupationMode:p?.occupationMode||'sovereign',
      garrisonActorId:p?.garrisonActorId||null,garrisonPersonnel:p?.garrisonPersonnel||0};
  });
  const corridors=features.corridors.map(c=>({...c,segments:corridorSegmentsForRegion(c,region.id)})).filter(c=>c.segments.length);
  const armies=campaigns.filter(c=>!c.completed&&c.defenderId===region.id&&c.subregional?.currentNodeId).map(c=>{
    const site=sites.find(s=>s.id===c.subregional.currentNodeId);return site?{campaignId:c.id,actorId:c.occupationActorId,lon:site.lon,lat:site.lat,personnel:c.personnel||c.committedPersonnel||0}:null;
  }).filter(Boolean);
  const localFleets=fleets.filter(f=>f.regionId===region.id||f.homeRegionId===region.id&&['docked','in_port'].includes(f.status)).map(f=>({id:f.id,name:f.name||'Fleet',status:f.status,boats:f.boats||f.ships?.length||0}));
  return {regionId:region.id,name:region.name,bounds:boundsFor(region),polygon:region.feature?.geometry||null,sites,corridors,anchors:features.anchors,
    ruralControl:{...(control.ruralControl||{})},sovereignActorId:control.sovereignActorId,operationalControllerActorId:control.operationalControllerActorId,
    contested:control.contested,armies,fleets:localFleets};
}

function esc(x=''){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function siteLabel(s){return (s.type||'site').replaceAll('_',' ');}

export class LocalRegionView{
  constructor({graph,regions,getCampaigns=()=>[],getFleets=()=>[]}={}){
    this.graph=graph;this.regions=regions;this.getCampaigns=getCampaigns;this.getFleets=getFleets;this.mode='overview';this.region=null;this.scene=null;this.selectedSiteId=null;
    this.root=document.getElementById('local-region-view');this.canvas=document.getElementById('local-region-canvas');this.ctx=this.canvas?.getContext('2d');
    this.title=document.getElementById('local-region-title');this.detail=document.getElementById('local-region-detail');
    document.getElementById('btn-close-local-region')?.addEventListener('click',()=>this.close());
    this.root?.querySelectorAll('[data-local-mode]').forEach(b=>b.addEventListener('click',()=>this.setMode(b.dataset.localMode)));
    this.canvas?.addEventListener('click',e=>this._tap(e)); window.addEventListener('resize',()=>{if(this.region)this.draw();});
  }
  open(region){this.region=region;this.selectedSiteId=null;this.root?.classList.remove('hidden');this.refresh();}
  close(){this.root?.classList.add('hidden');this.region=null;this.scene=null;}
  setMode(mode){if(!MODES.includes(mode))return;this.mode=mode;this.root?.querySelectorAll('[data-local-mode]').forEach(b=>b.classList.toggle('active',b.dataset.localMode===mode));this.draw();}
  refresh(){if(!this.region)return;this.scene=buildLocalRegionScene(this.graph,this.region,{campaigns:this.getCampaigns(),fleets:this.getFleets()});if(this.title)this.title.textContent=this.region.name;this.draw();}
  _resize(){if(!this.canvas)return;const dpr=window.devicePixelRatio||1;const rect=this.canvas.getBoundingClientRect();this.w=Math.max(1,rect.width);this.h=Math.max(1,rect.height);const W=Math.round(this.w*dpr),H=Math.round(this.h*dpr);if(this.canvas.width!==W||this.canvas.height!==H){this.canvas.width=W;this.canvas.height=H;}this.ctx.setTransform(dpr,0,0,dpr,0,0);}
  _project(point){const [[x0,y0],[x1,y1]]=this.scene.bounds;const pad=24;const sx=(this.w-pad*2)/Math.max(.00001,x1-x0),sy=(this.h-pad*2)/Math.max(.00001,y1-y0);const s=Math.min(sx,sy);return [this.w/2+(point[0]-(x0+x1)/2)*s,this.h/2- (point[1]-(y0+y1)/2)*s];}
  _drawGeometry(geometry){const ctx=this.ctx;const drawRing=(ring)=>{ring.forEach((p,i)=>{const q=this._project(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});};
    if(!geometry)return;if(geometry.type==='Polygon')geometry.coordinates.forEach(drawRing);else if(geometry.type==='MultiPolygon')geometry.coordinates.flat().forEach(drawRing);
  }
  draw(){if(!this.scene||!this.ctx)return;this._resize();const ctx=this.ctx;ctx.clearRect(0,0,this.w,this.h);ctx.fillStyle='#10141c';ctx.fillRect(0,0,this.w,this.h);
    ctx.beginPath();this._drawGeometry(this.scene.polygon);ctx.fillStyle='#3a4a3e';ctx.fill();ctx.strokeStyle='#83927b';ctx.lineWidth=1.5;ctx.stroke();
    for(const c of this.scene.corridors){if(this.mode==='economy'&&c.type==='river'||this.mode!=='control'){}for(const seg of c.segments){const a=this._project(seg[0]),b=this._project(seg[1]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);const infra=c.type==='infrastructure_route';ctx.strokeStyle=c.type==='river'?'#4d7890':infra?'#b29b72':'#9c835e';ctx.lineWidth=c.type==='river'?Math.max(2,4*(c.strength||.5)):infra?1.5+2.5*(c.quality||.2):1+3*(c.quality||.2);ctx.setLineDash(infra&&['irrigation','aqueduct','relay_stations'].includes(c.infrastructureType)?[5,4]:[]);ctx.globalAlpha=this.mode==='control'?.25:.8;ctx.stroke();ctx.setLineDash([]);}}
    ctx.globalAlpha=1;
    const showSite=(s)=>this.mode==='overview'||this.mode==='control'||this.mode==='military'&&(['fort','fortification','port','harbour','naval_base','city','principal_settlement','town','village','ruins'].includes(s.type)||s.garrisonPersonnel>0)||this.mode==='economy'&&(['mine','industrial_site','infrastructure','port','harbour','shipyard','naval_base','principal_settlement','village','town','city','ruins','great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type));
    for(const s of this.scene.sites.filter(showSite)){const [x,y]=this._project([s.lon,s.lat]);let r=['city','principal_settlement'].includes(s.type)?7:s.type==='town'?6:s.type==='port'?6:s.type==='mine'?5:s.type==='ruins'?3:4;
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=['mine','industrial_site'].includes(s.type)?'#80746b':['port','harbour','shipyard','naval_base'].includes(s.type)?'#6f9fb2':['great_temple','monumental_tomb','ceremonial_complex','monumental_statue'].includes(s.type)?'#d4c7a4':s.type==='fortification'?'#9d8268':'#d1b987';ctx.fill();
      if(this.mode==='control'){ctx.lineWidth=3;ctx.strokeStyle=s.controllerActorId===this.scene.sovereignActorId?'#8fa66e':'#c94f43';ctx.stroke();}
      if(s.id===this.selectedSiteId){ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.strokeStyle='#c08a4e';ctx.lineWidth=2;ctx.stroke();}
      ctx.fillStyle='#e8e1cf';ctx.font='11px -apple-system, sans-serif';ctx.fillText(s.name||siteLabel(s),x+r+4,y+3);
    }
    if(this.mode==='military')for(const a of this.scene.armies){const [x,y]=this._project([a.lon,a.lat]);ctx.fillStyle='#c94f43';ctx.fillRect(x-6,y-14,12,8);ctx.fillStyle='#e8e1cf';ctx.fillText(`${a.actorId} army`,x+9,y-7);}
    this._renderDetail();
  }
  _tap(event){if(!this.scene)return;const rect=this.canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;let best=null,dist=18;for(const s of this.scene.sites){const p=this._project([s.lon,s.lat]);const d=Math.hypot(p[0]-x,p[1]-y);if(d<dist){dist=d;best=s;}}this.selectedSiteId=best?.id||null;this.draw();}
  _renderDetail(){if(!this.detail||!this.scene)return;const s=this.scene.sites.find(x=>x.id===this.selectedSiteId);if(s){this.detail.innerHTML=`<strong>${esc(s.name)}</strong><span>${esc(siteLabel(s))}</span>${s.infrastructureType?`<span>${esc(s.infrastructureType.replaceAll('_',' '))}</span>`:''}${Number.isFinite(s.condition)?`<span>Condition: ${Math.round(s.condition*100)}%</span>`:''}${s.resource?`<span>Resource: ${esc(s.resource)}</span>`:''}${s.controllerActorId?`<span>Controlled by: ${esc(s.controllerActorId)}</span>`:''}${s.garrisonPersonnel?`<span>Garrison: ${Math.round(s.garrisonPersonnel).toLocaleString()}</span>`:''}`;return;}
    const rivers=this.scene.corridors.filter(c=>c.type==='river').length,routes=this.scene.corridors.filter(c=>c.type==='land_route').length;
    this.detail.innerHTML=`<strong>${esc(this.scene.name)}</strong><span>${rivers} major river system${rivers===1?'':'s'} · ${routes} cross-border route${routes===1?'':'s'}</span><span>${this.scene.contested?'Control is contested.':`Operational control: ${esc(this.scene.operationalControllerActorId||this.scene.sovereignActorId)}`}</span>`;}
}

export function createLocalRegionView(options){return new LocalRegionView(options);}
