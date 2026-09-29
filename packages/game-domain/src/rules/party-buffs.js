import {stockGoldReagents} from './gold-raid-reagents.js';
import {buffFamily,buffSquad,groupBuffRequests,buffReagents} from './group-buffs.js';
import {marketPrice} from './inventory.js';
import {knownRank,spellInfo,stats,log} from './character.js';
import {nameOf,spells,items} from './catalog.js';
import {beginSpellTiming,spellReady} from './spell-timing.js';
import {classEffect} from './class-mechanics.js';
import {startRecovery} from './recovery.js';
import {combatRole} from './combat-roles.js';
import {raidConsumableChecks,useRaidConsumable} from './raid-consumables.js';

// Assign responsibilities first, then combine compatible assignments into
// reagent-consuming group casts. One blessing per paladin and recipient.
function requests(s){
 const members=[s,...s.party].filter(c=>c.hp>0),result=[],load=new Map(),assigned=new Map();
 const add=(c,target,root)=>{const id=knownRank(c,root);if(id){result.push({c,target,sp:spellInfo(c,id)});load.set(c.id,(load.get(c.id)||0)+1);}};
 for(const target of members){
  for(const [classId,root]of [[8,1459],[5,1243],[5,14752],[5,976],[11,1126],[11,467]]){
   if(root===467&&combatRole(target)!=='tank')continue;
   const casters=members.filter(c=>c.classId===classId&&knownRank(c,root)).sort((a,b)=>spellInfo(b,knownRank(b,root)).SpellLevel-spellInfo(a,knownRank(a,root)).SpellLevel||(load.get(a.id)||0)-(load.get(b.id)||0)||a.id.localeCompare(b.id));
   const key=`${root}:${buffSquad(s,target)}`,caster=assigned.get(key)||casters[0];
   if(caster){assigned.set(key,caster);add(caster,target,root);}
  }
  const used=new Set(),paladins=members.filter(c=>c.classId===2).sort((a,b)=>a.id.localeCompare(b.id));
  const roots=[20217,stats(target).maxMana&&![1,3,4].includes(target.classId)&&combatRole(target)!=='melee'?19742:19740,combatRole(target)==='tank'?20911:1038,19977];
  for(const root of roots){
   const c=paladins.filter(c=>!used.has(c.id)&&knownRank(c,root)).sort((a,b)=>spellInfo(b,knownRank(b,root)).SpellLevel-spellInfo(a,knownRank(a,root)).SpellLevel)[0];
   if(c){used.add(c.id);add(c,target,root);}
  }
 }
 return groupBuffRequests(s,result);
}
function covered(s,{c,target,sp}){
 const buffs=[...Object.values(target.buffs||{}),...(target.classBuffs||[])];
 return buffs.some(b=>(!buffFamily(sp.SpellName).startsWith('Blessing of ')||b.caster===c.id)&&b.until>s.clock&&buffFamily(spells[b.spell]?.SpellName)===buffFamily(sp.SpellName)&&(spells[b.spell]?.SpellLevel||0)>=sp.SpellLevel);
}
export function beginPartyBuffs(s){
 if(!(s.dungeon||s.goldRaid?.active&&s.goldRaid.phase==='camp')||s.combat||s.activity.type!=='idle'||s.goldRaid?.recoverUntil)throw new Error('请在副本内停止推进并结束战斗、休整后下令补增益。');
 if(s.hp<=0)throw new Error('请先复活团长。');
 for(const c of s.party)stockGoldReagents(s,c);
 if(s.dungeon)s.dungeon.autoAdvance=false;
 if(s.goldRaid)s.goldRaid.autoAdvance=false;
 s.activity={type:'partyBuffs',startedAt:s.clock,completed:0,queue:requests(s).filter(r=>r.targets.some(target=>!covered(s,{...r,target}))).map(({c,targets,sp,fallback})=>({caster:c.id,targets:targets.map(t=>t.id),spell:sp.Id,fallback}))};
 s.activity.remaining=s.activity.queue.length;
 s.activity.consumableQueue=[s,...s.party].flatMap(c=>raidConsumableChecks(s,c).filter(r=>r.status==='missing').map(r=>({member:c.id,kind:r.kind,slot:r.slot})));
 s.activity.completedItems=0;
 log(s,'团长指令：全团补 Buff，各职业按已学技能分工。','buff');
}
export function partyBuffTick(s){
 if(s.activity.type!=='partyBuffs')return false;
 if(s.combat){s.activity={type:'idle'};return false;}
 const members=[s,...s.party];
 s.activity.queue=s.activity.queue.filter(r=>members.some(c=>c.id===r.caster&&c.hp>0)&&r.targets.some(id=>members.some(c=>c.id===id&&c.hp>0)));
 const pending=s.activity.queue.map(row=>({row,c:members.find(c=>c.id===row.caster),targets:members.filter(c=>row.targets.includes(c.id)&&c.hp>0)})).map(r=>({...r,sp:spellInfo(r.c,r.row.spell)}));
 s.activity.remaining=pending.length;
 if(!pending.length){
  while(s.activity.consumableQueue.length){
   const request=s.activity.consumableQueue.shift(),c=members.find(c=>c.id===request.member);
   if(c&&useRaidConsumable(s,c,request)){s.activity.completedItems++;return true;}
  }
  const gaps=members.some(c=>raidConsumableChecks(s,c).some(r=>!['ready','dead'].includes(r.status)));
  const reason=gaps?'本轮补 Buff 完成，部分消耗品仍未补齐，请查看检查列表':'全团补 Buff 完成';
  log(s,reason+'。','buff');s.activity={type:'idle',reason};return true;
 }
 const longPending=pending.some(r=>r.sp.durationMs>=600000&&r.targets.some(target=>!covered(s,{...r,target})));
 for(const request of pending){
  const {c,targets,sp,row}=request;const target=targets[0];
  if(targets.every(target=>covered(s,{...request,target}))){s.activity.queue=s.activity.queue.filter(r=>r!==row);continue;}
  if(longPending&&sp.durationMs<600000)continue;
  c.time=s.clock;target.time=s.clock;
  if(c.cast||c.rest||!spellReady(c,sp,s.clock))continue;
  if(!buffReagents(c,sp)||sp.mana>stats(c).maxMana&&row.fallback){
   s.activity.queue=s.activity.queue.filter(r=>r!==row);
   if(row.fallback)s.activity.queue.push(...row.fallback.map(r=>({caster:c.id,targets:[r.target],spell:r.spell})));
   continue;
  }
  if(c.mana<sp.mana){
   if(sp.mana>stats(c).maxMana){s.activity={type:'idle',reason:`${c.name} 法力上限不足，无法施放 ${nameOf('spells',sp.Id)}`};return true;}
   // NPCs pay for ordinary vendor water themselves, never consume the leader's bag.
   const water=[8766,1645,1708,1205,1179,159].find(id=>items[id]?.RequiredLevel<=c.level),cost=water&&marketPrice(water).buy;
   if(c.npcPlayer&&water&&c.money>=cost){
    const ws=spellInfo(c,items[water].spellid_1);
    c.money-=cost;if(c.goldProfile)c.goldProfile.consumableSpent+=cost;
    c.rest={until:s.clock+ws.durationMs,foodUntil:0,waterUntil:s.clock+ws.durationMs,food:0,water:ws.EffectBasePoints1+1,nextFood:s.clock+5000,foodPeriod:5000};
    log(s,`${c.name} 使用 ${nameOf('items',water)} 恢复法力。`,'rest',{actorId:c.id,itemId:water});continue;
   }
   if(c.npcPlayer)continue;
   const settings=s.settings;s.settings={...settings,mana:100};try{startRecovery(s,{},[c]);}finally{s.settings=settings;}continue;
  }
  buffReagents(c,sp,true);beginSpellTiming(c,sp,s.clock);
  const family=buffFamily(sp.SpellName);
  for(const target of targets){
   if([...Object.values(target.buffs||{}),...(target.classBuffs||[])].some(b=>b.until>s.clock&&buffFamily(spells[b.spell]?.SpellName)===family&&(spells[b.spell]?.SpellLevel||0)>sp.SpellLevel))continue;
   // Group and single versions are the same stat family, with source duration.
   const replaced=b=>buffFamily(spells[b.spell]?.SpellName)===family||family.startsWith('Blessing of ')&&b.caster===c.id&&buffFamily(spells[b.spell]?.SpellName)?.startsWith('Blessing of ');
   target.classBuffs=(target.classBuffs||[]).filter(b=>!replaced(b));
   target.auras=(target.auras||[]).filter(a=>!replaced(a));
   target.periodicClass=(target.periodicClass||[]).filter(p=>!replaced(p));
   if(family==='Power Word: Fortitude'&&target.buffs)delete target.buffs.sta;
   if(family==='Arcane Intellect'){
    target.buffs??={};target.buffs.int={kind:'int',amount:sp.EffectBasePoints1+1,spell:sp.Id,until:s.clock+sp.durationMs,caster:c.id};
   }else{
    if(family.startsWith('Blessing of '))c.partyBlessingPrepared=s.clock+sp.durationMs;
    classEffect(s,c,target,{...sp,SpellName:family},[c,target],{});
    for(const b of target.classBuffs||[])if(b.spell===sp.Id)b.caster=c.id;
   }
  }
  log(s,`${c.name} 施放 ${nameOf('spells',sp.Id)}（${targets.length}人）`,'buff',{actorId:c.id,targetId:target.id,targetIds:targets.map(t=>t.id),spellId:sp.Id});
  s.activity.queue=s.activity.queue.filter(r=>r!==row);s.activity.completed++;s.activity.remaining=s.activity.queue.length;return true;
 }
 return true;
}

// Read-only inspection uses the same assignments/family coverage as execution.
// Counts of missing recipients are deliberately separate from queued casts.
export function partyBuffCheckView(s){
 if(s.combat||!(s.dungeon||s.goldRaid?.active&&s.goldRaid.phase==='camp'))return null;
 const actors=[s,...s.party],active=s.activity.type==='partyBuffs',plan=requests(s),assigned=new Map(),queued=new Map();
 const key=(id,sp)=>id+':'+buffFamily(sp.SpellName);
 for(const r of plan)for(const target of r.targets)assigned.set(key(target.id,r.sp),r);
 for(const row of active?s.activity.queue:[]){const c=actors.find(a=>a.id===row.caster);if(!c)continue;const sp=spellInfo(c,row.spell);for(const id of row.targets)queued.set(key(id,sp),{c,sp});}
 const unavailable=new Map();let missing=0,present=0,total=0;
 const members=actors.map(target=>{
  const roots=[1459,1243,14752,976,1126,...(combatRole(target)==='tank'?[467]:[]),20217,stats(target).maxMana&&![1,3,4].includes(target.classId)&&combatRole(target)!=='melee'?19742:19740];
  const desired=new Map(roots.map(root=>[buffFamily(spells[root].SpellName),{sp:spells[root]}]));
  for(const r of plan)if(r.targets.includes(target))desired.set(buffFamily(r.sp.SpellName),r);
  const buffs=[...Object.values(target.buffs||{}),...(target.classBuffs||[])];
  const entries=[...desired].map(([family,base])=>{
   const planned=assigned.get(target.id+':'+family),pending=queued.get(target.id+':'+family),r=pending||planned,c=r?.c,sp=r?.sp||base.sp;
   const existing=buffs.find(b=>b.until>s.clock&&buffFamily(spells[b.spell]?.SpellName)===family);
   const isPresent=target.hp>0&&(r?covered(s,{...r,target}):!!existing);
   let status='ready',reason='已就绪';
   if(!isPresent){
    if(target.hp<=0){status='dead';reason='需先复活';}
    else if(!c){status='unavailable';reason=actors.some(a=>a.hp>0&&a.learned.some(id=>buffFamily(spells[id]?.SpellName)===family))?'圣骑士已分配其他祝福':'无存活成员掌握此增益';}
    else if(c.hp<=0){status='dead';reason=`${c.name} 已倒下`;}
    else if(!buffReagents(c,sp)){status='materials';reason=`${c.name} 缺材料，将改用单体`;}
    else if(sp.mana>stats(c).maxMana){status='unavailable';reason=`${c.name} 法力上限不足`;}
    else if(c.rest||c.mana<sp.mana){status='mana';reason=`${c.name} ${c.rest?'正在饮水':'等待回蓝'}（${Math.floor(c.mana)}/${Math.ceil(sp.mana)}）`;}
    else if(c.cast){status='casting';reason=`${c.name} 正在施法`;}
    else if(!spellReady(c,sp,s.clock)){status='cooldown';reason=`${c.name} 等待公共冷却`;}
    else{status='missing';reason=active?`等待 ${c.name} 施放`:`由 ${c.name} 补充`;}
   }
   if(target.hp>0){total++;if(isPresent)present++;else if(status==='unavailable')unavailable.set(family,{name:nameOf('spells',roots.find(id=>spells[id].SpellName===family)||sp.Id),reason});else missing++;}
   return {name:nameOf('spells',roots.find(id=>spells[id].SpellName===family)||sp.Id),spellId:sp.Id,itemId:null,status,reason,caster:c?.name||null,remaining:isPresent?Math.max(0,(existing?.until||s.clock)-s.clock):0};
  });
  for(const entry of raidConsumableChecks(s,target)){
   entries.push(entry);
   if(target.hp>0){total++;if(entry.status==='ready')present++;else missing++;}
  }
  return {id:target.id,name:target.name,classId:target.classId,squad:buffSquad(s,target)+1,dead:target.hp<=0,missing:entries.filter(e=>e.status!=='ready').length,entries};
 });
 const last=[...s.logs].reverse().find(l=>l.kind==='buff'&&l.spellId&&l.at>=s.activity.startedAt);
 return {active,completed:active?s.activity.completed:0,completedItems:active?s.activity.completedItems:0,remainingItems:active?s.activity.consumableQueue.length:members.flatMap(m=>m.entries).filter(e=>e.itemId&&e.status==='missing').length,remainingCasts:active?s.activity.queue.length:plan.filter(r=>r.targets.some(target=>!covered(s,{...r,target}))).length,missing,present,total,unavailable:[...unavailable.values()],members,lastCast:active&&last?last.text:null};
}
