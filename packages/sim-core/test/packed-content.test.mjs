import test from 'node:test';
import assert from 'node:assert/strict';
import {packContent} from '../../../scripts/content-source/pack.mjs';
import {openPackedContent} from '../src/packed-content.js';
import {trimBattleHistory,BATTLE_HISTORY_BYTES} from '../src/battle-history.js';

test('packed records preserve undefined, key order, arrays, references and structuredClone',()=>{
 const shared={id:7,zero:0,missing:undefined,empty:null,label:'中文'},source={a:shared,b:shared,rows:[shared,{...shared,id:9}],flags:[false,true]};
 const packed=packContent(source);packed.nodes=packed.nodes.map(JSON.stringify);
 const {root}=openPackedContent(packed);
 assert.deepEqual(root,source);assert.equal(root.a,root.b);
 assert.deepEqual(Object.keys(root.a),Object.keys(shared));
 assert.deepEqual(structuredClone(root),source);
});

test('unread records are not expanded and the hot cache has a bounded budget',()=>{
 const source=Object.fromEntries(Array.from({length:2000},(_,id)=>[id,{id,details:{text:'x'.repeat(100),values:[id,id+1]}}]));
 const store=openPackedContent(packContent(source),{cacheBudget:150000});
 assert.equal(store.stats().decoded,1);
 assert.equal(store.root[1999].details.values[0],1999);
 assert.equal(store.stats().decoded,4);
 for(let i=0;i<2000;i++)assert.equal(store.root[i].id,i);
 assert.ok(store.stats().retainedEstimate<=150000);
 assert.deepEqual(structuredClone(store.root[0]),source[0]);
});

test('missing records stop before a value is returned and can be installed then retried',()=>{
 const packed=packContent({a:{id:1},b:{id:2}}),records=packed.nodes;
 const partial={...packed,nodes:{[packed.root]:records[packed.root]}};
 let missing;
 const store=openPackedContent(partial,{missing:id=>{missing=id;throw new Error('missing');}});
 assert.throws(()=>store.root.b,/missing/);
 partial.nodes[missing]=records[missing];assert.equal(store.root.b.id,2);
});

test('battle detail is bounded by UTF-8 bytes as well as count',()=>{
 const history=Array.from({length:30},(_,i)=>({id:i,text:'战'.repeat(30000)}));
 trimBattleHistory(history);assert.equal(history.at(-1).id,29);
 assert.ok(Buffer.byteLength(JSON.stringify(history))<=BATTLE_HISTORY_BYTES+100);
 assert.ok(history.length<20);
 history.push({id:30,text:'x'.repeat(BATTLE_HISTORY_BYTES+1)});trimBattleHistory(history);assert.equal(history.length,0);
});

test('hot and evicted content retain identity and every lookup remains observable',()=>{
 const reads=[],store=openPackedContent(packContent({a:{id:1},b:{id:2}}),{cacheBudget:0,onRead:id=>reads.push(id)});
 const a=store.root.a,afterFirst=reads.length;
 assert.equal(store.root.a,a);assert.equal(reads.length,afterFirst+1);
 const b=store.root.b;assert.equal(b.id,2); // evicts a from the strong hot cache
 const decoded=store.stats().decoded;store.clear();
 assert.equal(store.root.a,a);assert.equal(store.stats().decoded,decoded);
 assert.equal(store.stats().retainedEstimate,0,'weak lookup does not enlarge the configured hot cache');
});
