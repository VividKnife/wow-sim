import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import WebSocket from 'ws';
import {createGameServer} from '../src/server.ts';
import {signGameToken} from '../src/auth.ts';
import {GameService} from '../../../packages/game-domain/src/service.ts';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {CONTENT_VERSION} from '../../../packages/game-domain/src/rules/client-content.js';

test('two real authenticated sockets follow one instance while disconnected workers keep advancing',async t=>{
 const store=new MemoryStore();let now=1000;
 const service=new GameService(store,{contentVersion:CONTENT_VERSION,now:()=>now,seed:()=>12345});
 const secret='shared-instance-integration-secret-32-bytes';
 const game=createGameServer({service,secret,pollIntervalMs:10});
 game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
 const address=game.server.address();assert.ok(address&&typeof address==='object');
 const url=`http://127.0.0.1:${address.port}`;
 const sockets:WebSocket[]=[];
 t.after(async()=>{for(const socket of sockets)socket.terminate();await game.close();await store.close();});
 const headers=Object.fromEntries(await Promise.all(['a','b'].map(async id=>[id,{authorization:`Bearer ${await signGameToken({sub:id},secret)}`,'content-type':'application/json'}])));
 let commandNumber=0;
 const command=async(account:string,value:Record<string,unknown>)=>{
  const response=await fetch(url+'/game',{method:'POST',headers:headers[account],body:JSON.stringify({...value,requestId:`command-${++commandNumber}`})});
  const body=await response.json() as any;assert.equal(response.status,200,JSON.stringify(body));return body;
 };
 const a=await command('a',{type:'create',name:'甲',classId:1,raceId:1});
 const b=await command('b',{type:'create',name:'乙',classId:1,raceId:1});
 const created=await command('a',{type:'createInstance',contentId:'northshire-skirmish',capacity:5});
 await command('b',{type:'joinInstance',instanceId:created.instanceId});
 const started=await command('a',{type:'startInstance',instanceId:created.instanceId});
 async function connect(account:string,id:string){
  const socket=new WebSocket(url.replace('http:','ws:')+'/events',{headers:headers[account]});sockets.push(socket);
  const messages:any[]=[];socket.on('message',raw=>messages.push(JSON.parse(raw.toString())));
  await once(socket,'open');socket.send(JSON.stringify({type:'subscribe',characterId:id}));
  const snapshot=async(sequence:number)=>{
   const deadline=Date.now()+5000;
   while(Date.now()<deadline){const found=messages.find(m=>m.type==='snapshot'&&m.sequence>=sequence);if(found)return found;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.fail(`No sequence ${sequence}: ${JSON.stringify(messages)}`);
  };
  return{socket,snapshot};
 }
 const [left,right]=await Promise.all([connect('a',a.snapshot.player.id),connect('b',b.snapshot.player.id)]);
 const first=await Promise.all([left.snapshot(started.instance.sequence),right.snapshot(started.instance.sequence)]);
 assert.equal(first[0].instanceId,first[1].instanceId);
 assert.deepEqual(first[0].snapshot.player.combat.enemies,first[1].snapshot.player.combat.enemies);
 for(const message of first){assert.equal(JSON.stringify(message).includes('rngState'),false);assert.equal(message.instance.roster.length,2);}
 left.socket.terminate();right.socket.terminate();
 now=61000;assert.deepEqual((await service.work()).errors,[]);
 const after=await service.snapshot('a');assert.ok(after.instance!.sequence>started.instance.sequence);
 const resumed=await connect('b',b.snapshot.player.id);
 const recovered=await resumed.snapshot(after.instance!.sequence);
 assert.equal(recovered.instanceId,created.instanceId);
 assert.equal(recovered.snapshot.player.id,b.snapshot.player.id);
 const denied=await fetch(`${url}/game?characterId=${a.snapshot.player.id}`,{headers:headers.b});
 assert.equal(denied.status,403);
});
