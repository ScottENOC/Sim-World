import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REFERENCE_ARABLE_SHARE, ensureAgriculturalLand, agriculturalLandYieldFactor,
  updateCultivatedLand, agriculturalLandSummary,
} from '../js/economy/agriculturalLand.js';
import { agriculturalWaterProfile } from '../js/economy/agriculturalWater.js';

function region({id='r',areaSqKm=1000,landQuality=1,terrain=null,pastureFraction=0,urbanShare=0,farmers=0}={}){
  return {id,areaSqKm,landQuality,terrain,forest:{currentStock:areaSqKm*(terrain?.forest||0)},horseEconomy:{pastureFraction},urbanisation:{urbanShare},occupations:{farmer:farmers},construction:{completed:{},assets:[]},report:{}};
}

const plains=region({id:'plains',terrain:{plains:.9,hills:.05,mountains:.01,forest:.03,wetland:.01},farmers:500});
const mountains=region({id:'mountains',terrain:{plains:.08,hills:.22,mountains:.62,forest:.07,wetland:.01},farmers:500});
const p=ensureAgriculturalLand(plains),m=ensureAgriculturalLand(mountains);
assert(p.potentiallyArableHa>m.potentiallyArableHa*2,'plains should support materially more potential arable land than mountains');
assert(p.potentiallyArableHa<=p.totalLandHa&&m.potentiallyArableHa<=m.totalLandHa,'arable land must be bounded by total land');

const fertile=region({landQuality:1.4,terrain:{plains:.7,hills:.15,mountains:.03,forest:.1,wetland:.02}});
const poor=region({landQuality:.55,terrain:{plains:.7,hills:.15,mountains:.03,forest:.1,wetland:.02}});
assert(ensureAgriculturalLand(fertile).potentiallyArableHa>ensureAgriculturalLand(poor).potentiallyArableHa,'soil quality should affect the marginal amount of usable land');

const legacy=region({terrain:null});
const legacyLand=ensureAgriculturalLand(legacy);
assert(Math.abs(legacyLand.arableShare-REFERENCE_ARABLE_SHARE)<1e-9,'missing terrain should retain the legacy average arable share');
assert(agriculturalLandYieldFactor(legacy)>.95,'legacy fixtures should not suffer a large food shock');

const crowded=region({terrain:{plains:.8,hills:.1,mountains:.02,forest:.06,wetland:.02},pastureFraction:.06,urbanShare:.75,farmers:2000});
const c=ensureAgriculturalLand(crowded);
assert(c.availableArableHa<c.potentiallyArableHa,'pasture and cities should compete with cropping');
updateCultivatedLand(crowded);
assert(crowded.agriculturalLand.cultivatedHa<=crowded.agriculturalLand.availableArableHa+1e-6,'cultivated hectares cannot exceed available arable hectares');
assert(crowded.agriculturalLand.cultivationShare>0&&crowded.agriculturalLand.cultivationShare<=1,'cultivation share should be bounded');

const plainWater=agriculturalWaterProfile(plains,{weatherMultiplier:1});
const mountainWater=agriculturalWaterProfile(mountains,{weatherMultiplier:1});
assert(plainWater.landYieldFactor>mountainWater.landYieldFactor,'the farming yield ceiling should now consume explicit arable-land availability');

// Whole-map sanity check: every loaded gameplay region receives a finite,
// bounded land budget from the existing terrain and resource datasets.
const meta=JSON.parse(fs.readFileSync(new URL('../data/world/regions.meta.json',import.meta.url),'utf8'));
const terrain=JSON.parse(fs.readFileSync(new URL('../data/world/terrain.initial.json',import.meta.url),'utf8'));
const resources=JSON.parse(fs.readFileSync(new URL('../data/world/resources.initial.json',import.meta.url),'utf8'));
const shares=[];
for(const row of meta.regions){
  const r=region({id:row.id,areaSqKm:row.areaSqKm,landQuality:resources[row.id]?.landQuality||1,terrain:terrain[row.id]});
  const s=agriculturalLandSummary(r);
  assert(Number.isFinite(s.potentiallyArableHa)&&s.potentiallyArableHa>=0,`${row.id} should have finite arable land`);
  assert(s.potentiallyArableHa<=s.totalLandHa+1e-6,`${row.id} arable land exceeds total land`);
  shares.push(s.arableShare);
}
shares.sort((a,b)=>a-b);
const median=shares[Math.floor(shares.length/2)];
assert(median>.20&&median<.80,`world median arable share should remain plausible, got ${median}`);
console.log(`arable land regression passed: ${shares.length} regions, median potential share ${(median*100).toFixed(1)}%`);
