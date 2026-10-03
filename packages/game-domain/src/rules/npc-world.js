import {NPC_PROGRESS,recordNpcRaidVisit} from './npc-progression.js';
import {trainNpcProfessions,wealthyNpc} from './npc-economy.js';
import {roles,createNpcMember} from './party.js';
import {items,nameOf,xpTable,classDefinitions,raceDefinitions} from './catalog.js';
import {rng,stats,canEquip,slotOf} from './character.js';
import {combatRole} from './combat-roles.js';
import {equipmentUpgrade,equipNpcItem,npcEquipmentValue,npcWeaponAllowed} from './npc-equipment.js';
import {dungeonJournal} from './dungeon-journal.js';
import {partyUnlocked} from './party-unlock.js';

export const npcCommands=['npcMatchSupply'];
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
const trainingFields=['learned','talents','rules','strategyPolicy','autoBuffs','potions','npcBuild'];
const npcTraining=c=>Object.fromEntries(trainingFields.map(key=>[key,c[key]]));
function seedOf(text){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0||1;}
const note=(p,text)=>{p.history.unshift({sequence:++p.events,text});p.history=p.history.slice(0,12);};
const startingLoadouts=new Map();
export function initialEquipment(c,index){
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
export function buildUnit(s,index,level,initial=true,behavior=behaviorFor(index)){
 const def=roles[index%roles.length],role=def.roles[Math.floor(index/roles.length)%def.roles.length];
 const faction=raceDefinitions.find(r=>r.id===s.raceId)?.faction;
 const classDef=classDefinitions.find(c=>c.id===def.classId);
 const raceId=classDef.races.find(id=>raceDefinitions.find(r=>r.id===id)?.faction===faction)||classDef.races[0];
 const host={id:s.id,level,clock:s.clock,location:s.location,itemSequence:0,logs:[],logSequence:0,party:[],money:0,bag:[],bags:[]};
 const c=createNpcMember(host,def.id,{name:names[index%names.length]+(index>=names.length?`·${Math.floor(index/names.length)+1}`:''),role,raceId,behavior});
 c.id=`npc:realm:${index+1}`;c.growthPolicy='npcPlayer';c.npcPlayer=true;c.professions={};
 c.itemSequence=0;trainNpcProfessions(c,index);
 for(const key of ['bag','bags','bank','pending','auctions','raidCollection','raidPendingEquipment'])c[key]??=[];
 for(const [slot,item] of Object.entries(c.equipment)){item.uid=`${c.id}:starter:${slot}`;item.ownerId=c.id;}
 if(initial)initialEquipment(c,index);
 if(c.classId===3)c.ammunition={2512:2000,2516:2000};
 return c;
}
export function newResident(s,index,level=s.level){
 const unit=buildUnit(s,index,level),behavior=behaviorFor(index);
 const p={id:unit.id,index,unit,friend:false,personality:styles.find(style=>style.id===behavior.temperament),runs:0,events:0,history:[],completedQuests:[],rngState:seedOf(unit.id),lastProgressWall:s.wallAt,steps:0,wallet:Math.round((45+(index*137)%650)*(level/60))*10000,raidProfile:{personality:behavior.spending,skill:behavior.skill},raidRuns:0};
 if(wealthyNpc(p))p.wallet+=Math.round(1000*level/60)*10000;
 unit.money=p.wallet;
 return p;
}
export function ensureNpcWorld(s,population=names.length){
 if(s.npcPlayer||s.growthPolicy==='companion'||!partyUnlocked(s))throw new Error('主角达到10级后可邀请地下城 NPC 玩家。');
 if(!s.npcWorld)s.npcWorld={selection:[],autoLoot:false,residents:[]};
 if(s.npcWorld.publicPool)return s.npcWorld;
 const world=s.npcWorld,indices=new Set(world.residents.map(p=>p.index));
 const missing=Array.from({length:population},(_,index)=>index).filter(index=>!indices.has(index)).length;
 if(indices.size+missing>768)throw new Error('NPC 候选池已满，请等待现有队员结束活动。');
 for(let index=0;index<population;index++)if(!indices.has(index)){
  const p=newResident(s,index);note(p,'开始新的冒险，期待结识同行的伙伴。');world.residents.push(p);
 }
 return world;
}
export function syncNpcWorld(s){
 for(const guest of s.npcGuests??[]){
  const c=s.party.find(c=>c.id===guest.profile.id);if(c)syncNpcProfile(guest.profile,c,s.wallAt);
 }
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
  syncNpcProfile(p,c,s.wallAt);
 }
}
function syncNpcProfile(p,c,wallAt){
 for(const key of ['level','xp','itemSequence','professions','equipment','bag',...trainingFields,'hunterPet','ammunition','raidCollection','raidPendingEquipment'])if(c[key]!==undefined)p.unit[key]=structuredClone(c[key]);
 trainNpcProfessions(p.unit,p.index);
 if(Number.isSafeInteger(c.money))p.wallet=c.money;p.unit.money=p.wallet;
 p.lastProgressWall=wallAt;
}
export function selectedDungeonMembers(s){
 if(s.sharedParty||s.dungeon||!s.npcWorld?.selection)return s.party.filter(c=>!c.goldNpc);
 return s.npcWorld.selection.map(id=>s.party.find(c=>c.id===id)||s.npcWorld.residents.find(p=>p.id===id)?.unit).filter(c=>c&&c.npcPlayer&&!c.goldNpc);
}
export function npcAction(s,a){if(a.type!=='npcMatchSupply')throw new Error('请使用社交与地下城查找器');}
/** @param {any} s @param {string[] | null} [memberIds] */
export function npcRunStarted(s,memberIds=null){
 const participants=s.dungeonRoster?(s.dungeon.npcParticipants??=[]):[];
 for(const c of s.party.filter(c=>c.npcPlayer&&(!memberIds||memberIds.includes(c.id)))){
  if(participants.includes(c.id))continue;
  participants.push(c.id);
  const p=npcProfile(s,c.id);p.runs++;p.protectedUntilWall=s.wallAt+NPC_PROGRESS.resetCooldownMs;note(p,`与你第${p.runs}次组队，前往${dungeonJournal.find(d=>d.id===s.dungeon.id)?.name||s.dungeon.id}。`);
  const training=buildUnit({...s,raceId:p.unit.raceId},p.index,c.level,false,{skill:p.raidProfile.skill,temperament:p.personality.id,spending:p.raidProfile.personality});
  Object.assign(c,npcTraining(training));
  if(c.classId===3)for(const id of [2512,2516]){const missing=Math.max(0,2000-(c.ammunition?.[id]||0)),cost=Math.ceil(missing/200)*10;if(p.wallet>=cost){p.wallet-=cost;c.ammunition??={};c.ammunition[id]=2000;}}
  c.money=p.wallet;c.location=s.location;c.time=s.clock;
 }
}
export function npcProfile(s,id){
 const p=[s,...s.party].flatMap(c=>c.npcWorld?.residents??[]).find(p=>p.id===id)??s.npcGuests?.find(g=>g.profile.id===id)?.profile;
 if(!p)throw new Error('公共 NPC 缺少活动档案。');return p;
}
export function creditNpcMoney(s,c,amount){
 const p=npcProfile(s,c.id);
 c.money=(Number.isSafeInteger(c.money)?c.money:p.wallet)+amount;p.wallet=c.money;
}
export function npcAward(s,c,item,need){
 const p=npcProfile(s,c.id);
 if(need&&equipNpcItem(c,item)){note(p,`与你冒险获得${nameOf('items',item.id)}，已换装。`);}
 else{creditNpcMoney(s,c,Math.max(0,items[item.id].SellPrice||0)*item.count);note(p,`贪婪获得${nameOf('items',item.id)}，出售用于旅途补给。`);}
 syncNpcWorld(s);
}
export function npcWorldView(s){
 const w=s.npcWorld,selected=selectedDungeonMembers(s),active=!!s.dungeon||!!s.goldRaid?.active;
 const member=c=>({id:c.id,name:c.name,classId:c.classId,level:c.level,role:combatRole(c),npc:!!c.npcPlayer,hp:c.hp});
 return {unlocked:partyUnlocked(s)&&!s.npcPlayer&&s.growthPolicy!=='companion',ready:!!w,locked:!!s.combat||active||s.goldRaid?.active||s.activity.type!=='idle',autoLoot:!!w?.autoLoot,selected:selected.map(member),
  total:w?.residents.length??0,
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
    const fresh=buildUnit({...s,raceId:p.unit.raceId},p.index,p.unit.level,false,{skill,temperament:p.personality.id,spending:p.raidProfile.personality});
    Object.assign(p.unit,npcTraining(fresh));Object.assign(c,structuredClone(npcTraining(fresh)));
    note(p,`战斗经验提升，已重新安排${fresh.npcBuild.name}的天赋与策略。`);
   }
   note(p,`金团结算：与你击败${s.goldRaid.cleared.length}名首领，分红${((s.goldRaid.settlement?.rows.find(r=>r.id===c.id)?.total||0)/10000).toFixed(2)}金。装备与余额已保存。`);
  }else if(!completed){recordNpcRaidVisit(p,s.goldRaid.raidId,s.wallAt);p.runs++;note(p,'与你组成40人上限金团，独立竞拍并按公告分金。');}
 }
}
