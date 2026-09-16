import {racialModifiers} from './racial-effects.js';
import {items,nodes,nameOf,creatures} from './catalog.js';
import {addItem,clone,log,roll,rng,stats,slotOf,countItem} from './character.js';
import {professions,recipes,enchants,professionRanks,specializations,specializationKnown,disenchantLoot,bandages,enchantFits,professionReference} from './profession-data.js';
import {quantity,usableCount,consume,receive,marketPrice,protectedItem} from './inventory.js';

export const canTrainProfession=s=>['town','city','outpost'].includes(nodes[s.location]?.kind);
const skill=(s,id)=>s.professions?.[id]?(s.professions[id].skill||0)+(racialModifiers(s).professionSkill[({herbalism:182,engineering:202})[id]]||0):0;
function skillUp(s,id,count=1,required=1,yellow=required+25,gray=required+75){const p=s.professions[id];if(!p)return;for(let n=0;n<count&&p.skill<p.cap&&p.skill<gray;n++){const chance=p.skill<yellow?1:p.skill<Math.floor((yellow+gray)/2)?.75:.25;if(rng(s)<chance)p.skill++;}}
const rods=[6218,6339,11130,11145,16207];
const hasTool=(s,id)=>countItem(s,id)>0||(rods.includes(id)&&rods.slice(rods.indexOf(id)+1).some(x=>countItem(s,x)>0));
export function recipeQuote(s,r,count=1){
 const materials=r.materials.map(m=>({...m,count:m.count*count,have:usableCount(s,m.id),bank:(s.bank||[]).filter(i=>i.id===m.id).reduce((n,i)=>n+i.count,0)})).map(m=>({...m,missing:Math.max(0,m.count-m.have),price:marketPrice(m.id).buy}));
 const tools=r.tools.map(id=>({id,have:hasTool(s,id),price:marketPrice(id).buy}));
 const p=s.professions?.[r.profession],known=skill(s,r.profession)>=r.skill&&specializationKnown(p,r.specialization),readyAt=s.professionCooldowns?.[r.cooldownGroup]||0;
 const color=skill(s,r.profession)<r.skill?'red':skill(s,r.profession)<r.yellow?'orange':skill(s,r.profession)<Math.floor((r.yellow+r.gray)/2)?'yellow':skill(s,r.profession)<r.gray?'green':'gray';
 return{...r,materials,tools,known,readyAt,color,facilityReady:!r.focus||canTrainProfession(s),missingCost:materials.reduce((n,m)=>n+m.missing*m.price,0)+tools.filter(t=>!t.have).reduce((n,t)=>n+t.price,0)};
}
export function professionView(s){return{professions:professions.map(p=>({...p,...s.professions?.[p.id],learned:!!s.professions?.[p.id],effectiveSkill:skill(s,p.id),racialBonus:skill(s,p.id)-(s.professions?.[p.id]?.skill||0),nextRank:professionRanks[p.id].find(r=>r.cap>(s.professions?.[p.id]?.cap||0)),specializations:specializations.filter(x=>x.profession===p.id),recipeCount:professionReference.counts[p.id]||0})),recipes:recipes.map(r=>recipeQuote(s,r)),professionRecipeCount:recipes.length,bandages,canTrainProfession:canTrainProfession(s),resources:resourceView(s),enchants,disenchantable:s.bag.filter(i=>canDisenchant(s,i)&&items[i.id].Quality<=3).map(i=>i.uid)};}

// Explicit terrain profiles for the current road graph. Town centers and
// dungeon interiors do not generate gathering nodes.
const terrain={northwood:'forest',vineyard:'farm',echo:'mine',fargodeep:'mine',jasper:'mine',mirror:'lake',crystal:'lake',stonefield:'farm',maclure:'farm',logging:'forest',brackwell:'farm',forestedge:'forest',furlbrow:'farm',saldean:'farm',jansen:'mine',alexton:'farm',moonbrook:'hills',daggerhills:'hills',coastnorth:'coast',coast:'coast',lighthouse:'coast',silverstream:'mine'};
function resourceDefs(location){const t=terrain[location];if(!t)return[];const west=nodes[location].region==='西部荒野'||location==='silverstream';const defs=[];
 if(['forest','farm','lake','hills'].includes(t)){defs.push(['bloom','herbalism',2447,1,'宁神花丛'],['silverleaf','herbalism',765,1,'银叶草丛']);if(west)defs.push(['mageroyal','herbalism',785,50,'魔皇草丛'],['briarthorn','herbalism',2450,70,'石南草丛']);}
 if(['mine','hills'].includes(t)){defs.push(['copper','mining',2770,1,'铜矿脉']);if(west)defs.push(['tin','mining',2771,65,'锡矿脉']);}
 if(['lake','coast'].includes(t)){defs.push(['fish','fishing',6291,1,'美味小鱼群']);if(west)defs.push(['kelp','herbalism',3820,75,'荆棘藻']);}
 if(['mine','hills'].includes(t))defs.push(['earthroot','herbalism',2449,15,'地根草丛']);
 return defs.map(([key,profession,item,required,name])=>({id:location+':'+key,profession,item,required,name}));
}
export function resourceView(s){return resourceDefs(s.location).map(r=>{const readyAt=s.resourceCooldowns?.[r.id]||0;return{...r,readyAt,available:readyAt<=s.clock&&skill(s,r.profession)>=r.required,learned:skill(s,r.profession)>0};});}
function roomForResource(s,r){const copy=clone(s);try{receive(copy,r.item,3);return true;}catch{return false;}}
export function beginGather(s,id,auto=false){const r=resourceView(s).find(r=>r.id===id);if(!r||!r.available)throw new Error('资源尚未刷新、熟练度不足或不在当前区域');if(!roomForResource(s,r))throw new Error('背包空间不足，请预留采集空间');s.rest=null;s.activity={type:'professionGather',target:id,auto,startedAt:s.clock,endsAt:s.clock+3000};}
export function finishGather(s){const a=s.activity,r=resourceView(s).find(r=>r.id===a.target);s.activity={type:'idle'};if(!r?.available||!roomForResource(s,r)){s.activity.reason='无法继续采集，请检查资源与背包空间。';return;}const count=roll(s,1,3);receive(s,r.item,count);s.resourceCooldowns[r.id]=s.clock+300000;skillUp(s,r.profession,1,r.required);log(s,'采集 '+nameOf('items',r.item)+' ×'+count,'loot');
 if(a.auto){const next=resourceView(s).find(r=>r.available&&roomForResource(s,r));if(next)beginGather(s,next.id,true);else s.activity.reason='本区可采集资源已采完或背包空间不足。';}
}
export function skinBeast(s,enemy){if(!s.professions?.skinning||enemy.skinned||creatures[enemy.entry]?.CreatureType!==1)return;enemy.skinned=true;const required=Math.max(1,(enemy.level-10)*5);if(skill(s,'skinning')<required){log(s,'剥皮熟练度不足，无法处理 '+enemy.name,'info');return;}const id=enemy.level>=50?8170:enemy.level>=40?4304:enemy.level>=30?4234:enemy.level>=16?2319:2318,count=roll(s,1,2);addItem(s,id,count);skillUp(s,'skinning',1,required);log(s,'自动剥皮：'+nameOf('items',id)+' ×'+count,'loot');}
export function canDisenchant(s,i){const data=items[i.id];return skill(s,'enchanting')>0&&!protectedItem(i)&&[2,4].includes(data?.class)&&[2,3,4].includes(data?.Quality)&&!!disenchantLoot[data.DisenchantID];}
export function professionAction(s,a){
 if(['learnProfession','upgradeProfession'].includes(a.type)){
  const def=professions.find(p=>p.id===a.id);if(!def||!canTrainProfession(s))throw new Error('请在城镇学习生活职业');
  const p=s.professions[a.id];if(a.type==='learnProfession'&&p)throw new Error('已经学会这个职业');if(a.type==='upgradeProfession'&&!p)throw new Error('请先学习职业');
  const rank=professionRanks[a.id].find(r=>r.cap>(p?.cap||0));if(!rank)throw new Error('已达到大师级 300 上限');
  if(s.level<rank.level||(p?.skill||0)<rank.skill)throw new Error(`进阶需要等级 ${rank.level}、熟练度 ${rank.skill}`);
  if(s.money<rank.cost)throw new Error('训练费用不足');s.money-=rank.cost;if(p)p.cap=rank.cap;else s.professions[a.id]={skill:1,cap:rank.cap};log(s,'学会 '+rank.name+def.name,'learn');return;
 }
 if(a.type==='specializeProfession'){
  const def=specializations.find(x=>x.id===a.id),p=def&&s.professions[def.profession];if(!p||!canTrainProfession(s))throw new Error('请在城镇选择专业专精');
  if(p.skill<def.skill||s.level<def.level)throw new Error(`专精需要等级 ${def.level}、熟练度 ${def.skill}`);
  if(p.specialization===def.id)throw new Error('已经掌握这个专精');
  if(def.parent&&!specializationKnown(p,def.parent))throw new Error('请先学习武器锻造');
  const cost=p.specialization?50000:0;if(s.money<cost)throw new Error('重选专精需要 5 金');s.money-=cost;p.specialization=def.id;log(s,'选择专精：'+def.name,'learn');return;
 }
 if(['craft','buyMaterials'].includes(a.type)){
  quantity(a.count,100);const r=recipes.find(r=>r.id===a.id);if(!r||skill(s,r.profession)<r.skill||!specializationKnown(s.professions[r.profession],r.specialization))throw new Error('熟练度或专业专精不满足配方要求');
  const q=recipeQuote(s,r,a.count),buy=a.type==='buyMaterials'||a.buyMissing===true;
  if(a.type==='craft'){
   if(r.cooldown&&a.count!==1)throw new Error('有制造冷却的配方每次只能制造一次');
   if(q.readyAt>s.clock)throw new Error('配方制造冷却尚未结束');
   if(!q.facilityReady)throw new Error('此配方需要前往城镇工坊使用工作台');
  }
  if(buy&&s.money<q.missingCost)throw new Error('补齐材料与工具的金币不足');if(!buy&&q.missingCost>0)throw new Error('制造材料或工具不足');
  if(a.type==='buyMaterials'){
   for(const m of q.materials)if(m.missing)receive(s,m.id,m.missing);
   for(const t of q.tools)if(!t.have)receive(s,t.id,1);
   s.money-=q.missingCost;log(s,'已从拍卖行补齐材料与工具，花费 '+q.missingCost+' 铜','trade');return;
  }
  // Consumption, output, tools and payment are one engine transaction.
  for(const m of q.materials)consume(s,m.id,Math.min(m.count,m.have));
  if(buy){s.money-=q.missingCost;for(const t of q.tools)if(!t.have)receive(s,t.id,1);}
  let output=0;for(let n=0;n<a.count;n++)output+=r.output===r.outputMax?r.output:roll(s,r.output,r.outputMax);
  receive(s,r.item,output);skillUp(s,r.profession,a.count,r.skill,r.yellow,r.gray);
  if(r.cooldown){s.professionCooldowns??={};s.professionCooldowns[r.cooldownGroup]=s.clock+r.cooldown;}
  log(s,'制造 '+nameOf('items',r.item)+' ×'+output,'loot');return;
 }
 if(a.type==='gatherResource'){beginGather(s,a.id);return;}
 if(a.type==='gatherAll'){const r=resourceView(s).find(r=>r.available&&roomForResource(s,r));if(!r)throw new Error('本区没有可采集资源，或背包空间不足');beginGather(s,r.id,true);return;}
 if(['disenchant','disenchantAll'].includes(a.type)){
  const selected=s.bag.filter(i=>canDisenchant(s,i)&&(a.type==='disenchantAll'?items[i.id].Quality<=3:i.uid===a.uid));
  if(!selected.length)throw new Error('没有可分解的未锁定装备，或尚未学习附魔');
  for(const i of selected){
   s.bag=s.bag.filter(x=>x.uid!==i.uid);
   const groups=Object.groupBy(disenchantLoot[items[i.id].DisenchantID],r=>r.groupid);
   for(const [group,rows] of Object.entries(groups)){
    let chosen=[];
    if(group==='0')chosen=rows.filter(r=>rng(s)*100<Math.abs(r.ChanceOrQuestChance));
    else{const explicit=rows.filter(r=>r.ChanceOrQuestChance>0),equal=rows.filter(r=>r.ChanceOrQuestChance===0);let chance=rng(s)*100;let hit;
     for(const row of explicit){chance-=row.ChanceOrQuestChance;if(chance<0){hit=row;break;}}
     if(!hit&&equal.length)hit=equal[roll(s,0,equal.length-1)];if(hit)chosen=[hit];
    }
    for(const row of chosen)for(let n=0;n<i.count;n++)addItem(s,row.item,roll(s,row.mincountOrRef,row.maxcount));
   }
   skillUp(s,'enchanting',1,1,25,75);log(s,'分解 '+nameOf('items',i.id),'loot');
  }return;
 }
 if(a.type==='applyEnchant'){const def=enchants[items[a.id]?.enchant];if(!def||usableCount(s,a.id)<1)throw new Error('缺少可用的附魔羊皮纸');const target=[s,...s.party].flatMap(c=>Object.values(c.equipment).map(i=>({i,c}))).find(({i})=>i.uid===a.uid),bagItem=s.bag.find(i=>i.uid===a.uid),i=target?.i||bagItem;if(!i||i.locked||!enchantFits(def,items[i.id],slotOf(items[i.id])))throw new Error('请选择未锁定且槽位匹配的装备');consume(s,a.id,1);i.enchant=items[a.id].enchant;if(target){target.c.hp=Math.min(target.c.hp,stats(target.c).maxHp);target.c.mana=Math.min(target.c.mana,stats(target.c).maxMana);}log(s,'附魔完成：'+def.description,'learn');return;}
 if(a.type==='useBandage'){if(!skill(s,'firstaid'))throw new Error('请先学习急救');if(!bandages[a.id]||usableCount(s,a.id)<1||skill(s,'firstaid')<bandages[a.id].skill)throw new Error('缺少绷带');if((s.bandageReady||0)>s.clock)throw new Error('绷带尚未冷却');const max=stats(s).maxHp;if(s.hp>=max)throw new Error('生命值已经充满');consume(s,a.id,1);s.hp=Math.min(max,s.hp+bandages[a.id].heal);s.bandageReady=s.clock+60000;log(s,'使用绷带恢复生命','rest');return;}
 throw new Error('未知的生活职业操作');
}
export const professionActions=new Set(['learnProfession','upgradeProfession','specializeProfession','craft','buyMaterials','gatherResource','gatherAll','disenchant','disenchantAll','applyEnchant','useBandage']);
