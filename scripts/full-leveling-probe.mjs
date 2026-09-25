// Continuous 1-60 command/tick playthrough. No direct edits to XP, level,
// inventory, quest credit, location, or clock after createGame.
// Checkpoints are written so a long run can resume after interruption.
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createGame, act, advance, view} from '../packages/game-domain/src/rules/engine.js';
import {quests, questLinks, questXp, endpointNodes, nodes, route, monsterIdsAt, creatures, items, nameOf, creatureLoot, referenceLoot, table, creatureLocations} from '../packages/game-domain/src/rules/catalog.js';
import {questAvailable, questProgress, questContentReason, questTargetAction, itemSources, gatherables} from '../packages/game-domain/src/rules/quests.js';
import {bagCapacity, countItem, equipmentBlockedReason} from '../packages/game-domain/src/rules/character.js';
import {protectedItem,discardBlockedReason,tradable} from '../packages/game-domain/src/rules/inventory.js';
import {equipmentUpgrade} from '../packages/game-domain/src/rules/npc-equipment.js';
import {dungeonDefinitions} from '../packages/game-domain/src/rules/dungeon-registry.js';
import {shop} from '../packages/game-domain/src/rules/engine.js';
import {applyExperienceBuff, experienceMultiplier} from '../packages/game-domain/src/rules/experience.js';

const xpMultiplier=experienceMultiplier(process.env.XP_MULTIPLIER||1);
const probeName=process.env.PROBE_NAME||'full-paladin';
if(!/^[a-z0-9-]+$/.test(probeName))throw Error('PROBE_NAME must contain only lowercase letters, digits, and hyphens');
const directory=new URL(`../artifacts/leveling/${probeName}/`,import.meta.url);
await mkdir(directory,{recursive:true});
const saveUrl=new URL('checkpoint.json',directory), traceUrl=new URL('trace.ndjson',directory);
const maxLevel=Number(process.env.MAX_LEVEL||60);
let s,meta;
if(existsSync(saveUrl)){
 ({state:s,meta}=JSON.parse(await readFile(saveUrl,'utf8')));
 if((meta.xpMultiplier||1)!==xpMultiplier)throw Error(`checkpoint XP multiplier ${meta.xpMultiplier||1} differs from requested ${xpMultiplier}`);
}
else{
 s=createGame('长程探针',20260924,0,{raceId:1,classId:2});
 applyExperienceBuff(s,xpMultiplier);
 s=act(s,{type:'settings',autoLoot:true,autoLootIgnoreGray:true},0);
 meta={xpMultiplier,commands:{},questTurns:0,questXp:0,dungeons:[],levelTimes:{1:0},events:[],blocked:[],skippedQuestIds:[],lastDungeonLevel:0,iterations:0};
 await writeFile(traceUrl,'');
}
const blocked=new Set(meta.skippedQuestIds);
let lastSaveAt=s.wallAt;
let saveQueue=Promise.resolve(),stopping=false;
const trace=async entry=>{
 const row={time:s.wallAt,level:s.level,location:s.location,...entry};
 await writeFile(traceUrl,JSON.stringify(row)+'\n',{flag:'a'});
 console.log(JSON.stringify(row));
};
function save(){
 meta.skippedQuestIds=[...blocked];
 const data=JSON.stringify({state:s,meta});
 saveQueue=saveQueue.then(async()=>{
  const temp=new URL('checkpoint.next.json',directory);
  await writeFile(temp,data);
  await rename(temp,saveUrl);
 });
 return saveQueue;
}
process.on('SIGINT',()=>{if(stopping)return;stopping=true;save().finally(()=>process.exit(130));});
function command(action){
 const before=s.level;
 s=act(s,action,s.wallAt);
 if(action.type==='recruit')for(const member of s.party)applyExperienceBuff(member,xpMultiplier);
 meta.commands[action.type]=(meta.commands[action.type]||0)+1;
 if(s.level!==before)onLevel(before);
}
function onLevel(before){for(let n=before+1;n<=s.level;n++)meta.levelTimes[n]=s.wallAt;}
function tickTo(time,stopWhen){
 const before=s.level;
 const r=advance(s,time,{maxTicks:200000,stopWhen});
 s=r.state;
 if(s.level!==before)onLevel(before);
 if(!r.complete&&s.wallAt<time)return false;
 return true;
}
function distance(to){try{return route(s.location,to).duration;}catch{return Infinity;}}
function nearest(locations){return locations.filter(id=>nodes[id]).sort((a,b)=>distance(a)-distance(b))[0];}
function upgradePlan(actor,item){return equipmentUpgrade({...actor,bag:(actor.bag||[]).filter(i=>i.uid!==item.uid)},items[item.id]);}
function neededUpgrade(item){return [s,...s.party].some(actor=>upgradePlan(actor,item).need&&!equipmentBlockedReason(actor,item,undefined,s));}
const bagVendorNodes=[...new Set(table('npc_vendor').filter(v=>v.item===4497||v.item===4498).flatMap(v=>creatureLocations[v.entry]||[]))];
function expandBags(){
 if(s.dungeon||s.bags.length===4&&s.bags.every(b=>items[b.id]?.ContainerSlots>=10)||s.money<2500)return false;
 const useLarge=s.money>=100000;
 const id=useLarge?4497:4498;
 const locations=bagVendorNodes.filter(node=>{
  const local={...s,location:node};return shop(local).some(x=>x.id===id);
 });
 const dest=nearest(locations);
 if(!dest)return false;
 travel(dest);if(s.hp<=0)return false;
 while(s.bag.length>=bagCapacity(s)){
  const disposable=s.bag.filter(i=>!protectedItem(i)&&items[i.id]?.SellPrice>0)
   .sort((a,b)=>(upgradePlan(s,a).improvement||0)-(upgradePlan(s,b).improvement||0));
  if(!disposable.length)break;
  command({type:'sellBatch',uids:[disposable[0].uid]});
 }
 let bought=false;
 for(let n=0;n<4;n++){
  const current=s.bags[n],size=current?items[current.id]?.ContainerSlots||0:0;
  if(size>=items[id].ContainerSlots||s.money<(shop(s).find(x=>x.id===id)?.price||Infinity)||s.bag.length>=bagCapacity(s))continue;
  command({type:'buy',id,count:1});
  const bag=s.bag.findLast(i=>i.id===id);
  if(!bag)break;
  command({type:'equipBag',uid:bag.uid});bought=true;
 }
 if(bought)console.log(`BAGS ${s.bags.map(b=>items[b.id]?.ContainerSlots).join('+')} at ${(s.wallAt/3600000).toFixed(2)}h`);
 return bought;
}
function travel(to){
 if(to===s.location)return;
 command({type:'travel',to});
 let loops=0,restarts=0;
 while(s.location!==to&&loops++<30){
  const deadline=Math.min(s.activity.endsAt||s.wallAt+600000,s.wallAt+600000);
  tickTo(deadline,x=>x.hp<=0||x.location===to||x.activity.type==='idle');
  if(s.hp<=0)break;
  if(s.location!==to&&s.activity.type==='idle'){
   if(restarts++>=3)throw Error('travel stopped before destination: '+to);
   const hazardUntil=Math.max(s.clock,...(s.groundEffects||[]).map(effect=>effect.until||s.clock));
   if(hazardUntil>s.clock)tickTo(s.wallAt+hazardUntil-s.clock+100,x=>x.hp<=0);
   if(s.hp<=0)break;
   command({type:'travel',to});
  }
 }
 if(s.location!==to)throw Error('travel did not reach '+to);
}
function lootAndClear(){
 if(s.activity.type==='hunt')command({type:'stop'});
 if(s.combat)while(s.combat)tickTo(s.wallAt+10000,x=>!x.combat);
 for(const item of [...s.bag])if((items[item.id]?.class===12||items[item.id]?.bonding===4)&&!items[item.id]?.startquest&&!discardBlockedReason(s,item))command({type:'discardItem',uid:item.uid});
 for(let pass=0;pass<4;pass++){
  const pending=s.pending.filter(i=>!(s.settings.autoLootIgnoreGray&&items[i.id]?.Quality===0));
  if(pending.length&&s.bag.length<bagCapacity(s))command({type:'loot',uids:pending.map(i=>i.uid)});
  if(s.bag.some(i=>items[i.id]?.Quality===0&&!protectedItem(i))||s.pending.filter(i=>items[i.id]?.Quality===0&&!protectedItem(i)).length>100)command({type:'discardJunk'});
  if(s.bag.length<bagCapacity(s)-2&&!s.pending.some(i=>!(s.settings.autoLootIgnoreGray&&items[i.id]?.Quality===0)))break;
  // The simulated auction command is available outside dungeons and is a real
  // player action. Keep all active quest materials and possible upgrades.
  if(s.dungeon)break;
  const required=new Set(Object.keys(s.quests).flatMap(id=>[1,2,3,4].map(n=>quests[id]['ReqItemId'+n]).filter(Boolean)));
  const sell=s.bag.filter(i=>!protectedItem(i)&&!required.has(i.id)&&!neededUpgrade(i)&&items[i.id]?.Quality>0&&items[i.id]?.Quality<=3&&tradable(i));
  if(!sell.length)break;
  command({type:'auctionSellBatch',uids:sell.map(i=>i.uid)});
 }
 if(shop(s).length){
  const required=new Set(Object.keys(s.quests).flatMap(id=>[1,2,3,4].map(n=>quests[id]['ReqItemId'+n]).filter(Boolean)));
  const sell=s.bag.filter(i=>!protectedItem(i)&&!required.has(i.id)&&!neededUpgrade(i)&&items[i.id]?.SellPrice>0);
  if(sell.length)command({type:'sellBatch',uids:sell.map(i=>i.uid)});
 }
 if(s.bag.length>=bagCapacity(s)-4&&!s.dungeon){equipUpgrades();expandBags();}
 return s.bag.length<bagCapacity(s)&&!s.pending.some(i=>!(s.settings.autoLootIgnoreGray&&items[i.id]?.Quality===0));
}
function equipUpgrades(){
 if(s.combat||!['idle','hunt'].includes(s.activity.type))return;
 for(const item of [...s.bag]){
  if(!items[item.id]?.InventoryType)continue;
  const options=[s,...s.party].map(actor=>({actor,plan:upgradePlan(actor,item)}))
   .filter(x=>x.plan.need&&!equipmentBlockedReason(x.actor,item,undefined,s))
   .sort((a,b)=>b.plan.improvement-a.plan.improvement);
  if(!options.length)continue;
  try{command({type:'equip',uid:item.uid,target:options[0].actor.id,slot:options[0].plan.slot});}catch{}
 }
}
function train(){
 if(s.combat||s.activity.type!=='idle')return;
 if(meta.lastTrainedLevel===s.level&&meta.lastTrainerLocation===s.location)return;
 meta.lastTrainedLevel=s.level;meta.lastTrainerLocation=s.location;
 const page=view(s);
 if(page.canTrain){
  for(const skill of page.skills.filter(a=>a.canTrain)){
   try{command({type:'train',id:skill.spellId});}catch{}
  }
 }
 let points=Math.max(0,s.level-9-Object.values(s.talents||{}).reduce((n,x)=>n+x,0));
 while(points-->0){
  const available=view(s).talents.filter(t=>t.canLearn).sort((a,b)=>a.requiredTreePoints-b.requiredTreePoints||a.row-b.row||a.col-b.col);
  if(!available.length)break;
  try{command({type:'talent',id:available[0].id});}catch{break;}
 }
}
function goodQuest(q){
 if(blocked.has(q.entry)||questContentReason(q)||q.SpecialFlags&1||s.completed[q.entry]||s.quests[q.entry])return false;
 if(q.MinLevel>s.level||q.QuestLevel>s.level+2||q.QuestLevel<s.level-6)return false;
 if(!(questXp[q.entry]?.[s.level-1]>0))return false;
 if(!questAvailable(s,q))return false;
 const starts=(questLinks[q.entry]?.starts||[]).flatMap(endpointNodes);
 if(!starts.length||!nearest(starts))return false;
 for(let n=1;n<=4;n++){
  if(q['ReqItemId'+n]&&!itemSources(q['ReqItemId'+n]).length&&items[q['ReqItemId'+n]]?.class!==12)return false;
  const id=q['ReqCreatureOrGOId'+n];
  if(id){const action=questTargetAction(q,n),enemy=creatures[id];if(action.kind==='kill'&&(!enemy||enemy.Rank||enemy.MinLevel>s.level+2)||!action.locations.length)return false;}
 }
 if(q.SpecialFlags&2&&![62,76].includes(q.entry)&&!q.EndText)return false;
 return true;
}
function questTravelBudget(){return s.level>=40?5_400_000:Math.max(900000,s.level*30000);}
function candidateQuests(){
 const list=[];
 for(const q of Object.values(quests))if(goodQuest(q)){
  const starts=(questLinks[q.entry]?.starts||[]).flatMap(endpointNodes);
  const to=nearest(starts),travelMs=distance(to);
  if(travelMs>questTravelBudget())continue;
  list.push({q,to,travelMs,xp:questXp[q.entry]?.[s.level-1]||0});
 }
 return list.sort((a,b)=>(a.travelMs+240000)/Math.max(1,a.xp)-(b.travelMs+240000)/Math.max(1,b.xp));
}
function activeProgress(){return Object.keys(s.quests).map(id=>questProgress(s,+id)).filter(Boolean);}
const itemMobCache=new Map();
function lootContains(rows,item,seen=new Set()){
 for(const row of rows||[]){
  if(row.mincountOrRef>0&&row.item===item)return true;
  if(row.mincountOrRef<0&&!seen.has(-row.mincountOrRef)){
   const next=new Set(seen);next.add(-row.mincountOrRef);
   if(lootContains(referenceLoot[-row.mincountOrRef],item,next))return true;
  }
 }
 return false;
}
function itemMobs(item){
 if(itemMobCache.has(item))return itemMobCache.get(item);
 const result=new Set(Object.values(creatures).filter(c=>c.LootId&&lootContains(creatureLoot[c.LootId],item)).map(c=>c.Entry));
 itemMobCache.set(item,result);return result;
}
function finishQuests(){
 const complete=activeProgress().filter(q=>q.complete);
 if(!complete.length)return false;
 const q=complete.sort((a,b)=>distance(nearest(a.endLocations))-distance(nearest(b.endLocations)))[0];
 const dest=nearest(q.endLocations);
 if(!dest){blocked.add(q.id);return false;}
 travel(dest);
 if(s.hp<=0)return true;
 const oldXp=s.totals.xp;
 command({type:'turnin',id:q.id,choice:q.choices[0]?.id});
 meta.questTurns++;meta.questXp+=s.totals.xp-oldXp;
 console.log(`QUEST ${meta.questTurns} #${q.id} L${s.level} at ${(s.wallAt/3600000).toFixed(2)}h`);
 return true;
}
function workQuest(){
 const available=activeProgress().filter(q=>!q.complete&&!blocked.has(q.id));
 const steps=[];
 for(const q of available)for(const o of q.objectives){
  if(o.count>=o.required)continue;
  const scene=q.scenes.find(scene=>scene.key==='event'&&o.kind==='event'||scene.key.startsWith('item:')&&o.kind==='item'&&quests[q.id]['ReqItemId'+scene.key.split(':')[1]]===o.id||scene.key.startsWith('special:')&&o.kind==='item'&&quests[q.id]['ReqItemId'+scene.key.split(':')[1]]===o.id||scene.key.startsWith('encounter:')&&o.kind==='encounter'||scene.key.startsWith('objective:')&&o.kind==='interact'||scene.key.startsWith('spell:')&&o.kind==='spell');
  if(scene&&scene.ready!==false){const dest=nearest(scene.locations);if(dest)steps.push({kind:'scene',q,o,scene,dest,travelMs:distance(dest)});continue;}
  if(o.kind==='kill'){
   const dest=nearest(o.locations.filter(n=>monsterIdsAt(n).includes(o.id)));
   if(dest&&creatures[o.id]?.MinLevel<=s.level+2)steps.push({kind:'hunt',q,o,dest,target:o.id,travelMs:distance(dest)});
  }else if(o.kind==='object'){
   const dest=nearest(o.locations);if(dest)steps.push({kind:'gather',q,o,dest,travelMs:distance(dest)});
  }else if(o.kind==='item'){
   const mobs=itemMobs(o.id),options=[];
   for(const dest of o.locations)for(const target of monsterIdsAt(dest))if(mobs.has(target)&&creatures[target].MinLevel<=s.level+3)options.push({kind:'item-hunt',q,o,dest,target,travelMs:distance(dest)});
   const choice=options.sort((a,b)=>a.travelMs-b.travelMs)[0];
   if(choice)steps.push(choice);
   else{const dest=nearest(o.locations);if(dest)steps.push({kind:'item-gather',q,o,dest,travelMs:distance(dest)});}
  }else if(o.kind==='event'){
   const dest=nearest(o.locations);if(dest)steps.push({kind:'explore',q,o,dest,travelMs:distance(dest)});
  }
 }
 if(!steps.length)return false;
 const {kind,q,o,dest,scene,target}=steps.sort((a,b)=>a.travelMs-b.travelMs||b.q.xp-a.q.xp)[0];
 const beforeCount=o.count;
 const startedAt=s.wallAt;
 travel(dest);if(s.hp<=0)return true;
 if(kind==='scene'){
  const before=o.count;
  try{command({type:'questScene',id:q.id,key:scene.key});tickTo(s.activity.endsAt,x=>x.activity.type==='idle'||x.hp<=0);while(s.combat&&s.hp>0)tickTo(s.wallAt+30000,x=>!x.combat||x.hp<=0);}
  catch{blocked.add(q.id);}
  if(questProgress(s,q.id)?.objectives.find(x=>x.id===o.id&&x.kind===o.kind)?.count===before)blocked.add(q.id);
  return true;
 }
 if(kind==='explore'){
  if(questProgress(s,q.id)?.objectives.find(x=>x.kind==='event')?.count===0)blocked.add(q.id);
  return true;
 }
 if(kind==='gather'||kind==='item-gather'){
  const object=gatherables(s).find(g=>kind==='gather'?g.id===-o.id:g.items.some(i=>i.id===o.id));
  if(!object){blocked.add(q.id);return true;}
  try{command({type:'gather',id:object.id});tickTo(s.wallAt+Math.max(15000,s.activity.endsAt-s.clock),x=>x.activity.type==='idle'||x.hp<=0);}
  catch{blocked.add(q.id);}
  return true;
 }
 if(s.activity.type!=='hunt')command({type:'hunt',id:target,quest:q.id});
 let loops=0;
 while(loops++<10&&s.level<maxLevel&&s.hp>0){
  const before=kind==='item-hunt'?countItem(s,o.id):s.quests[q.id]?.kills[o.id]||0;
  tickTo(s.wallAt+60000,x=>x.level>s.level||x.hp<=0||x.activity.type==='idle'||(kind==='item-hunt'?countItem(x,o.id)>before:(x.quests[q.id]?.kills[o.id]||0)>before));
  if((kind==='item-hunt'?countItem(s,o.id):s.quests[q.id]?.kills[o.id]||0)>=o.required||s.activity.type==='idle'||s.hp<=0)break;
  if(!lootAndClear())break;
 }
 if(s.activity.type==='hunt'&&s.hp>0){
  command({type:'stop'});
  while(s.combat)tickTo(s.wallAt+10000,x=>!x.combat);
 }
 if(questProgress(s,q.id)?.objectives.find(x=>x.id===o.id&&x.kind===o.kind)?.count===beforeCount){
  blocked.add(q.id);console.log(`BLOCK QUEST #${q.id} ${kind} after ${Math.round((s.wallAt-startedAt)/60000)}m`);
 }
 return true;
}
function chooseMonster(){
 const options=[];
 for(const [nodeId,node] of Object.entries(nodes)){
  if(node.kind!=='wild')continue;
  if(node.min>s.level+2||node.max<s.level-4)continue;
  const travelMs=distance(nodeId);
  if(!Number.isFinite(travelMs))continue;
  for(const id of monsterIdsAt(nodeId)){
   const c=creatures[id];if(!c||c.Rank||c.MinLevel>s.level+1||c.MaxLevel<s.level-1||c.MinLevel<Math.max(1,s.level-3))continue;
   const level=(c.MinLevel+c.MaxLevel)/2;
   const hp=c.MinLevelHealth||100;
   const score=travelMs/1000+Math.abs(level-s.level)*60+Math.log2(Math.max(10,hp))*4+(nodeId===s.location?-80:0);
   options.push({nodeId,id,score,travelMs});
  }
 }
 return options.sort((a,b)=>a.score-b.score)[0];
}
function grindLevel(){
 const target=chooseMonster();if(!target)throw Error(`no hunt target at level ${s.level}, ${s.location}`);
 travel(target.nodeId);if(s.hp<=0)return;
 const level=s.level;
 command({type:'hunt',id:target.id});
 let loops=0;
 while(s.level===level&&s.hp>0&&loops++<1000){
  tickTo(s.wallAt+600000,x=>x.level>level||x.hp<=0||x.activity.type==='idle'||x.activity.reason||x.bag.length>=bagCapacity(x)-2);
  if(s.level>level||s.hp<=0)break;
  if(s.bag.length>=bagCapacity(s)-2||s.pending.length>100||s.activity.reason){if(!lootAndClear())break;}
  if(s.activity.type==='idle')break;
 }
 if(s.activity.type==='hunt'&&s.hp>0){
  command({type:'stop'});
  while(s.combat)tickTo(s.wallAt+10000,x=>!x.combat);
 }
 if(s.level===level&&loops>=1000)throw Error('grind did not level after 1000 minutes');
}
function revive(){
 if(s.combat){
  if(s.hp>0)command({type:'stop'});
  const deadline=s.wallAt+300000;
  while(s.combat&&s.wallAt<deadline)tickTo(s.wallAt+10000,x=>!x.combat);
  if(s.combat)command({type:'abandonCombat',encounterId:s.combat.id});
 }
 if([s,...s.party].some(c=>c.hp<=0)){
  command({type:'revive'});
  tickTo(s.activity.endsAt,x=>x.activity.type==='idle');
 }
}
function refreshParty(minimumLevel=s.level-7,roles=['warrior','priest','mage']){
 for(const role of [...roles].sort((a,b)=>(s.party.find(c=>c.roleId===a)?.level??0)-(s.party.find(c=>c.roleId===b)?.level??0))){
  const member=s.party.find(c=>c.roleId===role);
  if(!member||member.level>=minimumLevel||s.money<100000)continue;
  const oldLevel=member.level;
  try{
   command({type:'recruit',id:role,role:role==='warrior'?'tank':role==='priest'?'healer':role==='mage'?'ranged':'melee',replaceId:member.id});
   meta.replacements??=[];meta.replacements.push({role,from:oldLevel,to:s.level,at:s.wallAt,cost:100000});
   console.log(`REPLACE ${role} ${oldLevel}->${s.level} at ${(s.wallAt/3600000).toFixed(2)}h`);
  }catch{}
 }
}
function reachDungeonEntrance(def){
 for(let attempt=0;attempt<4&&s.location!==def.entrance;attempt++){
  if(s.hp<=0||s.party.some(c=>c.hp<=0))revive();
  travel(def.entrance);
 }
 if(s.hp<=0||s.party.some(c=>c.hp<=0))revive();
 if(s.location!==def.entrance)throw Error(`could not reach ${def.id} entrance after four trips`);
}
async function runDungeon(){
 const levels=[18,26,35,38,44,45,50,51,52,55,58,59],ids=['deadmines','stockades','scarlet-monastery-armory','scarlet-monastery-armory','zul-farrak','zul-farrak','zul-farrak','zul-farrak','zul-farrak','dire-maul-east','dire-maul-east','dire-maul-east'];
 const resumed=!!s.dungeon;
 const index=resumed?ids.findLastIndex((id,i)=>id===s.dungeon.id&&levels[i]<=s.level):levels.findIndex(level=>s.level>=level&&meta.lastDungeonLevel<level);
 if(index<0)return false;
 const id=ids[index],def=dungeonDefinitions[id];
 if(!resumed&&s.dungeonSaves?.[id]?.completedAt){meta.lastDungeonLevel=levels[index];await save();return true;}
 if(!resumed){
  for(const [role,kind] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['mage','ranged']])if(!s.party.some(c=>c.roleId===role))command({type:'recruit',id:role,role:kind});
  refreshParty(Math.max(def.minimumLevel,s.level-2),['warrior','priest','rogue','mage']);
 }
 const started=s.wallAt,atLevel=s.level,kills=s.totals.kills,xp=s.totals.xp,deaths=s.totals.deaths;
 try{
  if(!resumed){
   reachDungeonEntrance(def);
   command({type:'enterDungeon',contentId:id});
  }
  else while(s.combat&&s.hp>0)tickTo(s.wallAt+10000,x=>!x.combat||x.hp<=0);
  if(s.hp<=0||s.party.some(c=>c.hp<=0))revive();
  command({type:'dungeonNext'});
  let loops=0;
  while(s.dungeon&&!s.dungeon.completedAt&&s.wallAt-started<7_200_000&&loops++<300){
   tickTo(s.wallAt+30000,x=>x.dungeon?.completedAt||x.dungeon?.advanceReason||x.hp<=0||!x.combat&&x.bag.length>=bagCapacity(x)-1);
   if(s.hp<=0||s.party.some(c=>c.hp<=0))revive();
   if(s.totals.deaths>deaths+2)break;
   if(s.dungeon?.completedAt)break;
   if(s.dungeon?.advanceReason||s.bag.length>=bagCapacity(s)-1){
    if(s.combat){command({type:'dungeonPause'});while(s.combat)tickTo(s.wallAt+10000,x=>!x.combat);}
    command({type:'leaveDungeon'});
    lootAndClear();equipUpgrades();
    reachDungeonEntrance(def);
    command({type:'enterDungeon',contentId:id});
    command({type:'dungeonNext'});
   }
  }
  const row={id,atLevel,resumed,start:started,end:s.wallAt,duration:s.wallAt-started,xp:s.totals.xp-xp,kills:s.totals.kills-kills,deaths:s.totals.deaths-deaths,completed:!!s.dungeon?.completedAt,cursor:s.dungeon?.cursor};
  meta.dungeons.push(row);await trace({event:'dungeon',...row});
  if(s.dungeon){if(s.combat){command({type:'dungeonPause'});while(s.combat)tickTo(s.wallAt+10000,x=>!x.combat);}command({type:'leaveDungeon'});}
 }catch(error){
  meta.dungeons.push({id,atLevel,error:String(error),duration:s.wallAt-started});
  await trace({event:'dungeon-error',id,error:String(error),entrance:def.entrance,hp:s.hp,activity:s.activity});
  if(s.dungeon&&s.combat)while(s.combat&&s.hp>0)tickTo(s.wallAt+10000,x=>!x.combat||x.hp<=0);
  if(s.dungeon&&!s.combat)try{command({type:'leaveDungeon'});}catch{}
 }
 meta.lastDungeonLevel=levels[index];await save();return true;
}

await trace({event:'start-or-resume',maxLevel,xpMultiplier});
await save();
try{
 while(s.level<maxLevel&&meta.iterations++<100000){
  if(s.hp<=0||s.party.some(c=>c.hp<=0)){revive();continue;}
  if(s.activity.type==='gather'&&!s.activity.target){
   const id=s.activity.questIds?.[0];
   command({type:'stop'});
   meta.gatherWaits??={};
   const waits=meta.gatherWaits[id]=(meta.gatherWaits[id]||0)+1;
   if(waits>=3){blocked.add(+id);console.log(`BLOCK QUEST #${id} gather respawn after ${waits} waits`);continue;}
   tickTo(s.wallAt+420000,x=>x.hp<=0);
   continue;
  }
  if(s.activity.type!=='idle'&&s.activity.type!=='hunt'){
   tickTo(s.wallAt+30000,x=>x.activity.type==='idle'||x.hp<=0);
   continue;
  }
  if(s.activity.type==='hunt')command({type:'stop'});
  if(s.dungeon){await runDungeon();continue;}
  if(!lootAndClear())throw Error('inventory blocked at '+s.location);
  equipUpgrades();train();
  refreshParty();
  for(const id of Object.keys(s.quests))if(blocked.has(+id))try{command({type:'abandon',id:+id});}catch{}
  if(s.wallAt-lastSaveAt>=600000){await save();lastSaveAt=s.wallAt;}
  if(await runDungeon())continue;
  if(finishQuests()){if(s.level%5===0)await save();continue;}
  if(workQuest()){if(s.level%5===0)await save();continue;}
  const questsHere=candidateQuests().filter(x=>x.to===s.location).slice(0,Math.max(0,8-Object.keys(s.quests).length));
  if(questsHere.length){for(const {q} of questsHere)try{command({type:'accept',id:q.entry});}catch{blocked.add(q.entry);}continue;}
  const nextQuest=candidateQuests()[0];
  if(nextQuest&&Object.keys(s.quests).length<8&&nextQuest.travelMs<questTravelBudget()){
   travel(nextQuest.to);
   if(s.hp>0)try{command({type:'accept',id:nextQuest.q.entry});}catch{blocked.add(nextQuest.q.entry);}
   continue;
  }
  const before=s.level;grindLevel();
  if(s.level!==before){await trace({event:'level',from:before,to:s.level,hours:+(s.wallAt/3600000).toFixed(2),kills:s.totals.kills,quests:meta.questTurns});await save();}
  else if(s.hp>0&&s.bag.length>=bagCapacity(s)-2)throw Error('inventory blocked while grinding');
 }
 await save();await trace({event:s.level>=maxLevel?'complete':'iteration-limit',level:s.level});
}catch(error){await save();await trace({event:'error',error:String(error),stack:error.stack});process.exitCode=1;}
