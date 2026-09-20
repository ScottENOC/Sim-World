import assert from 'node:assert/strict';
import { militaryAssistancePanelModel } from '../js/ui/militaryAssistanceUi.js';

function region(id, polityId, neighbours=[]){
  return {id,name:id,neighbors:neighbours,adjacentSeaIds:[],governance:{sovereignPolityId:polityId},stockpile:{},treasury:0,militaryEquipment:{designs:[],inventoryByDesign:{},nextDesignSequence:{}},army:{personnel:1000}};
}

const a=region('a','A',['b']);
const b=region('b','B',['a']);
a.treasury=500;
a.stockpile.firearms=120;
a.stockpile.diesel=80;
a.militaryEquipment.designs.push({id:'a:tank:1',name:'Tank Mk I',family:'tank',stats:{mobility:.5,protection:.5,firepower:.5,reliability:.5}});
a.militaryEquipment.inventoryByDesign['a:tank:1']=24;
const A={id:'A',name:'Alpha',capitalRegionId:'a'};
const B={id:'B',name:'Beta',capitalRegionId:'b'};

const model=militaryAssistancePanelModel(A,{regions:[a,b],polities:[A,B],visiblePolityIds:['A','B']});
assert.equal(model.treasury,500);
assert.equal(model.recipients.length,1);
assert.equal(model.recipients[0].id,'B');
assert.equal(model.recipients[0].route.mode,'land');
assert.equal(model.recipients[0].route.travelWeeks,1);
assert.equal(model.supplies.find(x=>x.key==='firearms')?.quantity,120);
assert.equal(model.supplies.find(x=>x.key==='diesel')?.quantity,80);
assert.equal(model.equipment.length,1);
assert.equal(model.equipment[0].id,'a:tank:1');
assert.equal(model.equipment[0].quantity,24);
assert.equal(model.programmes.length,0);
assert.equal(model.shipments.length,0);

const hidden=militaryAssistancePanelModel(A,{regions:[a,b],polities:[A,B],visiblePolityIds:['A']});
assert.equal(hidden.recipients.length,0,'unknown polities must not appear in the player recipient picker');
console.log('military assistance UI model regression passed');
