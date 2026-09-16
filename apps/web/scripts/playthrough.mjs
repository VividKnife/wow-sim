// Reproducible solo playthrough. State changes ONLY through createGame / act / advance.
// This is a gameplay audit, not proof of original-client numerical fidelity.
import {mkdirSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createGame,act,advance,stats,shop} from '../../../packages/game-domain/src/rules/engine.js';
import {quests,items,creatures,creatureLoot,monsterIdsAt,nodes,route,abilities,trainerNodes,spells,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {questProgress,gatherables} from '../../../packages/game-domain/src/rules/quests.js';
import {canEquip,slotOf,countItem,knownRank,spellInfo,bagCapacity} from '../../../packages/game-domain/src/rules/character.js';
import {protectedItem} from '../../../packages/game-domain/src/rules/inventory.js';

const targetLevel=Number(process.argv[2]||20),seed=Number(process.argv[3]||283);
const output=resolve(process.argv[4]||'../../.cache/playthrough');
mkdirSync(output,{recursive:true});
const journal=resolve(output,'commands.jsonl');
if(existsSync(journal))throw new Error('This playthrough directory already contains a run; choose a fresh output directory.');
writeFileSync(journal,'');
let s=createGame('连续试玩',seed,0),commands=0,lastLevel=1,iterations=0;
const summary={seed,targetLevel,method:'Only normal game commands; simulated elapsed time; no granted levels, currency, gear, skills or healing.',checkpoints:[],failures:[],deferred:[]};
const write=row=>appendFileSync(journal,JSON.stringify(row)+'\n');
write({type:'create',name:s.name,seed,now:0});
function checkpoint(){
 if(s.level===lastLevel)return;
 lastLevel=s.level;const row={level:s.level,seconds:s.clock/1000,kills:s.totals.kills,deaths:s.totals.deaths,money:s.money,completed:Object.keys(s.completed).length,learned:s.learned,equipment:Object.fromEntries(Object.entries(s.equipment).map(([slot,i])=>[slot,i.id]))};
 summary.checkpoints.push(row);writeFileSync(resolve(output,`level-${s.level}.json`),JSON.stringify(s));console.log(JSON.stringify(row));
}
function command(action){s=act(s,action,s.wallAt);commands++;write({type:'command',at:s.wallAt,action});checkpoint();}
function wait(ms){const now=s.wallAt+ms;let result;do{result=advance(s,now);s=result.state;}while(!result.complete);write({type:'advance',now});checkpoint();}
function travel(to){if(to===s.location)return;command({type:'travel',to});wait(s.activity.endsAt-s.clock);}
function nearest(places){
 const reachable=places.filter(p=>nodes[p]).flatMap(id=>{try{return[{id,duration:route(s.location,id).duration}];}catch{return[];}});
 reachable.sort((a,b)=>a.duration-b.duration);
 if(!reachable.length)throw new Error(`No reachable service from ${s.location}`);
 return reachable[0].id;
}
function score(id){const i=items[id];if(!i||!canEquip(s,i)||!i.InventoryType)return -1;let score=i.armor*.04+(i.dmg_min1+i.dmg_max1)/2/(i.delay/1000||1);for(let n=1;n<=10;n++)score+=( {5:3,7:2,6:1.5}[i['stat_type'+n]]||.05)*i['stat_value'+n];return score;}
function equip(){for(const i of [...s.bag]){const data=items[i.id];if(data.class===1&&data.ContainerSlots&&!data.BagFamily&&s.bags.length<4){command({type:'equipBag',uid:i.uid});continue;}if(score(i.id)>score(s.equipment[slotOf(data)]?.id)&&score(i.id)>=0){if(slotOf(data)===17&&items[s.equipment[16]?.id]?.InventoryType===17)continue;command({type:'equip',uid:i.uid});}}}
function questViews(){return Object.keys(quests).map(id=>questProgress(s,+id));}
function sell(){
 if(!shop(s).length)return;
 const needed=new Set(questViews().filter(q=>!q.completed).flatMap(q=>q.objectives.filter(o=>o.kind==='item').map(o=>o.id)));
 const provisionIds=new Set([84,85].map(kind=>s.bag.filter(i=>spells[items[i.id].spellid_1]?.EffectApplyAuraName1===kind&&items[i.id].RequiredLevel<=s.level).sort((a,b)=>items[b.id].RequiredLevel-items[a.id].RequiredLevel||b.count-a.count)[0]?.id));
 for(const i of [...s.bag]){const item=items[i.id],aura=spells[item.spellid_1]?.EffectApplyAuraName1;
  if(item.SellPrice>0&&!protectedItem(i)&&!needed.has(i.id)&&!item.startquest&&(![84,85].includes(aura)||!provisionIds.has(i.id))&&item.class!==12&&item.class!==1)command({type:'sell',uid:i.uid});
 }
 while(s.bags.length<4&&s.bag.length<bagCapacity(s)){
  const offer=shop(s).filter(o=>items[o.id].class===1&&!items[o.id].BagFamily&&items[o.id].ContainerSlots>0&&o.price<=s.money-1000).sort((a,b)=>items[b.id].ContainerSlots-items[a.id].ContainerSlots||a.price-b.price)[0];
  if(!offer)break;command({type:'buy',id:offer.id,count:1});equip();
 }
 if(s.pending.length&&s.bag.length<bagCapacity(s))command({type:'loot'});
}
function recover(){if(s.combat)throw new Error('Recovery requested in combat');if(s.hp<=0){command({type:'revive'});wait(10000);}if(s.activity.type==='hunt')command({type:'stop'});command({type:'rest'});let n=0;while((s.hp<stats(s).maxHp||s.mana<stats(s).maxMana)&&n++<300)wait(2000);if(n>=300)throw new Error('Recovery exceeded ten minutes');}
function supplies(){
 for(const water of [true,false]){const id=knownRank(s,water?5504:587);if(!id)continue;const sp=spellInfo(s,id);let attempts=0;while(countItem(s,sp.EffectItemType1)<6&&s.bag.length<bagCapacity(s)&&attempts++<4){if(s.mana<sp.mana)recover();command({type:'conjure',water});wait(s.activity.endsAt-s.clock);}}
}
function train(){if(!trainerNodes.includes(s.location))return;
 const priority=['Conjure Water','Fireball','Conjure Food','Frostbolt','Frost Nova','Fire Blast','Frost Armor','Arcane Intellect'];
 for(const name of priority)for(const a of abilities.filter(a=>a.name===name&&a.requiredLevel<=s.level&&!s.learned.includes(a.spellId)).sort((a,b)=>a.requiredLevel-b.requiredLevel))if(s.money>=a.costCopper)command({type:'train',id:a.spellId});
}
function talentsAndBuffs(){
 for(const name of ['Improved Fireball','Ignite','Improved Fire Blast']){const t=Object.values(talents).find(t=>t.name===name);if(!t)continue;while(Object.values(s.talents).reduce((a,b)=>a+b,0)<s.level-9&&(s.talents[t.id]||0)<t.maxRank){try{command({type:'talent',id:t.id});}catch{break;}}}
 for(const first of [168,1459]){const id=knownRank(s,first);if(!id)continue;if(Object.values(s.buffs).some(b=>b.spell===id&&b.until>s.clock+60000))continue;const sp=spellInfo(s,id);if(s.mana<sp.mana)recover();if(s.globalCooldown>s.clock)wait(s.globalCooldown-s.clock);command({type:'cast',id});}
}
function fight(id){recover();supplies();talentsAndBuffs();command({type:'hunt',id});
 let n=0;while(!s.combat&&s.activity.type==='hunt'&&n++<600)wait(100);
 if(!s.combat)return false;command({type:'stop'});n=0;while(s.combat&&n++<600)wait(1000);
 if(s.combat)throw new Error('A single combat exceeded ten minutes');if(s.hp<=0)summary.failures.push({kind:'death',level:s.level,entry:id,at:s.clock,logs:s.logs.slice(-30)});return s.hp>0;
}
const blocked=new Set();
try{
 command({type:'settings',health:85,mana:85});
 while(s.level<targetLevel&&iterations++<15000){
  if(s.hp<=0)recover();equip();sell();train();
  if(s.bag.length>=bagCapacity(s)||s.pending.length){const vendor=nearest(Object.keys(nodes).filter(location=>shop({...s,location}).length));travel(vendor);equip();sell();if(s.bag.length>=bagCapacity(s))throw new Error('Bag full after selling; inspect checkpoint');continue;}
  const local=questViews();const turn=local.find(q=>q.active&&q.complete&&q.canTurnIn);
  if(turn){const choice=[...turn.choices].sort((a,b)=>(score(b.id)-score(a.id))||items[b.id].SellPrice-items[a.id].SellPrice)[0]?.id;command({type:'turnin',id:turn.id,choice});continue;}
  const accept=local.find(q=>q.canAccept&&!q.repeatable&&q.level<=s.level+1&&Object.keys(s.quests).length<18);
  if(accept){command({type:'accept',id:accept.id});continue;}
  const gather=gatherables(s)[0];if(gather){command({type:'gather',id:gather.id});wait(5000);continue;}
  const goals=[];
  for(const q of local.filter(q=>q.active&&!blocked.has(q.id)&&q.level<=s.level+1)){
   if(q.complete){for(const to of q.endLocations)goals.push({kind:'turnin',q,to});continue;}
   for(const o of q.objectives.filter(o=>o.count<o.required))for(const to of o.locations){
    if(o.kind==='event'||o.kind==='object')goals.push({kind:o.kind,q,to});
    else{const targets=monsterIdsAt(to).filter(id=>{const c=creatures[id];return !c.Rank&&c.MaxLevel<=s.level+1&&(o.kind==='kill'?[id,c.KillCredit1,c.KillCredit2].includes(o.id):(creatureLoot[c.LootId]||[]).some(r=>r.item===o.id&&r.mincountOrRef>0));});
     for(const id of targets)goals.push({kind:'fight',q,to,id});
     if(o.kind==='item'&&!targets.length)goals.push({kind:'gather',q,to});
    }
   }
  }
  goals.sort((a,b)=>route(s.location,a.to).duration-route(s.location,b.to).duration||a.q.level-b.q.level);
  const goal=goals[0];if(goal){
   if(goal.to!==s.location){travel(goal.to);continue;}
   if(goal.kind==='fight'){if(!fight(goal.id))blocked.add(goal.q.id);continue;}
   if(goal.kind==='gather'&&gatherables(s).length){continue;}
   // Do not fake scripted event credit or unavailable objects. Record for separate coverage.
   blocked.add(goal.q.id);summary.deferred.push({id:goal.q.id,reason:goal.kind,location:s.location,level:s.level});continue;
  }
  const available=local.filter(q=>q.available&&!q.repeatable&&!blocked.has(q.id)&&q.level<=s.level+1).flatMap(q=>q.startLocations).filter(n=>n!==s.location);
  if(available.length){travel(nearest(available));continue;}
  const affordable=abilities.some(a=>a.requiredLevel<=s.level&&!s.learned.includes(a.spellId)&&s.money>=a.costCopper&&['Fireball','Conjure Water','Conjure Food'].includes(a.name));
  if(affordable&&!trainerNodes.includes(s.location)){travel(nearest(trainerNodes));continue;}
  const grind=Object.keys(nodes).flatMap(to=>monsterIdsAt(to).filter(id=>!creatures[id].Rank&&creatures[id].MaxLevel<=s.level&&creatures[id].MinLevel>=s.level-2).map(id=>({to,id}))).sort((a,b)=>route(s.location,a.to).duration-route(s.location,b.to).duration||creatures[b.id].MinLevel-creatures[a.id].MinLevel)[0];
  if(!grind)throw new Error('No safe experience target');travel(grind.to);fight(grind.id);
 }
 if(s.level<targetLevel)throw new Error('Iteration limit reached');
}catch(error){summary.error=error.stack;console.error(error.message);process.exitCode=1;}
finally{summary.final={level:s.level,xp:s.xp,seconds:s.clock/1000,money:s.money,totals:s.totals,completed:Object.keys(s.completed).map(Number),active:Object.keys(s.quests).map(Number),commands,iterations};writeFileSync(resolve(output,'final-state.json'),JSON.stringify(s));writeFileSync(resolve(output,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary.final));}
