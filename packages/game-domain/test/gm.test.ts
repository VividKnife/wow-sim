import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../persistence/src/memory.ts';
import {GameService} from '../src/service.ts';
import {GmService,giftDefinition,buffDefinition} from '../src/gm.ts';
import {CONTENT_VERSION} from '../src/rules/client-content.js';
import {context,persistAssets} from '../src/context.ts';
import {bagCapacity,makeItem,stats} from '../src/rules/character.js';
import {scaledXp,movementMultiplier} from '../src/rules/experience.js';
import {advance} from '../src/rules/engine.js';

async function setup(){let now=1000000;const store=new MemoryStore(),service=new GameService(store,{contentVersion:CONTENT_VERSION,now:()=>now}),gm=new GmService(store,()=>now);await service.createSave('player-a',{name:'测试法师',classId:8,raceId:1},'save-a');await service.createSave('player-b',{name:'另一玩家',classId:8,raceId:1},'save-b');return {store,service,gm,save:'player-a:save-a',other:'player-b:save-b',now:()=>now,setNow:(value:number)=>{now=value;}};}
const command=(action:string,extra:Record<string,unknown>={})=>({action,reason:'回归测试',requestId:crypto.randomUUID(),...extra});

test('gift templates validate catalog/count/money and dispatch immutable snapshots exactly once',async()=>{
 const {service,store,gm,save,other}=await setup();
 assert.throws(()=>giftDefinition({name:'礼包',description:'测试',copper:0,items:[]}));
 assert.throws(()=>giftDefinition({name:'礼包',description:'测试',copper:0,items:[{id:999999999,count:1}]}));
 assert.throws(()=>giftDefinition({name:'礼包',description:'测试',copper:-1,items:[]}));
 assert.throws(()=>giftDefinition({name:'礼包',description:'测试',copper:0,items:[{id:2589,count:0}]}));
 const template=await gm.execute('admin',command('saveGift',{name:'补偿礼包',description:'物品与金币',copper:10000,items:[{id:2589,count:3},{id:118,count:2}]}));
 const dispatch=command('sendGift',{templateId:template.id,scope:'all'});
 const results=await Promise.all([gm.execute('admin',dispatch),gm.execute('admin',dispatch)]);
 assert.deepEqual(results[0],results[1]);assert.equal(results[0].recipients,2);
 const inbox=await service.gmInbox(save);assert.equal(inbox.length,1);assert.equal((await service.gmInbox(other)).length,1);
 await gm.execute('admin',command('saveGift',{templateId:template.id,name:'改版',description:'不覆盖已发放',copper:20000,items:[]}));
 assert.equal((await service.gmInbox(save))[0].gift.copper,10000);
 await assert.rejects(service.command(other,{type:'claimGmGift',id:inbox[0].id,requestId:'foreign'}),{code:'NOT_FOUND'});
 const before=(await service.snapshot(save)).state;
 await Promise.all([service.command(save,{type:'claimGmGift',id:inbox[0].id,requestId:'claim-a'}),service.command(save,{type:'claimGmGift',id:inbox[0].id,requestId:'claim-b'})]);
 const after=(await service.snapshot(save)).state;
 assert.equal(after.money,before.money+10000);assert.equal(after.bag.filter((item:any)=>item.id===2589).reduce((n:number,item:any)=>n+item.count,0),3);
 assert.equal((await service.gmInbox(save)).length,0);
 assert.equal((await store.read(tx=>tx.list('gm_deliveries',{status:'claimed'}))).length,1);
 await assert.rejects(gm.execute('admin',{...dispatch,scope:'player',userId:'player-a'}),{code:'REQUEST_REUSED'});
 const targeted=await gm.execute('admin',command('sendGift',{templateId:template.id,scope:'player',userId:'player-a'}));assert.equal(targeted.recipients,1);
});

test('full bags reject the whole gift, preserve money and let the player retry after cleanup',async()=>{
 const {service,store,gm,save}=await setup();
 const original=(await service.snapshot(save)).state;
 await store.transaction(async tx=>{const character=await tx.get<any>('characters',original.id);const s=await context(tx,character,1000000);s.bag=[];for(let i=0;i<bagCapacity(s)-1;i++)s.bag.push(makeItem(s,25,1));await persistAssets(tx,character,s,'fill',()=>crypto.randomUUID());});
 const template=await gm.execute('admin',command('saveGift',{name:'满包测试',description:'需要两格',copper:10000,items:[{id:2589,count:21}]}));await gm.execute('admin',command('sendGift',{templateId:template.id,scope:'player',userId:'player-a'}));const gift=(await service.gmInbox(save))[0];
 const before=(await service.snapshot(save)).state;
 await assert.rejects(service.command(save,{type:'claimGmGift',id:gift.id,requestId:'full-bag'}),/先清理背包/);
 assert.equal((await service.snapshot(save)).state.money,before.money);assert.equal((await service.gmInbox(save)).length,1);
 await store.transaction(async tx=>{const c=await tx.get<any>('characters',original.id);const s=await context(tx,c,1000000);s.bag.splice(0,1);await persistAssets(tx,c,s,'clear',()=>crypto.randomUUID());});
 const claimed=await service.command(save,{type:'claimGmGift',id:gift.id,requestId:'full-bag'});
 assert.equal(claimed.state.money,before.money+10000);assert.equal(claimed.state.bag.length,bagCapacity(claimed.state));
 assert.equal((await service.gmInbox(save)).length,0);
});

test('global and targeted buffs affect actual stats, experience and movement, expire and revoke',async()=>{
 const {service,gm,save,other,setNow,now}=await setup();
 assert.throws(()=>buffDefinition({name:'错误',description:'测试',durationMinutes:0,effects:{xpMultiplier:2}}));
 assert.throws(()=>buffDefinition({name:'错误',description:'测试',durationMinutes:1,effects:{unlimited:2}}));
 const before=(await service.snapshot(save)).state,base=stats(before),baseXp=scaledXp(before,100),baseSpeed=movementMultiplier(before);
 await gm.execute('admin',command('issueBuff',{name:'世界祝福',description:'全图生效',durationMinutes:1,scope:'all',effects:{xpMultiplier:2,movementMultiplier:1.5,maxHp:100,spellPower:25}}));
 const targeted=await gm.execute('admin',command('issueBuff',{name:'专属祝福',description:'仅玩家A',durationMinutes:10,scope:'player',userId:'player-a',effects:{armor:300}}));
 const a=(await service.snapshot(save)).state,b=(await service.snapshot(other)).state;
 assert.equal(stats(a).maxHp,base.maxHp+100);assert.equal(stats(a).spellPower,base.spellPower+25);assert.equal(stats(a).armor,base.armor+300);
 assert.equal(scaledXp(a,100),baseXp*2);assert.equal(movementMultiplier(a),baseSpeed*1.5);
 assert.equal(b.serverBuffs.filter((buff:any)=>buff.gm).length,1);
 await service.createSave('player-a',{name:'新角色',classId:8,raceId:1},'new-save');assert.equal((await service.snapshot('player-a:new-save')).state.serverBuffs.filter((buff:any)=>buff.gm).length,2);
 const advanced=advance(a,now()+61000).state;
 assert.equal(scaledXp(advanced,100),baseXp);assert.equal(stats(advanced).maxHp,base.maxHp);
 await gm.execute('admin',command('revokeBuff',{buffId:targeted.id}));
 // Revocation is a wall-time end boundary, not deletion of historical windows.
 setNow(now()+61000);const late=(await service.snapshot(save)).state;assert.equal(stats(late).maxHp,base.maxHp);assert.equal(scaledXp(late,100),baseXp);
 assert.equal(late.serverBuffs.filter((buff:any)=>buff.gm&&buff.until>late.time).length,0);
});

for(const kind of ['personal','instance'])test(`${kind}: GM buffs reconcile without losing progress or accepting forged buffs`,async()=>{
 const {service,gm,save,now,setNow}=await setup();
 let started;
 if(kind==='personal')started=await service.command(save,{type:'hunt',id:299,requestId:'start-hunt'});
 else{const formed=await service.command(save,{type:'createInstance',requestId:'form'});started=await service.command(save,{type:'startInstance',instanceId:formed.instanceId,requestId:'start'});}
 const shared={ownerId:started.localSimulation!.ownerId,characterId:started.state.id,clientId:'browser',contentVersion:CONTENT_VERSION};
 const claim=await service.localSimulation(save,{...shared,type:'claim',requestId:'claim-local'});
 const issued=await gm.execute('admin',command('issueBuff',{name:'在线祝福',description:'无需重启战斗',scope:'player',userId:'player-a',durationMinutes:10,effects:{xpMultiplier:2,spellPower:10}}));
 setNow(now()+1000);const state=advance(claim.state,now()).state;
 const checkpoint={...shared,type:'checkpoint',sessionId:claim.session.id,sequence:1,requestId:'checkpoint-one',state};
 const result=await service.localSimulation(save,checkpoint);
 assert.ok(result.serverBuffs[state.id].some((buff:any)=>buff.id===issued.id));
 assert.equal((await service.localSimulation(save,checkpoint)).serverBuffs[state.id].find((buff:any)=>buff.id===issued.id).name,'在线祝福');
 // Apply the authoritative ACK exactly as the browser Worker does.
 for(const actor of [state,...state.party])actor.serverBuffs=result.serverBuffs[actor.id];
 for(const [from,to] of result.itemIds)for(const item of state.bag)if(item.uid===from)item.uid=to;
 setNow(now()+1000);const second=advance(state,now()).state;
 const forged=structuredClone(second);forged.serverBuffs.push({id:'forged',xpMultiplier:1000});
 await assert.rejects(service.localSimulation(save,{...shared,type:'checkpoint',sessionId:claim.session.id,sequence:2,requestId:'forged-buff',state:forged}),{code:'LOCAL_STATE'});
 await service.localSimulation(save,{...shared,type:'checkpoint',sessionId:claim.session.id,sequence:2,requestId:'checkpoint-two',state:second});
});


test('claiming during local combat commits checkpoint plus reward and fences late overwrites',async()=>{
 const {service,gm,save,now,setNow}=await setup();
 const started=await service.command(save,{type:'hunt',id:299,requestId:'start-hunt'});
 const shared={ownerId:started.localSimulation!.ownerId,characterId:started.state.id,clientId:'browser',contentVersion:CONTENT_VERSION};
 const claim=await service.localSimulation(save,{...shared,type:'claim',requestId:'local-claim'});
 const template=await gm.execute('admin',command('saveGift',{name:'战斗补给',description:'奖励不覆盖本地进度',copper:10000,items:[{id:2589,count:3}]}));
 await gm.execute('admin',command('sendGift',{templateId:template.id,scope:'player',userId:'player-a'}));
 const gift=(await service.gmInbox(save))[0];setNow(now()+1000);
 const state=advance(claim.state,now()).state;
 const checkpoint={...shared,type:'checkpoint',sessionId:claim.session.id,sequence:1,requestId:'combined-checkpoint',state};
 const cmd={type:'claimGmGift',id:gift.id,characterId:state.id,localCheckpoint:checkpoint,localClientId:'browser',localSessionId:claim.session.id,requestId:'combined-claim'};
 const result=await service.command(save,cmd);
 assert.equal(result.state.money,state.money+10000);assert.ok(result.state.bag.some((item:any)=>item.id===2589&&item.count===3));
 const retry=await service.command(save,cmd);assert.equal(retry.state.money,result.state.money);
 await assert.rejects(service.localSimulation(save,{...checkpoint,sequence:2,requestId:'late-checkpoint'}),{code:'LOCAL_STALE'});
});

test('a guest player claims into their own bag and wallet inside a shared instance',async()=>{
 const {service,gm,save,other}=await setup();
 const formed=await service.command(save,{type:'createInstance',requestId:'form-shared'});
 await service.command(other,{type:'joinInstance',instanceId:formed.instanceId,requestId:'join-shared'});
 await service.command(save,{type:'startInstance',instanceId:formed.instanceId,requestId:'start-shared'});
 const template=await gm.execute('admin',command('saveGift',{name:'访客礼包',description:'访客自己的奖励',copper:30000,items:[{id:2589,count:2}]}));
 await gm.execute('admin',command('sendGift',{scope:'player',userId:'player-b',templateId:template.id}));
 const gift=(await service.gmInbox(other))[0];
 const result=await service.command(other,{type:'claimGmGift',id:gift.id,requestId:'guest-claim'});
 assert.equal(result.state.money,30000);assert.ok(result.state.bag.some((item:any)=>item.id===2589&&item.count===2));
 assert.equal((await service.snapshot(save)).state.money,0);assert.equal((await service.gmInbox(other)).length,0);
});
