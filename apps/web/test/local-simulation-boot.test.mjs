import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {createGame} from '../../../packages/game-domain/src/rules/engine.js';
import manifest from '../../../packages/game-data/manifest.json' with {type:'json'};

// Unlike the small protocol fixtures, load the real rule/data dependency graph.
// A module-scope API error prevents ready from ever reaching the client.
test('the real browser simulation boots without Object.groupBy',async()=>{
 const bundle=await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),entryPoints:['lib/local-simulation.worker.ts'],write:false,bundle:true,format:'iife',platform:'browser',logLevel:'silent'});
 const messages=[];
 const scope=createContext({performance,structuredClone,TextEncoder,TextDecoder,crypto,setTimeout:()=>1,clearTimeout:()=>{},postMessage:message=>messages.push(message)});
 scope.self=scope;
 runInContext('Object.groupBy = undefined',scope);
 runInContext(bundle.outputFiles[0].text,scope,{timeout:120_000});
 assert.equal(typeof scope.onmessage,'function');
 scope.onmessage({data:{type:'start',contentVersion:'outdated',generation:'boot-check'}});
 assert.equal(messages[0].code,'CONTENT_VERSION','the real worker reached its version handshake');
 assert.equal(messages[0].generation,'boot-check');
 const state=createGame('手机启动验证',93,0);
 scope.onmessage({data:{type:'visibility',visible:true,watching:false}});
 scope.onmessage({data:{type:'start',state,contentVersion:manifest.contentVersion,generation:'current',serverNow:1000,deadline:1000}});
 assert.ok(messages.some(message=>message.type==='ready'&&message.generation==='current'));
 assert.equal(messages.find(message=>message.type==='full')?.snapshot.player.id,state.id);
 assert.equal(messages.some(message=>message.type==='error'&&message.generation==='current'),false);
 scope.onmessage({data:{type:'checkpoint',generation:'current',requestId:'capture'}});
 assert.equal(messages.find(message=>message.type==='checkpoint')?.state.wallAt,1000);
});
