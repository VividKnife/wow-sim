import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRows} from '../src/collections.js';

test('grouping retains order, references and safe arbitrary catalog keys',()=>{
 const rows=[{id:1},{id:'__proto__'},{id:1},{id:'constructor'}];
 const grouped=groupRows(rows,row=>row.id);
 assert.equal(Object.getPrototypeOf(grouped),null);
 assert.deepEqual(grouped[1],[rows[0],rows[2]]);
 assert.equal(grouped.__proto__[0],rows[1]);
 assert.equal(grouped.constructor[0],rows[3]);
 const key=Symbol('key');
 assert.deepEqual(groupRows(new Set(rows),(row,index)=>index%2?key:1)[key],[rows[1],rows[3]]);
});
