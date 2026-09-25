import {createGame} from './rules/engine.js';
import {recruit} from './rules/party.js';
import {items} from './rules/catalog.js';
import {canEquip,slotOf,stats,clone} from './rules/character.js';
import {combatRole} from './rules/combat-roles.js';
import {raidLoadouts} from './raid-loadouts.ts';
import type {Rules} from './model.ts';

const roster: [string,string,string][] = [
 ['远征团长','mage','ranged'],['加瑞克','warrior','tank'],['艾琳','priest','healer'],['洛恩','rogue','melee'],['艾拉','hunter','ranged'],
 ['布洛克','warrior','tank'],['罗兰','paladin','healer'],['影刃','rogue','melee'],['米拉','mage','ranged'],['塔林','hunter','ranged'],
 ['晨星','priest','healer'],['白露','priest','healer'],['圣烛','paladin','healer'],['霜语','mage','ranged'],['鸦羽','rogue','melee'],
 ['寒川','mage','ranged'],['银霜','mage','ranged'],['奥兰','mage','ranged'],['鹰眼','hunter','ranged'],['林歌','hunter','ranged'],
 ['疾风','rogue','melee'],['夜行','rogue','melee'],['赤刃','rogue','melee'],['铁锋','warrior','melee'],['雷恩','warrior','melee'],
];
export const guildSquadNames=['核心小队','磐石卫队','晨光医护队','霜弓支援队','锋刃突击队'];
export function gearScore(item:Rules,role:string,classId:number) {
 let score=(item.ItemLevel||0)*.1+(item.armor||0)*(role==='tank'?.04:.001);
 for(let n=1;n<=10;n++)score+=(item['stat_value'+n]||0)*({7:role==='tank'?3:1,5:['healer','ranged'].includes(role)&&classId!==3?3:0,6:role==='healer'?2:0,3:classId===3||classId===4?3:.2,4:classId===1?2:.1}[item['stat_type'+n] as number]||0);
 if(item.class===2)score+=((item.dmg_min1||0)+(item.dmg_max1||0))*500/Math.max(1,item.delay)*(['tank','melee'].includes(role)||classId===3?4:.1);
 return score;
}
function equipDemo(c:Rules) {
 const role=combatRole(c),pool=raidLoadouts[`${c.classId}:${role}`].map(id=>items[id]).filter(i=>canEquip(c,i));
 c.equipment={};
 for(const item of pool){
  if(![2,4].includes(item.class)||[4,19].includes(item.InventoryType))continue;
  let slot=slotOf(item);if(slot===11&&c.equipment[11])slot=12;if(slot===13&&c.equipment[13])slot=14;
  if(slot===16&&c.equipment[16]&&[13,22].includes(item.InventoryType)&&c.learned.includes(674))slot=17;
  if(c.equipment[slot]||Object.values(c.equipment).some((e:any)=>e.id===item.entry&&item.maxcount===1))continue;
  if(role==='tank'&&(item.InventoryType===17||slot===17&&item.InventoryType!==14))continue;
  if(slot===17&&(items[c.equipment[16]?.id]?.InventoryType===17||item.class===2&&!c.learned.includes(674)))continue;
  if(slot===16&&item.InventoryType===17)delete c.equipment[17];
  c.equipment[slot]={id:item.entry,uid:`demo:${c.id}:${slot}`,count:1,bound:true,durability:item.MaxDurability||undefined};
 }
 if(c.classId===3){c.ammunition={11285:2000,11284:2000};c.learned=[...new Set([...c.learned,19801])];}
 c.hp=stats(c).maxHp;c.mana=stats(c).maxMana;
}
let preparedRoster:Rules[]|undefined;
export function createRoster():Rules[] {
 if(preparedRoster)return clone(preparedRoster);
 preparedRoster=roster.map(([name,job,role],index)=>{
  const parent:Rules=createGame('公会招募',71,0);parent.level=60;
  const c:Rules=recruit(parent,job,{name,role,raceId:job==='priest'?3:job==='hunter'?4:1});
  c.id=`mc-member-${index+1}`;c.raidIndex=index;c.raidSquad=Math.floor(index/5);c.raidMainTank=index===1;
  c.strategyPolicy={...c.strategyPolicy,waitForTank:false,protectCC:false,role};
  const rule=(spell:number,condition='always',value=0)=>({spell,condition,value,enabled:true});
  // Compact, inspectable demo loadouts. The normal class engine owns all execution.
  if(job==='mage')c.rules=[rule(116)];
  if(job==='priest')c.rules=[rule(2061,'allyHealthBelow',40),rule(2060,'allyHealthBelow',80),rule(2054,'allyHealthBelow',85)];
  if(job==='paladin')c.rules=[rule(635,'allyHealthBelow',55),rule(19750,'allyHealthBelow',88)];
  if(job==='hunter')c.rules=[rule(3044),rule(1978)];
  if(job==='rogue')c.rules=[rule(2098,'comboAtLeast',4),rule(1752)];
  if(job==='warrior')c.rules=role==='tank'?[rule(355),rule(7386),rule(78)]:[rule(78)];
  c.stance=job==='warrior'?(role==='tank'?'defensive':'battle'):undefined;
  c.potions={};equipDemo(c);return c;
 });
 return clone(preparedRoster);
}
