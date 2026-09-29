import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as source from '../../../scripts/content-source/catalog.mjs';
import * as runtime from '../src/rules/catalog.js';
import {runtime as compiled} from '../src/rules/runtime-content.js';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('compiled tables and public catalog values preserve source merge order and content',()=>{
 for(const name of Object.keys(compiled.tables))assert.equal(digest(runtime.table(name)),digest(source.table(name)),name);
 for(const [name,value]of Object.entries(runtime)){
  if(typeof value==='function')continue;
  assert.equal(digest(value instanceof Set?[...value]:value),digest(source[name] instanceof Set?[...source[name]]:source[name]),name);
 }
 for(const [kind,rows]of Object.entries(compiled.text))for(const id of Object.keys(rows)){
  assert.equal(runtime.nameOf(kind,id),source.nameOf(kind,id),`${kind}:${id}`);
  assert.equal(runtime.icon(kind,id),source.icon(kind,id),`${kind}:${id} icon`);
  assert.equal(digest(runtime.localize(kind,id)??null),digest(source.localize(kind,id)??null),`${kind}:${id} translation`);
 }
});

test('precompiled spatial lookup retains all faction-neutral routes and monsters',()=>{
 for(const node of Object.keys(runtime.nodes))assert.deepEqual(runtime.monsterIdsAt(node),source.monsterIdsAt(node));
 for(const [from,to]of [['northshire','orgrimmar'],['stormwind','ironforge'],['orgrimmar','stormwind']])assert.deepEqual(runtime.route(from,to),source.route(from,to));
});
