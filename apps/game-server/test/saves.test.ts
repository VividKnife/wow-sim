import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createGameServer} from '../src/server.ts';
import {signGameToken} from '../src/auth.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';

test('save API lists, creates, scopes every game read/write and deletes only owned saves',async t=>{
 const service=new GameService(new MemoryStore(),{contentVersion:'test'}),secret='save-tests-secret-that-is-at-least-32-bytes';
 const game=createGameServer({service,secret});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
 t.after(()=>game.close());const url=`http://127.0.0.1:${(game.server.address() as any).port}`;
 const headers={authorization:`Bearer ${await signGameToken({sub:'alice'},secret)}`,'content-type':'application/json'};
 const other={...headers,authorization:`Bearer ${await signGameToken({sub:'bob'},secret)}`};
 const created=await fetch(url+'/saves',{method:'POST',headers,body:JSON.stringify({name:'晨星',classId:8,raceId:1,boost:true,requestId:'create-boost-save'})});
 assert.equal(created.status,201);const {id}=await created.json() as any;
 const query=`?saveId=${encodeURIComponent(id)}`;
 const list=await fetch(url+'/saves',{headers});assert.equal((await list.json() as any).saves.length,1);
 assert.deepEqual((await (await fetch(url+'/saves',{headers:other})).json() as any).saves,[]);
 const loaded=await fetch(url+'/game'+query,{headers});assert.equal(loaded.status,200);assert.equal((await loaded.json() as any).snapshot.player.level,20);
 for(const path of ['/game','/game/replay','/workshop'])assert.equal((await fetch(url+path+query,{headers:other})).status,404,path);
 assert.equal((await fetch(url+'/game'+query,{method:'POST',headers:other,body:JSON.stringify({type:'unstuck',requestId:'bad-owner-command'})})).status,404);
 assert.equal((await fetch(url+'/saves'+query,{method:'DELETE',headers:other})).status,404);
 assert.equal((await fetch(url+'/saves'+query,{method:'DELETE',headers})).status,200);
 assert.equal((await fetch(url+'/game'+query,{headers})).status,404);
 assert.equal((await fetch(url+'/saves')).status,401);
});
