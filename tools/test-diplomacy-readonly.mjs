import { attitudeToward, changeAttitude, ensureDiplomacy } from '../js/diplomacy/relations.js';
const a={id:'a'};
if (attitudeToward(a,'b') !== 0) throw new Error('neutral attitude should read as zero');
if (ensureDiplomacy(a).size !== 0) throw new Error('attitude read created a relationship entry');
changeAttitude(a,'b',0.2,'test',1);
if (ensureDiplomacy(a).size !== 1) throw new Error('real attitude change did not create relationship');
if (Math.abs(attitudeToward(a,'b')-0.2)>1e-9) throw new Error('stored attitude read failed');
console.log('diplomacy read-only regression passed');
