import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandQueue} from '../lib/command-queue.js';

test('manual commands wait behind sync in order; redundant sync is skipped',async()=>{
 const seen=[];let release;const gate=new Promise(resolve=>release=resolve);
 const queue=createCommandQueue(async command=>{seen.push(command.type);if(command.type==='sync')await gate;return true;});
 const sync=queue({type:'sync'}),hunt=queue({type:'hunt'}),stop=queue({type:'stop'});
 assert.equal(await queue({type:'sync'}),false);await Promise.resolve();assert.deepEqual(seen,['sync']);
 release();assert.deepEqual(await Promise.all([sync,hunt,stop]),[true,true,true]);assert.deepEqual(seen,['sync','hunt','stop']);
});

test('a failed command does not block following commands and reports failure',async()=>{
 const queue=createCommandQueue(async command=>{if(command.type==='bad')throw new Error('rejected');return true;});
 const bad=queue({type:'bad'}),good=queue({type:'good'});await assert.rejects(bad,/rejected/);assert.equal(await good,true);
});
