import {roles,createNpcMember} from './party.js';
import {items,quests,questLinks,creatureLocations,nodes,nameOf,xpTable,classDefinitions,raceDefinitions} from './catalog.js';
import {rng,stats,canEquip,slotOf} from './character.js';
import {combatRole} from './combat-roles.js';
import {equipmentUpgrade,equipNpcItem,npcEquipmentValue,npcWeaponAllowed} from './npc-equipment.js';
import {dungeonJournal} from './dungeon-journal.js';
import {partyUnlocked} from './party-unlock.js';

export const npcCommands=['npcMatchSupply','npcVisit','npcRefresh','npcFriend','npcGroup','npcRecommend','npcLootPolicy'];
export const NPC_BATCH_SIZE=6,NPC_REFRESH_MS=5*60*1000;
// Eight residents per class provide enough alternatives for 40-player raid compositions.
const names=[
 '盾墙还有三秒','圣光不加班','风行者的箭袋','潜行摸个箱','奶你一口先', '石蹄听雷','面包管够','糖在包里','月爪·林歌',
 '格雷恩·铁砧','洛瑞安·晨誓','短弓与长路','背后有只贼','塞蕾娜·白烛', '莫戈·雷语','诺兰·霜纹','维萨·暮契','熊德不迷路',
 '冲锋别关门','阿尔文·银誓','豹哥先上','匕首不蘸糖','星光落肩', '图腾插这里','寒冰搓到天亮','灵魂石已绑','伊芙·苔枝',
 '布洛克·石盾','审判之后喝茶','林深见兽','影步拾荒者','祈祷别空蓝', '卡鲁·风鼓','米瑞尔·蓝焰','鸦羽契约','咕咕借过',
 '拉稳再开打','曦光守誓人','弹药还剩两组','黑巷无声','伊莲·晨祷', '风怒又触发了','传送门收摊','小鬼别开怪','橡木与月光',
 '凯恩·赤铁','圣印未熄','荒野巡哨','消失等冷却','最后一口大奶',
 '雷雨将至','冰霜与面包','午夜契约','月下橡树',
 '黑铁壁垒','晨曦圣印','猎鹰归来','影牙','晨露祷言','石环图腾','霜火之心','灰烬灵魂','山林守望',
 '不动如山','圣光长明','箭无虚发','无声匕首','白羽医者','雷鸣回响','奥术星河','暗火之誓','翡翠之梦',
];
const styles=[{id:'steady',name:'稳健派',quote:'等坦克接稳，我们慢慢打。'},{id:'keen',name:'热心派',quote:'缺人喊我，任务也可以一起做。'},{id:'collector',name:'装备控',quote:'有提升才需求，装备到手就毕业。'}];
const cadence=20*60*1000,maxCatchup=2*60*60*1000;
const trainingFields=['learned','talents','rules','strategyPolicy','autoBuffs','potions','npcBuild'];
const npcTraining=c=>Object.fromEntries(trainingFields.map(key=>[key,c[key]]));
function seedOf(text){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0||1;}
const note=(p,text)=>{p.history.unshift({sequence:++p.events,text});p.history=p.history.slice(0,12);};
const startingLoadouts=new Map();
function initialEquipment(c,index){
 const key=`${c.classId}:${c.raceId}:${c.level}:${combatRole(c)}:${c.npcBuild.skill}:${c.npcBuild.temperament}`;
 const dualWield=c.learned.includes(674)&&(c.classId===4||c.classId===1&&combatRole(c)==='melee');
 if(!startingLoadouts.has(key)){
  const naked={...c,equipment:{}},bySlot={},offhand=[];
  for(const item of Object.values(items)){
   if(![2,3].includes(item.Quality)||item.ItemLevel>c.level+3||item.ItemLevel<Math.max(10,c.level-8)||item.companionKit||item.raidReward||item.RequiredSkill||item.startquest||!canEquip(c,item))continue;
   if(!npcWeaponAllowed(c,item))continue;
   if(combatRole(c)==='tank'&&c.classId!==11&&(item.InventoryType===17||slotOf(item)===17&&item.InventoryType!==14))continue;
   if(![2,4].includes(item.class)||!item.InventoryType||[4,19].includes(item.InventoryType))continue;
   const score=npcEquipmentValue(naked,{[slotOf(item)]:{id:item.entry}});
   const slot=slotOf(item);(bySlot[slot]??=[]).push({id:item.entry,value:score});
   if(dualWield&&item.class===2&&[13,22].includes(item.InventoryType))offhand.push({id:item.entry,value:score});
  }
  const pools=Object.entries(bySlot).map(([slot,pool])=>({slot:Number(slot),ids:pool.sort((a,b)=>b.value-a.value||a.id-b.id).slice(0,5).map(x=>x.id)})).sort((a,b)=>a.slot-b.slot);
  if(offhand.length)pools.push({slot:17,ids:offhand.sort((a,b)=>b.value-a.value||a.id-b.id).slice(0,5).map(x=>x.id)});
  startingLoadouts.set(key,pools);
 }
 c.equipment={};const random={rngState:seedOf(c.id)};
 for(const pool of startingLoadouts.get(key)){
  const ids=[...pool.ids],offset=Math.floor(rng(random)*ids.length);
  for(let i=0;i<ids.length;i++){
   const id=ids[(offset+i)%ids.length],plan=equipmentUpgrade(c,items[id]);
   if(pool.slot===17){
    if(!c.equipment[16]||items[c.equipment[16].id].InventoryType===17||items[id].maxcount>0&&Object.values(c.equipment).filter(e=>e.id===id).length>=items[id].maxcount)continue;
    c.equipment[17]={id,uid:`${c.id}:initial:17`,count:1,durability:items[id].MaxDurability,bound:true,ownerId:c.id};
    break;
   }
   if(!plan.need)continue;
   equipNpcItem(c,{id,uid:`${c.id}:initial:${pool.slot}`,count:1,durability:items[id].MaxDurability},plan);
   if([11,13].includes(pool.slot)){
    const second=ids.find(other=>other!==id&&equipmentUpgrade(c,items[other]).need);
    if(second)equipNpcItem(c,{id:second,uid:`${c.id}:initial:${pool.slot+1}`,count:1,durability:items[second].MaxDurability});
   }
   break;
  }
 }
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
}
function behaviorFor(index){return {skill:index%7===0?'novice':(index+Math.floor(index/9))%3===0?'expert':'regular',temperament:styles[(index+Math.floor(index/9))%styles.length].id,spending:['saver','value','collector','whale','impulsive'][index%5]};}
function buildUnit(s,index,level,initial=true,behavior=behaviorFor(index)){
 const def=roles[index%roles.length],role=def.roles[Math.floor(index/roles.length)%def.roles.length];
 const faction=raceDefinitions.find(r=>r.id===s.raceId)?.faction;
 const classDef=classDefinitions.find(c=>c.id===def.classId);
 const raceId=classDef.races.find(id=>raceDefinitions.find(r=>r.id===id)?.faction===faction)||classDef.races[0];
 const host={id:s.id,level,clock:s.clock,location:s.location,itemSequence:0,logs:[],logSequence:0,party:[],money:0,bag:[],bags:[]};
 const c=createNpcMember(host,def.id,{name:names[index%names.length]+(index>=names.length?`·${Math.floor(index/names.length)+1}`:''),role,raceId,behavior});
 c.id=`npc:${s.id}:${index+1}`;c.growthPolicy='npcPlayer';c.npcPlayer=true;c.professions={};
 c.itemSequence=0;
 for(const key of ['bag','bags','bank','pending','auctions','raidCollection','raidPendingEquipment'])c[key]??=[];
 for(const [slot,item] of Object.entries(c.equipment)){item.uid=`${c.id}:starter:${slot}`;item.ownerId=c.id;}
 if(initial)initialEquipment(c,index);
 if(c.classId===3){c.ammunition={2512:2000,2516:2000};c.ammoPolicy={enabled:false,target:2000};}
 return c;
}
function newResident(s,index){
 const unit=buildUnit(s,index,s.level),behavior=behaviorFor(index);
 return {id:unit.id,index,unit,friend:false,personality:styles.find(style=>style.id===behavior.temperament),runs:0,events:0,history:[],completedQuests:[],rngState:seedOf(unit.id),lastProgressWall:s.wallAt,steps:0,wallet:Math.round((45+(index*137)%650)*(s.level/60))*10000,raidProfile:{personality:behavior.spending,skill:behavior.skill},raidRuns:0};
}
export function ensureNpcWorld(s,population=names.length){
 if(s.npcPlayer||s.growthPolicy==='companion'||!partyUnlocked(s))throw new Error('主角达到10级后可邀请地下城 NPC 玩家。');
 if(!s.npcWorld)s.npcWorld={selection:[],autoLoot:false,residents:[],board:{ids:[],shown:{},rngState:seedOf(`${s.id}:hall`),refreshAt:0,sequence:0}};
 const world=s.npcWorld,indices=new Set(world.residents.map(p=>p.index));
 for(let index=0;index<population;index++)if(!indices.has(index)){
  const p=newResident(s,index);note(p,'开始新的冒险，期待结识同行的伙伴。');world.residents.push(p);
 }
 if(population>=6&&!world.board.ids.length)refreshBoard(s);
 return world;
}
// Demand replenishment uses the requesting character's actual level and a
// separate identity sequence. Existing NPCs keep their level, items and history.
export const NPC_MATCH_SUPPLY={levelSpread:5,target:{tank:2,healer:2,dps:6},maximumResidents:192};
export function ensureNpcMatchSupply(s,minimumLevel=Math.max(10,s.level-5),maximumLevel=Math.min(60,s.level+5),unavailableIds=[]){
 if(!Number.isInteger(minimumLevel)||!Number.isInteger(maximumLevel)||minimumLevel<10||maximumLevel>60||minimumLevel>s.level||maximumLevel<s.level)throw new Error('NPC 匹配等级范围无效。');
 minimumLevel=Math.max(minimumLevel,s.level-5);maximumLevel=Math.min(maximumLevel,s.level+5);
 if(!Array.isArray(unavailableIds)||unavailableIds.length>192||unavailableIds.some(id=>typeof id!=='string'))throw new Error('NPC 预留名单无效。');
 const world=ensureNpcWorld(s,0),active=activeNpcIds(s);for(const id of unavailableIds)active.add(id);
 const group=unit=>['tank','healer'].includes(combatRole(unit))?combatRole(unit):'dps';
 const eligible=world.residents.filter(p=>!active.has(p.id)&&p.unit.hp>0&&p.unit.level>=minimumLevel&&p.unit.level<=maximumLevel);
 // Every standby role must fit ONE five-level window. Counting a level-15
 // tank together with a level-25 healer for a level-20 player is not supply.
 let deficits,totalMissing=Infinity;
 for(let lower=minimumLevel;lower<=s.level;lower++){
  const upper=Math.min(maximumLevel,lower+NPC_MATCH_SUPPLY.levelSpread);if(upper<s.level)continue;
  const missing=Object.entries(NPC_MATCH_SUPPLY.target).map(([role,target])=>[role,Math.max(0,target-eligible.filter(p=>p.unit.level>=lower&&p.unit.level<=upper&&group(p.unit)===role).length)]);
  const total=missing.reduce((sum,[,count])=>sum+count,0);
  if(total<totalMissing){deficits=missing;totalMissing=total;}
 }
 const additional=world.residents.filter(p=>p.index>=names.length).length;
 if(additional+totalMissing>NPC_MATCH_SUPPLY.maximumResidents-names.length)throw new Error('NPC 候选池已满，请等待现有队员结束活动。');
 let cursor=Math.max(names.length,...world.residents.map(p=>p.index+1));
 const additions=[];
 for(const [role,missing] of deficits){
  for(let count=0;count<missing;count++){
   // Choose a class/build that really implements the required role. No role
   // label overrides, level scaling, borrowed assets or combat RNG draws.
   let def=roles[cursor%roles.length],selected=def.roles[Math.floor(cursor/roles.length)%def.roles.length];
   while((['tank','healer'].includes(selected)?selected:'dps')!==role){cursor++;def=roles[cursor%roles.length];selected=def.roles[Math.floor(cursor/roles.length)%def.roles.length];}
   const index=cursor++,profile=newResident(s,index);
   note(profile,'响应地下城查找器的同行招募。');additions.push(profile);
  }
 }
 world.residents.push(...additions);
 if(!world.board.ids.length)refreshBoard(s);
 return world;
}
function refreshBoard(s){
 const w=s.npcWorld,b=w.board,previous=new Set(b.ids),chosen=[];
 // A separate random stream keeps browsing independent of combat and adventures.
 const order=w.residents.map(p=>({p,tie:rng(b)}));
 const group=p=>['tank','healer'].includes(combatRole(p.unit))?combatRole(p.unit):'dps';
 for(const role of ['tank','healer','dps','dps','dps','dps']){
  const classes=new Set(chosen.map(p=>p.unit.classId));
  const pool=order.filter(({p})=>group(p)===role&&!chosen.includes(p));
  pool.sort((a,c)=>Number(previous.has(a.p.id))-Number(previous.has(c.p.id))||(b.shown[a.p.id]||0)-(b.shown[c.p.id]||0)||Number(classes.has(a.p.unit.classId))-Number(classes.has(c.p.unit.classId))||a.tie-c.tie);
  chosen.push(pool[0].p);
 }
 b.ids=chosen.map(p=>p.id);for(const id of b.ids)b.shown[id]=(b.shown[id]||0)+1;
 b.refreshAt=s.wallAt+NPC_REFRESH_MS;b.sequence++;
}
const rewardSources=Object.values(quests).filter(q=>q.QuestLevel>0&&q.QuestLevel<=60&&questLinks[q.entry]?.ends?.some(e=>e.type==='creature'&&(creatureLocations[e.id]||[]).some(id=>nodes[id])));
function questEvent(p){
 const c=p.unit,pool=rewardSources.filter(q=>q.MinLevel<=c.level&&q.QuestLevel<=c.level+2&&!p.completedQuests.includes(q.entry)&&(!q.RequiredClasses||(q.RequiredClasses&(1<<(c.classId-1))))&&(!q.RequiredRaces||(q.RequiredRaces&(1<<(c.raceId-1))))&&(!q.PrevQuestId||q.PrevQuestId<0||p.completedQuests.includes(q.PrevQuestId)));
 if(!pool.length){note(p,'在城中休整，研究下一次冒险的配装。');return;}
 const quest=pool[Math.floor(rng(p)*pool.length)];p.completedQuests.push(quest.entry);
 const rewardIds=[...[1,2,3,4].map(n=>quest['RewItemId'+n]),...[1,2,3,4,5,6].map(n=>quest['RewChoiceItemId'+n])].filter(id=>items[id]);
 const upgrades=rewardIds.map(id=>({id,plan:equipmentUpgrade(c,items[id])})).filter(x=>x.plan.need).sort((a,b)=>b.plan.improvement-a.plan.improvement);
 const upgrade=upgrades[0];
 if(upgrade){equipNpcItem(c,{id:upgrade.id,uid:`${p.id}:quest:${quest.entry}`,count:1,durability:items[upgrade.id].MaxDurability},upgrade.plan);note(p,`完成「${nameOf('quests',quest.entry)}」，换上${nameOf('items',upgrade.id)}。`);}
 else note(p,`完成「${nameOf('quests',quest.entry)}」。`);
 p.wallet+=Math.max(0,quest.RewOrReqMoney||0);
}
function dungeonEvent(s,p){
 const unlocked=s.npcWorld.defeatedBosses||{},pool=[];
 for(const dungeon of dungeonJournal.filter(d=>d.playable))for(const boss of dungeon.bosses){
  if(!unlocked[dungeon.id]?.[boss.id]||p.unit.level<dungeon.recommendedLevel)continue;
  for(const loot of boss.loot)if(items[loot.id]&&items[loot.id].Quality<=3&&!loot.shared)pool.push({id:loot.id,dungeon:dungeon.name,boss:boss.name});
 }
 if(!pool.length)return false;
 const reward=pool[Math.floor(rng(p)*pool.length)],plan=equipmentUpgrade(p.unit,items[reward.id]);
 if(plan.need&&rng(p)<.4){equipNpcItem(p.unit,{id:reward.id,uid:`${p.id}:outing:${p.steps}`,count:1,durability:items[reward.id].MaxDurability},plan);note(p,`与其他冒险者挑战${reward.dungeon}，获得${nameOf('items',reward.id)}。`);}
 else note(p,`与其他冒险者挑战${reward.dungeon}，这次没有获得提升。`);
 return true;
}
const activeNpcIds=s=>new Set(s.dungeon||s.goldRaid?.active?s.party.filter(c=>c.npcPlayer).map(c=>c.id):[]);
export function nextNpcWorldProgressAt(s){
 const active=activeNpcIds(s);
 return (s.npcWorld?.residents||[]).reduce((at,p)=>active.has(p.id)?at:Math.min(at,p.lastProgressWall+cadence),Infinity);
}
export function progressNpcWorld(s){
 const world=s.npcWorld;if(!world)return;
 const active=activeNpcIds(s);
 for(const p of world.residents){
  const elapsed=Math.max(0,s.wallAt-p.lastProgressWall);
  if(active.has(p.id)){p.lastProgressWall=s.wallAt;continue;}
  const budget=Math.min(maxCatchup,elapsed),steps=Math.floor(budget/cadence);
  if(!steps)continue;
  p.lastProgressWall=s.wallAt-(budget%cadence);
  for(let i=0;i<steps;i++){
   p.steps++;p.wallet+=Math.max(100, p.unit.level*25);
   if(p.unit.level<s.level&&p.steps%2===0){
    const old=p.unit,fresh=buildUnit(s,p.index,old.level+1,false,{skill:p.raidProfile.skill,temperament:p.personality.id,spending:p.raidProfile.personality});
    // Training updates skills and talents, never replaces earned equipment.
    Object.assign(old,{...npcTraining(fresh),level:fresh.level,xp:0});
    note(p,`冒险历练升至${old.level}级，学习了新的职业技能。`);
   }
   if(p.steps%3!==0||!dungeonEvent(s,p))questEvent(p);
  }
  const st=stats(p.unit);p.unit.hp=st.maxHp;p.unit.mana=st.maxMana;
 }
}
export function syncNpcWorld(s){
 if(s.sharedParty){
  for(const owner of [s,...s.party].filter(c=>s.sharedParty.participantIds.includes(c.id))){
   const own=new Set(owner.npcWorld?.residents.map(p=>p.id)||[]);
   syncNpcWorld({...owner,sharedParty:null,clock:s.clock,wallAt:s.wallAt,dungeon:s.dungeon,party:s.party.filter(c=>own.has(c.id))});
  }
  return;
 }
 if(!s.npcWorld)return;
 if(s.dungeon){s.npcWorld.defeatedBosses??={};s.npcWorld.defeatedBosses[s.dungeon.id]={...s.npcWorld.defeatedBosses[s.dungeon.id],...s.dungeon.defeatedBosses};}
 for(const c of s.party||[]){
  if(!c.npcPlayer)continue;
  const p=s.npcWorld.residents.find(p=>p.id===c.id);if(!p)continue;
  // Preserve durable character data, not the entire battle object graph.
  for(const key of ['level','xp','itemSequence','equipment','bag',...trainingFields,'hunterPet','ammunition','raidCollection','raidPendingEquipment'])if(c[key]!==undefined)p.unit[key]=structuredClone(c[key]);
  if(c.goldNpc)p.wallet=c.money;
  p.lastProgressWall=s.wallAt;
 }
}
export function selectedDungeonMembers(s){
 if(s.sharedParty||s.dungeon||!s.npcWorld?.selection)return s.party.filter(c=>!c.goldNpc);
 return s.npcWorld.selection.map(id=>s.party.find(c=>c.id===id)||s.npcWorld.residents.find(p=>p.id===id)?.unit).filter(c=>c&&c.npcPlayer&&!c.goldNpc);
}
export function npcAction(s,a){
 if(s.combat||s.dungeon||s.goldRaid?.active||s.activity.type!=='idle')throw new Error('请结束当前活动并离开副本后再安排冒险者。');
 const world=ensureNpcWorld(s,a.type==='npcVisit'?names.length:0);progressNpcWorld(s);
 if(a.type==='npcMatchSupply'){
  ensureNpcMatchSupply(s,a.minimumLevel,a.maximumLevel,a.unavailableIds);
 }else if(a.type==='npcRefresh'){
  ensureNpcMatchSupply(s);
  if(s.wallAt<world.board.refreshAt)throw new Error(`旅店正在联络下一批冒险者，请在${Math.ceil((world.board.refreshAt-s.wallAt)/1000)}秒后再来。`);
  refreshBoard(s);
 }else if(a.type==='npcFriend'){
  const p=world.residents.find(p=>p.id===a.id);if(!p||typeof a.friend!=='boolean')throw new Error('冒险者或好友设置无效。');p.friend=a.friend;
 }else if(a.type==='npcGroup'){
  if(a.memberIds===null){world.selection=[];return;}
  if(!Array.isArray(a.memberIds)||a.memberIds.length>4||new Set(a.memberIds).size!==a.memberIds.length||a.memberIds.some(id=>!world.residents.some(p=>p.id===id)))throw new Error('请选择至多四名不同的同行成员。');
  world.selection=[...a.memberIds];
 }else if(a.type==='npcRecommend'){
  ensureNpcMatchSupply(s);
  const selectedIds=new Set(selectedDungeonMembers(s).map(c=>c.id));
  const chosen=a.keep?[...selectedIds]:[],available=world.residents.filter(p=>p.friend||p.runs>0||world.board.ids.includes(p.id)||selectedIds.has(p.id)).sort((a,b)=>Number(b.friend)-Number(a.friend)||b.runs-a.runs||a.index-b.index);
  const group=role=>role==='tank'||role==='healer'?role:'dps';
  const count=role=>[s,...chosen.map(id=>s.party.find(c=>c.id===id)||world.residents.find(p=>p.id===id)?.unit)].filter(c=>c&&group(combatRole(c))===role).length;
  for(const role of ['tank','healer','dps'])while(chosen.length<4&&count(role)<({tank:1,healer:1,dps:3}[role])){
   const p=available.find(p=>!chosen.includes(p.id)&&group(combatRole(p.unit))===role);if(!p)break;chosen.push(p.id);
  }
  world.selection=chosen;
 }else if(a.type==='npcLootPolicy'){
  if(typeof a.auto!=='boolean')throw new Error('分装设置无效。');world.autoLoot=a.auto;
 }
}
/** @param {any} s @param {string[] | null} [memberIds] */
export function npcRunStarted(s,memberIds=null){
 for(const c of s.party.filter(c=>c.npcPlayer&&(!memberIds||memberIds.includes(c.id)))){
  const owner=npcOwner(s,c.id),p=owner.npcWorld.residents.find(p=>p.id===c.id);p.runs++;note(p,`与你第${p.runs}次组队，前往${dungeonJournal.find(d=>d.id===s.dungeon.id)?.name||s.dungeon.id}。`);
  const training=buildUnit(owner,p.index,c.level,false,{skill:p.raidProfile.skill,temperament:p.personality.id,spending:p.raidProfile.personality});
  Object.assign(c,npcTraining(training));
  if(c.classId===3)for(const id of [2512,2516]){const missing=Math.max(0,2000-(c.ammunition?.[id]||0)),cost=Math.ceil(missing/200)*10;if(p.wallet>=cost){p.wallet-=cost;c.ammunition??={};c.ammunition[id]=2000;}}
  c.location=s.location;c.time=s.clock;
 }
}
function npcOwner(s,id){
 const owner=[s,...s.party].find(c=>c.npcWorld?.residents.some(p=>p.id===id));
 if(!owner)throw new Error('冒险者缺少所属角色。');
 return owner;
}
export function creditNpcMoney(s,c,amount){
 const p=npcOwner(s,c.id).npcWorld.residents.find(p=>p.id===c.id);
 if(c.goldNpc){c.money+=amount;p.wallet=c.money;}
 else p.wallet+=amount;
}
export function npcAward(s,c,item,need){
 const p=npcOwner(s,c.id).npcWorld.residents.find(p=>p.id===c.id);
 if(need&&equipNpcItem(c,item)){note(p,`与你冒险获得${nameOf('items',item.id)}，已换装。`);}
 else{p.wallet+=Math.max(0,items[item.id].SellPrice||0)*item.count;note(p,`贪婪获得${nameOf('items',item.id)}，出售用于旅途补给。`);}
 syncNpcWorld(s);
}
export function npcWorldView(s){
 const w=s.npcWorld,selected=selectedDungeonMembers(s),active=!!s.dungeon||!!s.goldRaid?.active;
 const member=c=>({id:c.id,name:c.name,classId:c.classId,level:c.level,role:combatRole(c),npc:!!c.npcPlayer,hp:c.hp});
 return {unlocked:partyUnlocked(s)&&!s.npcPlayer&&s.growthPolicy!=='companion',ready:!!w,locked:!!s.combat||active||s.goldRaid?.active||s.activity.type!=='idle',autoLoot:!!w?.autoLoot,selected:selected.map(member),
  total:w?.residents.length||names.length,board:w?{ids:w.board.ids,sequence:w.board.sequence,remaining:Math.max(0,w.board.refreshAt-s.wallAt),cooldown:NPC_REFRESH_MS}:null,
  residents:(w?.residents||[]).map(p=>{const c=s.party.find(c=>c.id===p.id)||p.unit;return {...member(c),friend:p.friend,personality:p.personality,runs:p.runs,history:p.history,wallet:c.goldNpc?c.money:p.wallet,raidRuns:p.raidRuns,raidProfile:p.raidProfile,status:active&&s.party.some(c=>c.id===p.id)?'与你冒险':p.steps%2?'正在任务历练':'等待组队',equipment:Object.entries(c.equipment).map(([slot,item])=>({slot:Number(slot),...item})),talents:c.talents,stats:stats(c),nextXp:xpTable[c.level]?.xp_for_next_level||0,xp:c.xp};})};
}

export function recordNpcRaid(s,completed=false){
 const world=ensureNpcWorld(s);
 syncNpcWorld(s);
 for(const c of s.party.filter(c=>c.npcPlayer&&c.goldNpc)){
  const p=world.residents.find(p=>p.id===c.id);if(!p)continue;
  if(completed&&s.goldRaid.contributions[c.id]?.kills>0){
   p.raidRuns++;
   const skill=p.raidRuns>=3?'expert':p.raidProfile.skill==='novice'?'regular':p.raidProfile.skill;
   if(skill!==p.raidProfile.skill){
    p.raidProfile.skill=skill;c.goldProfile.skill=skill;
    const fresh=buildUnit(s,p.index,p.unit.level,false,{skill,temperament:p.personality.id,spending:p.raidProfile.personality});
    Object.assign(p.unit,npcTraining(fresh));Object.assign(c,structuredClone(npcTraining(fresh)));
    note(p,`战斗经验提升，已重新安排${fresh.npcBuild.name}的天赋与策略。`);
   }
   note(p,`金团结算：与你击败${s.goldRaid.cleared.length}名首领，分红${((s.goldRaid.settlement?.rows.find(r=>r.id===c.id)?.total||0)/10000).toFixed(2)}金。装备与余额已保存。`);
  }else if(!completed){p.runs++;note(p,'与你组成40人上限金团，独立竞拍并按公告分金。');}
 }
}
