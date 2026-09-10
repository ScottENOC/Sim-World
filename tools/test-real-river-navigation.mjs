import assert from 'node:assert/strict';
import { hydrateWorldSpatialGraph } from '../js/world/spatialBaseLoader.js';
import { hydrateRealRivers } from '../js/world/realRivers.js';
import { riverIceState, riverNavigationState, portNavigationProfile, seaIceNavigationState } from '../js/world/riverNavigation.js';

function square(id,x0,x1,y0,y1){return {id,name:id,centroid:[(x0+x1)/2,(y0+y1)/2],neighbors:[],feature:{type:'Feature',properties:{id},geometry:{type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]}},population:1000,construction:{assets:[]},tradeEconomy:{},settlements:{principalId:null,places:[]}};}
const a=square('A',0,1,50,51),b=square('B',1,2,50,51);a.neighbors=['B'];b.neighbors=['A'];
const base={version:1,seed:'test',anchors:[{id:'border:A|B',type:'border_crossing',lon:1,lat:50.5,regionIds:['A','B']}],rivers:[{id:'river:procedural:1',type:'river',regionIds:['A'],points:[],regionSegments:[]}]};
const graph=hydrateWorldSpatialGraph(base,[a,b]);
hydrateRealRivers(graph,{rivers:[{id:'river:real:test',name:'Test',points:[[0.2,50.4],[1.8,50.6]],navigation:{naturalCapacity:.7,baseMaxDraftM:2,baseMaxDisplacementT:500,flowVariability:.2,freezePropensity:.5,naturalShelter:.8}}]},[a,b]);
const real=graph.corridors.get('river:real:test');
assert.ok(real,'real river is hydrated');
assert.deepEqual(real.regionIds,['A','B'],'real river is associated with both crossed regions');
assert.ok(real.regionSegments.some(s=>s.regionId==='A')&&real.regionSegments.some(s=>s.regionId==='B'),'local river segments exist for each region');
assert.equal(graph.corridors.has('river:procedural:1'),false,'procedural river overlapping a real river is suppressed');

const warm={navigation:{naturalCapacity:.8,baseMaxDraftM:2.5,baseMaxDisplacementT:1000,flowVariability:.2,freezePropensity:.01}};
const icy={navigation:{naturalCapacity:.75,baseMaxDraftM:2.3,baseMaxDisplacementT:900,flowVariability:.3,freezePropensity:.55}};
const small=riverNavigationState(icy,{currentDay:0,latitude:48,weatherIndex:-1,vesselDraftM:.6,vesselDisplacementT:15});
const big=riverNavigationState(icy,{currentDay:0,latitude:48,weatherIndex:-1,vesselDraftM:4,vesselDisplacementT:2500});
assert.ok(small.vesselFit>big.vesselFit,'larger vessels are progressively less compatible with a finite river');
assert.ok(small.throughputMultiplier>big.throughputMultiplier,'oversized vessels lose river throughput rather than hitting a binary flag');
const winter=riverIceState(icy,{currentDay:0,latitude:48,weatherIndex:-1.4});
const summer=riverIceState(icy,{currentDay:182,latitude:48,weatherIndex:0});
assert.ok(winter.iceFraction>summer.iceFraction,'temperate river ice is seasonal');
assert.ok(winter.navigationMultiplier<summer.navigationMultiplier,'winter ice impedes boats');
assert.ok(winter.landCrossingMultiplier>=1,'ice never worsens land crossing through this helper');
const nileWinter=riverIceState(warm,{currentDay:0,latitude:30,weatherIndex:-1});
assert.ok(nileWinter.iceFraction<0.02,'warm low-freeze rivers remain essentially ice-free');

const earlyRiver=portNavigationProfile({kind:'river',transportTech:.05,harbourEngineering:.05,fortification:.05,navalProtection:.05,riverState:{throughputMultiplier:.8,vesselFit:1}});
const earlySea=portNavigationProfile({kind:'deep_sea',transportTech:.05,harbourEngineering:.05,fortification:.05,navalProtection:.05});
assert.ok(earlyRiver.natureRisk<earlySea.natureRisk&&earlyRiver.hostileExposure<earlySea.hostileExposure,'river ports are safer than exposed deep-sea ports early');
const lateRiver=portNavigationProfile({kind:'river',transportTech:1,harbourEngineering:1,fortification:1,navalProtection:1,riverState:{throughputMultiplier:.65,vesselFit:.55}});
const lateSea=portNavigationProfile({kind:'deep_sea',transportTech:1,harbourEngineering:1,fortification:1,navalProtection:1});
assert.ok(lateSea.capacity>lateRiver.capacity,'deep-sea port capacity can overtake constrained river ports late');
assert.ok(lateSea.natureRisk<earlySea.natureRisk&&lateSea.hostileExposure<earlySea.hostileExposure,'engineering and naval capability reduce deep-sea port disadvantages');

const fringe=seaIceNavigationState({routeIceExposure:0,seasonalIce:1,iceCapability:0});
assert.equal(fringe.navigationMultiplier,1,'ice elsewhere in a sea region does not obstruct an ice-free route corridor');
const routed=seaIceNavigationState({routeIceExposure:.8,seasonalIce:.9,iceCapability:0});
assert.ok(routed.navigationMultiplier<1,'sea ice matters when the traversed corridor is actually exposed');

console.log('real river navigation regressions passed');
