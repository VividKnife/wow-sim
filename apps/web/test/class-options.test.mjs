import test from 'node:test';
import assert from 'node:assert/strict';
import {classOptions,racesForClass,classesForRace,buildCreateCommand} from '../app/class-options.js';

test('creation choices expose every Classic class and only legal races',()=>{
 assert.equal(classOptions.length,9);
 assert.deepEqual(racesForClass(2).map(r=>r.id),[1,3]);
 assert.deepEqual(racesForClass(7).map(r=>r.id),[2,6,8]);
 assert.deepEqual(racesForClass(11).map(r=>r.id),[4,6]);
 assert.deepEqual(classesForRace(6).map(c=>c.id),[1,3,7,11]);
});

test('creation command carries the selected class and race',()=>{
 assert.deepEqual(buildCreateCommand('  风行者  ',3,4),{type:'create',name:'风行者',classId:3,raceId:4});
 assert.throws(()=>buildCreateCommand('非法组合',2,8),/职业/);
});
