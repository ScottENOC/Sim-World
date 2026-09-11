from pathlib import Path
p=Path('js/diplomacy/relations.js')
s=p.read_text()
old="""export function attitudeToward(region, otherId) {
  return relationToward(region, otherId).attitude;
}
"""
new="""export function attitudeToward(region, otherId) {
  const relations = ensureDiplomacy(region);
  return relations.get(otherId)?.attitude || 0;
}
"""
assert old in s
s=s.replace(old,new,1)
old="""  for (const region of regions) {
    ensureDiplomacy(region);
    region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };
    for (const [otherId, relation] of region.relations.entries()) {
      relation.attitude *= attitudeRetention;
      const other = regionsById.get(otherId);
      if (other) {
        const bias = cultureDiplomaticBias(region, other);
        relation.attitude += (bias - relation.attitude) * cultureAdjustment;
        relation.attitude = clamp(relation.attitude, -1, 1);
      }
    }
  }
"""
new="""  for (const region of regions) {
    ensureDiplomacy(region);
    region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };
    for (const [otherId, relation] of region.relations.entries()) {
      // Older builds created neutral relationship records merely by reading an
      // attitude during trade-route evaluation. They carry no simulation state
      // and make diplomacy maintenance trend toward an all-to-all graph.
      if (!relation.lastCause && Math.abs(Number(relation.attitude) || 0) < 1e-12) {
        region.relations.delete(otherId);
        continue;
      }
      relation.attitude *= attitudeRetention;
      const other = regionsById.get(otherId);
      if (other) {
        const bias = cultureDiplomaticBias(region, other);
        relation.attitude += (bias - relation.attitude) * cultureAdjustment;
        relation.attitude = clamp(relation.attitude, -1, 1);
      }
    }
  }
"""
assert old in s
p.write_text(s.replace(old,new,1))

Path('tools/test-diplomacy-readonly.mjs').write_text("""import { attitudeToward, changeAttitude, ensureDiplomacy } from '../js/diplomacy/relations.js';
const a={id:'a'};
if (attitudeToward(a,'b') !== 0) throw new Error('neutral attitude should read as zero');
if (ensureDiplomacy(a).size !== 0) throw new Error('attitude read created a relationship entry');
changeAttitude(a,'b',0.2,'test',1);
if (ensureDiplomacy(a).size !== 1) throw new Error('real attitude change did not create relationship');
if (Math.abs(attitudeToward(a,'b')-0.2)>1e-9) throw new Error('stored attitude read failed');
console.log('diplomacy read-only regression passed');
""")
