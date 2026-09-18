import assert from 'node:assert/strict';
import {
  DREADNOUGHT_TECH_ID, MINESWEEPING_TECH_ID, NAVAL_MINES_TECH_ID, SUBMARINE_TECH_ID, TORPEDO_TECH_ID,
  ensureNavalMineState, layNavalMines, sweepNavalMines, tickLateIndustrialNavalBreakthroughs, tickLateIndustrialNavalWarfare,
} from '../js/military/lateIndustrialNavy.js';

const region=(id='home')=>({
 id,name:id,isCoastal:true,neighbors:[],tradePartnerIds:new Set(),unlockedTechIds:new Set(['steel_hull_shipbuilding','precision_machining','gunpowder','breech_loading_artillery','marine_steam_engine']),
 stockpile:{naval_mines:20,torpedoes:20,steel:100,gunpowder:100},
 industrialSupply:{capability:{precision_machining:.9,steelmaking:.9}},industrialMarine:{marineEngineering:.85},
});
const home=region();
const events=tickLateIndustrialNavalBreakthroughs([home],100,()=>0,365);
for(const id of [TORPEDO_TECH_ID,NAVAL_MINES_TECH_ID,MINESWEEPING_TECH_ID,SUBMARINE_TECH_ID,DREADNOUGHT_TECH_ID]) assert(home.unlockedTechIds.has(id),`${id} should be reachable from a mature naval-industrial base`);
assert(events.length>=5);

const sea={id:'sea-1',name:'Approaches'};
const mineFleet={id:'minelayer',ownerActorId:'A',ownerRegionId:'home',locationType:'sea',seaRegionId:'sea-1',mission:'lay_mines',ships:[{id:'d1',designId:'destroyer',condition:1}]};
let result=layNavalMines(mineFleet,sea,home,{currentTick:10,rng:()=>.5});
assert(result.laid&&ensureNavalMineState(sea)[0].density>0,'mine laying should create persistent sea-region minefield state');

const sweeperHome=region('sweeper-home');sweeperHome.unlockedTechIds.add(MINESWEEPING_TECH_ID);
const sweeper={id:'sweeper',ownerActorId:'B',ownerRegionId:'sweeper-home',locationType:'sea',seaRegionId:'sea-1',mission:'sweep_mines',ships:[{id:'d2',designId:'destroyer',condition:1}]};
const before=sea.minefields[0].density;
result=sweepNavalMines(sweeper,sea,sweeperHome,{elapsedDays:14,rng:()=>.5});
assert(result.cleared>0&&sea.minefields[0].density<before,'minesweeping should reduce an enemy minefield rather than negate it instantly');

const subHome=region('sub-home');subHome.unlockedTechIds.add(SUBMARINE_TECH_ID);subHome.unlockedTechIds.add(TORPEDO_TECH_ID);
const submarine={id:'sub-1',ownerActorId:'A',ownerRegionId:'sub-home',locationType:'sea',seaRegionId:'sea-1',mission:'submarine_patrol',ships:[{id:'s1',designId:'submarine',condition:1}]};
const target={id:'battle-1',ownerActorId:'B',ownerRegionId:'sweeper-home',locationType:'sea',seaRegionId:'sea-1',mission:'patrol',ships:[{id:'bb1',designId:'dreadnought',condition:1},{id:'dd1',designId:'destroyer',condition:1}]};
const navalEvents=tickLateIndustrialNavalWarfare([submarine,target],[subHome,sweeperHome],[sea],20,7,()=>0);
const ambush=navalEvents.find(e=>e.type==='submarine_ambush');
assert(ambush,'submarine should use its own ambush/contact system');
assert(ambush.shots>0,'submarine ambush should expend torpedoes');
assert(subHome.stockpile.torpedoes<20,'torpedoes must be finite');

console.log('late industrial navy regression passed');
