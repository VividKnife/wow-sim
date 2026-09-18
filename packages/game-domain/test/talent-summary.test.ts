import test from 'node:test';
import assert from 'node:assert/strict';
import {talentSummary} from '../src/rules/talent-summary.js';
import {classTalentTrees} from '../src/rules/catalog.js';

test('roster talent summary reflects allocated points, ties and reset',()=>{
 const [arms,fury]=classTalentTrees.filter(tree=>tree.classId===1);
 const character={classId:1,talents:{[arms.talents[0].id]:3,[fury.talents[0].id]:2}};
 assert.equal(talentSummary(character),'武器');
 character.talents[fury.talents[0].id]=3;
 assert.equal(talentSummary(character),'武器 / 狂怒');
 assert.equal(talentSummary({...character,talents:{}}),'未分配天赋');
 assert.equal(talentSummary({...character,classId:8}),'未分配天赋');
});
