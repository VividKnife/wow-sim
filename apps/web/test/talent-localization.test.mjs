import test from 'node:test';
import assert from 'node:assert/strict';
import {talents} from '../../../packages/game-domain/src/rules/catalog.js';

test('every talent name and every rank description is localized in Simplified Chinese',()=>{
  const rows=Object.values(talents);
  assert.equal(rows.length,432);
  assert.ok(rows.every(talent=>talent.nameZhCN), 'all talent names must be localized');
  const effects=rows.flatMap(talent=>talent.rankEffects);
  assert.equal(effects.length,1357);
  assert.ok(effects.every(effect=>effect.descriptionZhCN), 'all talent rank descriptions must be localized');
  assert.deepEqual(effects.filter(effect=>/[A-Za-z]{4}/.test(effect.descriptionZhCN)),[]);
  const namesByClass=Object.groupBy(rows,talent=>talent.classId);
  for(const [classId,classTalents] of Object.entries(namesByClass)){
    assert.equal(new Set(classTalents.map(talent=>talent.nameZhCN)).size,classTalents.length,`class ${classId} has duplicate localized talent names`);
  }
  assert.equal(rows.find(talent=>talent.classId===4&&talent.name==='Camouflage').nameZhCN,'伪装');
  assert.equal(rows.find(talent=>talent.classId===9&&talent.name==='Devastation').nameZhCN,'破坏');
});

test('Shield Specialization exposes the correct localized text for each rank',()=>{
  const talent=Object.values(talents).find(row=>row.classId===1&&row.name==='Shield Specialization');
  assert.ok(talent);
  assert.equal(talent.rankEffects[0].descriptionZhCN,'使你用盾牌格挡攻击的几率提高1%，在成功格挡后有20%的几率得到1点怒气。');
  assert.equal(talent.rankEffects[1].descriptionZhCN,'使你用盾牌格挡攻击的几率提高2%，在成功格挡后有40%的几率得到1点怒气。');
});
