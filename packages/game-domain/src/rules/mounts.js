import {nodes,route,flights,edges,baseTravelSpeed,creatureLocations,spells,nameOf} from './catalog.js';
import {log,spellInfo} from './character.js';
import {ranks} from './talent-effects.js';
import {stopRecovery} from './recovery.js';
import {movementMultiplier} from './experience.js';

// 20 is this game's requested unlock level. Historical reference and explicit
// price overrides are documented in docs/research/import/mounts-reference.md.
export {ridingLevel,boostMount,mountCatalog} from '../../../game-data/mounts.js';
import {ridingLevel,boostMount,mountCatalog,rewardMounts,bossMounts,collectibleMounts} from '../../../game-data/mounts.js';
import {receive} from './inventory.js';
export const mountCastMs=3000;
const trainingPrice=200000;
const classMounts=[13819,23214,5784,23161].filter(id=>spells[id]).map(id=>({id,name:nameOf('spells',id),level:spells[id].SpellLevel,bonus:[23214,23161].includes(id)?100:60,price:0,classSpell:true}));
const findMount=id=>[...collectibleMounts,...classMounts].find(m=>m.id===id);
const trained=s=>!!s.riding?.horse;
const owns=(s,id)=>findMount(id)?.classSpell?s.learned.includes(id):(s.mounts||[]).includes(id);
const discount=s=>(s.reputation?.[72]||0)>=9000?.9:1;
const price=(s,base)=>Math.round(base*discount(s));
const serviceHere=(s,id)=>!s.dungeon&&(creatureLocations[id]||[]).includes(s.location);

function eligibility(s,level=ridingLevel){
 if(s.level<level)return `需要达到 ${level} 级。`;
 return '';
}
function busyReason(s){
 if(s.hp<=0)return '角色已死亡，请先复活。';
 if(s.combat)return '战斗中无法操作坐骑。';
 if(s.escort)return '请先结束护送。';
 if(s.dungeon)return '副本内不能使用坐骑。';
 if(!['idle','hunt'].includes(s.activity.type))return '请先结束当前活动。';
 return '';
}
function outdoorReason(s){
 if(nodes[s.location]?.mountAllowed===false||s.swimming)return '室内、矿洞和游泳时不能骑乘。';
 if(s.form&&s.form!=='humanoid')return '请先解除变形再骑乘。';
 return '';
}
function trainReason(s){
 return eligibility(s)||busyReason(s)||(trained(s)?'已经学会马匹骑术。':'')||(!serviceHere(s,4732)?'请前往东谷伐木场的骑术训练师。':'')||(s.money<price(s,trainingPrice)?'骑术训练费用不足。':'');
}
function buyReason(s,m){
 if(m.bossDrop)return '由副本首领掉落，拾取物品后使用收藏。';
 if(m.reward)return '由管理员礼包赠送。';
 if(m.testGift)return '仅由测试直升礼包赠送。';
 return eligibility(s,m.level)||busyReason(s)||(owns(s,m.id)||(s.bag||[]).some(i=>i.id===m.id)?'已经拥有这匹坐骑或其物品。':'')||(!trained(s)?'请先学习马匹骑术。':'')||(!serviceHere(s,384)?'请前往东谷伐木场的马匹商人。':'')||(s.money<price(s,m.price)?'购买坐骑的金币不足。':'');
}
function summonReason(s,m){
 if(m.classSpell)return busyReason(s)||outdoorReason(s)||(s.level<m.level?`需要达到 ${m.level} 级。`:'')||(!owns(s,m.id)?'尚未学习职业坐骑。':'')||(s.mana<spellInfo(s,m.id).mana?'法力不足':'')||(s.mounted===m.id?'正在骑乘这匹坐骑。':'');
 return mountEligibility(s,m)||busyReason(s)||outdoorReason(s)||(!trained(s)?'尚未学习马匹骑术。':'')||(!owns(s,m.id)?'尚未拥有这匹坐骑。':'')||(s.mounted===m.id?'正在骑乘这匹坐骑。':'');
}
function mountEligibility(s,m){return (m.testGift||m.reward)?(s.level<m.level?`需要达到 ${m.level} 级。`:''):eligibility(s,m.level);}
export function mountView(s){
 const active=findMount(s.mounted),trainingReason=trainReason(s);
 return {level:ridingLevel,castMs:mountCastMs,trained:trained(s),trainingPrice:price(s,trainingPrice),trainingReason,canTrain:!trainingReason,hasTrainer:serviceHere(s,4732),hasVendor:serviceHere(s,384),serviceLocation:'logging',serviceName:nodes.logging.name,active:active?.id||null,activeName:active?.name||'',speedBonus:active?.bonus||0,canDismount:!!active&&!busyReason(s),dismountReason:busyReason(s),collection:[...mountCatalog,...[...rewardMounts,...bossMounts].filter(m=>owns(s,m.id)),...(owns(s,boostMount.id)?[boostMount]:[]),...classMounts.filter(m=>owns(s,m.id))].map(m=>{const purchaseReason=m.classSpell?'通过职业技能学习':buyReason(s,m),reason=summonReason(s,m);return {...m,price:price(s,m.price),owned:owns(s,m.id),canBuy:!purchaseReason,purchaseReason,canMount:!reason,reason};})};
}
export function trainRiding(s){
 const reason=trainReason(s);if(reason)throw new Error(reason);
 s.money-=price(s,trainingPrice);s.riding??={};s.riding.horse=true;log(s,'学会了马匹骑术。','learn');
}
export function buyMount(s,id){
 const m=findMount(id);if(!m||m.classSpell)throw new Error('这个坐骑不能在商人处购买。');
 const reason=buyReason(s,m);if(reason)throw new Error(reason);
 receive(s,id,1);s.money-=price(s,m.price);log(s,'购买坐骑物品：'+m.name+'，使用后加入收藏。','trade');
}
export function dismount(s){
 if(s.mounted){log(s,'收起坐骑：'+(findMount(s.mounted)?.name||'坐骑'),'travel');s.mounted=null;}
}
export function beginMount(s,id){
 const m=findMount(id);if(!m)throw new Error(s.level<ridingLevel?`需要达到 ${ridingLevel} 级才能骑乘。`:'请选择已拥有的坐骑。');
 const reason=summonReason(s,m);if(reason)throw new Error(reason);
 dismount(s);stopRecovery(s);s.cast=null;s.stealthed=false;
 s.activity={type:'mount',mount:id,startedAt:s.clock,endsAt:s.clock+(m.classSpell?spellInfo(s,id).castMs:mountCastMs)};
 log(s,'正在召唤 '+m.name,'travel');
}
export function automaticTravelMount(s){
 if(s.mounted)return null;
 return [...collectibleMounts,...classMounts]
  .filter(m=>owns(s,m.id)&&!summonReason(s,m))
  .sort((a,b)=>b.bonus-a.bonus||a.id-b.id)[0]?.id||null;
}
export function finishMount(s){
 const id=s.activity.mount;s.activity={type:'idle'};const m=findMount(id);
 if(!m||summonReason(s,m))return;
 if(m.classSpell){s.mana-=spellInfo(s,id).mana;s.lastManaUse=s.clock;}s.mounted=id;log(s,'骑上了 '+m.name,'travel');
}
export function endMount(s){
 const reason=busyReason(s);if(reason)throw new Error(reason);
 if(!s.mounted)throw new Error('当前没有骑乘坐骑。');dismount(s);
}
// Greedy shortcutting: keep the existing ground route, then fly to the furthest
// affordable, unlocked point ahead that has a direct connection. No detours,
// backtracking, or global flight-network optimization. Track the remaining
// budget locally; actual payment happens when each flight starts.
export function automaticTravelRoute(s,to){
 const unlocked=new Set(s.flightPoints),available=(from,to,budget)=>unlocked.has(from)&&unlocked.has(to)
  ?flights.find(f=>(f.a===from&&f.b===to||f.b===from&&f.a===to)&&budget>=f.cost):null;
 const leg=(from,to,f)=>({a:from,b:to,flight:true,cost:f.cost,duration:Math.ceil(f.duration/movementMultiplier(s))});
 const direct=available(s.location,to,s.money);
 if(direct){const path=[leg(s.location,to,direct)];return {flight:true,cost:direct.cost,duration:path[0].duration,path};}
 const ground=travelRoute(s,to),points=[s.location];
 for(const e of ground.path)points.push(e.a===points.at(-1)?e.b:e.a);
 const path=[];let budget=s.money,flew=false;
 for(let i=0;i<ground.path.length;){
  let flight=null,end=i;
  if(unlocked.has(points[i])){
   for(let j=points.length-1;j>i;j--){flight=available(points[i],points[j],budget);if(flight){end=j;break;}}
  }
  if(flight){path.push(leg(points[i],points[end],flight));budget-=flight.cost;flew=true;i=end;continue;}
  let e=ground.path[i++];
  e={...e,duration:e.duration??e.distance/(baseTravelSpeed*movementMultiplier(s))*1000};
  if(flew){
   const raw=edges.find(row=>row.a===e.a&&row.b===e.b||row.a===e.b&&row.b===e.a);
   e={...e,riding:false,duration:raw.duration??raw.distance/(baseTravelSpeed*movementMultiplier(s))*1000};
  }
  path.push(e);
 }
 return {path,duration:Math.ceil(path.reduce((sum,e)=>sum+e.duration,0)),flight:!!path[0]?.flight,cost:s.money-budget};
}
export function travelRoute(s,to){
 const m=findMount(s.mounted),canRide=m&&owns(s,m.id)&&(m.classSpell||trained(s)&&!mountEligibility(s,m))&&!outdoorReason(s)&&!s.dungeon&&s.hp>0;
 const pursuit=(ranks(s)['Pursuit of Justice']||0)*.04;const form={wolf:.4,travel:.4,cat:(ranks(s)['Feline Swiftness']||0)*.15}[s.form]||0;
 const baseSpeed=baseTravelSpeed*movementMultiplier(s);
 return route(s.location,to,baseSpeed*(canRide?(1+m.bonus/100)*(1+pursuit):1+Math.max(pursuit,form)),baseSpeed);
}
// Paths carry their own segment times. Dismount exactly when entering a
// restricted leg, including on one-shot offline catch-up and after reloading.
export function updateTravelMount(s){
 if(s.clock>=travelDismountAt(s))dismount(s);
}
export function travelDismountAt(s){
 const a=s.activity;if(!s.mounted||a.type!=='travel'||!a.path?.length)return Infinity;
 let elapsed=0;
 for(const leg of a.path){if(leg.riding===false)return Math.max(s.clock,a.startedAt+Math.ceil(elapsed));elapsed+=leg.duration??leg.distance/baseTravelSpeed*1000;}
 return Infinity;
}

export function mountItemUse(s,instance){
 const mount=collectibleMounts.find(m=>m.id===instance.id);if(!mount)return null;
 const reason=instance.locked?'物品已锁定':instance.issued?'任务物品无法使用':owns(s,mount.id)?'已经收藏这只坐骑。':s.hp<=0?'角色已死亡':s.combat?'战斗中无法学习坐骑':!['idle','hunt'].includes(s.activity.type)?'请先结束当前活动':'';
 return {canUse:!reason,reason,label:'学习坐骑',description:`使用后收藏${mount.name}，${mount.level} 级可骑乘，移速 +${mount.bonus}%。`,remaining:0};
}
export function learnMountItem(s,instance){
 const use=mountItemUse(s,instance);if(!use)return false;
 if(!use.canUse)throw new Error(use.reason);
 instance.count--;if(!instance.count)s.bag=s.bag.filter(i=>i.uid!==instance.uid);
 s.mounts??=[];s.mounts.push(instance.id);s.riding??={};s.riding.horse=true;
 log(s,'收藏坐骑：'+findMount(instance.id).name,'learn');return true;
}
