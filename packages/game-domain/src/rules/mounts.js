import {nodes,route,creatureLocations,spells,nameOf} from './catalog.js';
import {log,spellInfo} from './character.js';
import {ranks} from './talent-effects.js';
import {stopRecovery} from './recovery.js';

// 20 is this game's requested unlock level. Historical reference and explicit
// price overrides are documented in docs/research/import/mounts-reference.md.
export const ridingLevel=20;
export const mountCastMs=3000;
const trainingPrice=200000;
// Test boost gift: available to every race without changing vendor horses.
export const boostMount={id:900020,name:'旅行棕马',level:ridingLevel,bonus:60,price:0,tone:'brown',testGift:true};
export const mountCatalog=[
 {id:2414,name:'杂色马',level:ridingLevel,bonus:60,price:800000,tone:'pinto'},
 {id:5655,name:'栗色马',level:ridingLevel,bonus:60,price:800000,tone:'chestnut'},
 {id:5656,name:'棕马',level:ridingLevel,bonus:60,price:800000,tone:'brown'},
 {id:18776,name:'迅捷褐色马',level:60,bonus:100,price:10000000,tone:'palomino'},
 {id:18777,name:'迅捷棕马',level:60,bonus:100,price:10000000,tone:'brown'},
 {id:18778,name:'迅捷白马',level:60,bonus:100,price:10000000,tone:'white'},
];
const classMounts=[13819,23214,5784,23161].filter(id=>spells[id]).map(id=>({id,name:nameOf('spells',id),level:spells[id].SpellLevel,bonus:[23214,23161].includes(id)?100:60,price:0,classSpell:true}));
const findMount=id=>[...mountCatalog,boostMount,...classMounts].find(m=>m.id===id);
const trained=s=>!!s.riding?.horse;
const owns=(s,id)=>findMount(id)?.classSpell?s.learned.includes(id):(s.mounts||[]).includes(id);
const discount=s=>(s.reputation?.[72]||0)>=9000?.9:1;
const price=(s,base)=>Math.round(base*discount(s));
const serviceHere=(s,id)=>!s.dungeon&&(creatureLocations[id]||[]).includes(s.location);

function eligibility(s,level=ridingLevel){
 if(s.level<level)return `需要达到 ${level} 级。`;
 if(![1,3,4,7].includes(s.raceId||1))return '马匹骑术仅对联盟种族开放。';
 if((s.raceId||1)!==1&&(s.reputation?.[72]||0)<42000)return '非人类角色需要暴风城声望达到崇拜。';
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
 if(m.testGift)return '仅由20级测试直升礼包赠送。';
 return eligibility(s,m.level)||busyReason(s)||(owns(s,m.id)?'已经拥有这匹坐骑。':'')||(!trained(s)?'请先学习马匹骑术。':'')||(!serviceHere(s,384)?'请前往东谷伐木场的马匹商人。':'')||(s.money<price(s,m.price)?'购买坐骑的金币不足。':'');
}
function summonReason(s,m){
 if(m.classSpell)return busyReason(s)||outdoorReason(s)||(s.level<m.level?`需要达到 ${m.level} 级。`:'')||(!owns(s,m.id)?'尚未学习职业坐骑。':'')||(s.mana<spellInfo(s,m.id).mana?'法力不足':'')||(s.mounted===m.id?'正在骑乘这匹坐骑。':'');
 return mountEligibility(s,m)||busyReason(s)||outdoorReason(s)||(!trained(s)?'尚未学习马匹骑术。':'')||(!owns(s,m.id)?'尚未拥有这匹坐骑。':'')||(s.mounted===m.id?'正在骑乘这匹坐骑。':'');
}
function mountEligibility(s,m){return m.testGift?(s.level<m.level?`需要达到 ${m.level} 级。`:''):eligibility(s,m.level);}
export function mountView(s){
 const active=findMount(s.mounted),trainingReason=trainReason(s);
 return {level:ridingLevel,castMs:mountCastMs,trained:trained(s),trainingPrice:price(s,trainingPrice),trainingReason,canTrain:!trainingReason,hasTrainer:serviceHere(s,4732),hasVendor:serviceHere(s,384),serviceLocation:'logging',serviceName:nodes.logging.name,active:active?.id||null,activeName:active?.name||'',speedBonus:active?.bonus||0,canDismount:!!active&&!busyReason(s),dismountReason:busyReason(s),collection:[...mountCatalog,...(owns(s,boostMount.id)?[boostMount]:[]),...classMounts.filter(m=>owns(s,m.id))].map(m=>{const purchaseReason=m.classSpell?'通过职业技能学习':buyReason(s,m),reason=summonReason(s,m);return {...m,price:price(s,m.price),owned:owns(s,m.id),canBuy:!purchaseReason,purchaseReason,canMount:!reason,reason};})};
}
export function trainRiding(s){
 const reason=trainReason(s);if(reason)throw new Error(reason);
 s.money-=price(s,trainingPrice);s.riding??={};s.riding.horse=true;log(s,'学会了马匹骑术。','learn');
}
export function buyMount(s,id){
 const m=findMount(id);if(!m||m.classSpell)throw new Error('这个坐骑不能在商人处购买。');
 const reason=buyReason(s,m);if(reason)throw new Error(reason);
 s.money-=price(s,m.price);s.mounts??=[];s.mounts.push(id);log(s,'获得坐骑：'+m.name,'trade');
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
export function finishMount(s){
 const id=s.activity.mount;s.activity={type:'idle'};const m=findMount(id);
 if(!m||summonReason(s,m))return;
 if(m.classSpell){s.mana-=spellInfo(s,id).mana;s.lastManaUse=s.clock;}s.mounted=id;log(s,'骑上了 '+m.name,'travel');
}
export function endMount(s){
 const reason=busyReason(s);if(reason)throw new Error(reason);
 if(!s.mounted)throw new Error('当前没有骑乘坐骑。');dismount(s);
}
export function travelRoute(s,to){
 const m=findMount(s.mounted),canRide=m&&owns(s,m.id)&&(m.classSpell||trained(s)&&!mountEligibility(s,m))&&!outdoorReason(s)&&!s.dungeon&&s.hp>0;
 const pursuit=(ranks(s)['Pursuit of Justice']||0)*.04;const form={wolf:.4,travel:.4,cat:(ranks(s)['Feline Swiftness']||0)*.15}[s.form]||0;
 return route(s.location,to,canRide?7*(1+m.bonus/100)*(1+pursuit):7*(1+Math.max(pursuit,form))); 
}
// Paths carry their own segment times. Dismount exactly when entering a
// restricted leg, including on one-shot offline catch-up and after reloading.
export function updateTravelMount(s){
 if(s.clock>=travelDismountAt(s))dismount(s);
}
export function travelDismountAt(s){
 const a=s.activity;if(!s.mounted||a.type!=='travel'||!a.path?.length)return Infinity;
 let elapsed=0;
 for(const leg of a.path){if(leg.riding===false)return Math.max(s.clock,a.startedAt+Math.ceil(elapsed));elapsed+=leg.duration??leg.distance/7*1000;}
 return Infinity;
}
