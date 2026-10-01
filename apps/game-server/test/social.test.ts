import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {MemoryStore} from '../../../packages/persistence/src/memory.ts';
import {SocialService} from '../../../packages/game-domain/src/social.ts';
import {createGameServer,type GameServiceLike} from '../src/server.ts';
import {accounts,issueSession,appOrigin} from './session-fixture.ts';
test('authenticated social HTTP binds save and actor, rejects CSRF, and isolates party chat',async()=>{
 const store=new MemoryStore({characters:['alice','bob','carol'].map(id=>({id,accountId:id,kind:'hero',rules:{name:id,level:20,classId:8}}))});
 const social=new SocialService(store),unused=async()=>{throw new Error('No combat operations in social routes');};
 const service:GameServiceLike={snapshot:unused,createAccount:unused,command:unused,work:unused,socialSnapshot:(...args)=>social.snapshot(...args),socialCommand:(...args)=>social.command(...args),resolveSave:async(user,save)=>{if(user!==save)throw Object.assign(new Error('Forbidden save'),{status:403});return save!;}};
 const gateway=createGameServer({service,accounts,appOrigin});gateway.server.listen(0,'127.0.0.1');await once(gateway.server,'listening');const address=gateway.server.address();assert.ok(address&&typeof address==='object');
 const base=`http://127.0.0.1:${address.port}/api/game/social`;
 const headers=Object.fromEntries(await Promise.all(['alice','bob','carol'].map(async id=>[id,{Origin:appOrigin,Cookie:`wow_session=${await issueSession({sub:id})}`,'content-type':'application/json'}])));
 const read=(actor:string,extra='')=>fetch(`${base}?characterId=${actor}${extra}`,{headers:headers[actor]});
 const command=(actor:string,body:any)=>fetch(`${base}?characterId=${actor}`,{method:'POST',headers:headers[actor],body:JSON.stringify({...body,requestId:crypto.randomUUID()})});
 try{
 assert.equal((await fetch(base+'?characterId=alice')).status,401);
 assert.equal((await fetch(base+'?characterId=bob',{headers:headers.alice})).status,403);
 assert.equal((await read('alice','&saveId=bob')).status,403);
 assert.equal((await fetch(base+'?characterId=alice',{method:'POST',headers:{...headers.alice,Origin:'https://evil.test'},body:JSON.stringify({type:'role',role:'dps',requestId:crypto.randomUUID()})})).status,403);
 assert.equal((await command('alice',{type:'partyInvite',targetId:'bob',accountId:'bob'})).status,200);
 const incoming=(await (await read('bob')).json()).incoming[0];assert.equal((await command('bob',{type:'respond',inviteId:incoming.id,accept:true})).status,200);
 assert.equal((await command('alice',{type:'chat',channel:'party',text:'只有队友看到'})).status,200);
 assert.equal((await (await read('bob')).json()).messages.party[0].text,'只有队友看到');assert.equal((await (await read('carol')).json()).messages.party.length,0);
 assert.equal((await command('carol',{type:'chat',channel:'party',text:'越权'})).status,409);
 }finally{await gateway.close();await store.close();}
});
