import test from 'node:test';
import assert from 'node:assert/strict';
import {connectGameStream,gameStreamUrl} from '../lib/game-stream.ts';
import {createDeltaEvent,type GameSnapshotEvent} from '../../../packages/contracts/src/events.ts';
const frame=(n:number):GameSnapshotEvent=>({type:'snapshot',protocolVersion:1,contentVersion:'content',sequence:n,revision:n,scope:'full',snapshot:{player:{id:'hero',clock:n},view:{}}});
function harness(onSnapshot:(s:GameSnapshotEvent)=>unknown){
 const sockets:any[]=[],timers=new Map<number,()=>void>();let id=0;
 const connection=connectGameStream({url:'ws://test/api/events',characterId:'hero',onSnapshot,schedule:((fn:()=>void)=>{timers.set(++id,fn);return id;}) as any,cancel:((n:number)=>timers.delete(n)) as any,socketFactory:()=>{const socket:any={sent:[],send(s:string){this.sent.push(JSON.parse(s));},close(){this.onclose?.();}};sockets.push(socket);return socket;}});
 const socket=sockets[0];socket.onopen();
 return {connection,socket,sockets,timers,send:(event:unknown)=>socket.onmessage({data:JSON.stringify(event)})};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('ordered deltas use their own baseline and async rendering retains only the latest pending state',async()=>{
 const received:number[]=[];let release!:()=>void;
 const h=harness(async s=>{received.push(s.sequence);if(s.sequence===1)await new Promise<void>(r=>release=r);});
 assert.deepEqual(h.socket.sent[0],{type:'subscribe',characterId:'hero',mode:'delta',realtime:true});
 h.send(frame(1));h.send(createDeltaEvent(frame(1),frame(2)));h.send(createDeltaEvent(frame(2),frame(3)));
 assert.deepEqual(received,[1]);release();await flush();assert.deepEqual(received,[1,3]);
 h.connection.close();assert.equal(h.timers.size,0);h.send(frame(4));assert.deepEqual(received,[1,3]);
});
test('a missing delta baseline requests a full subscription instead of applying corrupted state',async()=>{
 const received:number[]=[];const h=harness(s=>received.push(s.sequence));
 h.send(createDeltaEvent(frame(2),frame(3)));assert.equal(h.socket.sent.length,2);assert.deepEqual(received,[]);
 h.send(frame(4));h.send({type:'heartbeat'});await flush();assert.deepEqual(received,[4]);h.connection.close();
});
test('disconnect retries with a fresh baseline and stale socket messages are ignored',()=>{
 const received:number[]=[];const h=harness(s=>received.push(s.sequence));h.send(frame(1));h.socket.close();
 const retry=[...h.timers.values()][0];retry();assert.equal(h.sockets.length,2);
 h.send(frame(9));assert.deepEqual(received,[1]);h.connection.close();
});

test('WebSocket uses this tab’s save and secure same-origin endpoint',()=>{
 assert.equal(gameStreamUrl('https://game.test/?saveId=one&unused=value'),'wss://game.test/api/events?saveId=one');
 assert.equal(gameStreamUrl('http://localhost:5173/?saveId=two'),'ws://localhost:5173/api/events?saveId=two');
});
