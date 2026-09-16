import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diplomaticServiceView } from '../js/ui/diplomaticServicePanel.js';
import { dispatchDiplomat, ensureDiplomaticService, setDiplomatAuthority } from '../js/diplomacy/diplomats.js';

function region(id,name){return {id,name,neighbors:[],adjacentSeaIds:[],population:10000,governance:{sovereignPolityId:id},controllingActorId:id,army:{personnel:100},diplomaticService:null};}
const a=region('a','A'); const b=region('b','B'); a.neighbors=['b']; b.neighbors=['a'];
const regions=[a,b];
ensureDiplomaticService(a); ensureDiplomaticService(b);
const aDip=a.diplomaticService.diplomats[0];
setDiplomatAuthority(a,aDip.id,'military',{maxMilitaryCommitmentFraction:0.3});
let view=diplomaticServiceView(a,regions);
assert.equal(view.own.length,1); assert.equal(view.own[0].authority,'military');
assert.equal(view.foreign.length,0);
const bDip=b.diplomaticService.diplomats[0];
const sent=dispatchDiplomat(b,a,regions,bDip.id,0); assert.equal(sent.sent,true);
bDip.status='posted'; bDip.route=null;
view=diplomaticServiceView(a,regions);
assert.equal(view.foreign.length,1); assert.equal(view.foreign[0].homeName,'B');
assert.equal('turnedByActorId' in view.foreign[0],false,'UI must not reveal hidden compromise');

const source = await readFile(new URL('../js/ui/diplomaticServicePanel.js', import.meta.url), 'utf8');
const detentionHandler = source.slice(source.indexOf("querySelectorAll('[data-dip-detain]')"), source.indexOf("querySelectorAll('[data-dip-release]')"));
assert.match(detentionHandler, /authoriseRuntimeGovernmentAction\(home,'detain_political_actor'/, 'player detention must request constitutional authority');
assert.match(detentionHandler, /if\(!authorisation\.allowed\)/, 'refused detention authority must have an explicit blocked path');
assert.ok(detentionHandler.indexOf('if(!authorisation.allowed)') < detentionHandler.indexOf('detainDiplomat('), 'authority must be checked before detention mutates diplomat state');

console.log('diplomatic service UI regressions passed');
