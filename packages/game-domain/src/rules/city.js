import {cityDistricts,cityServices} from './city-data.js';
import {nodes,trainerNodes,items,flights} from './catalog.js';
import {capitals} from '../../../game-data/world-content.js';
import atlas from '../../../game-data/data/world-map-atlas.json' with {type:'json'};
import {travelRoute} from './mounts.js';
import {protectedItem} from './inventory.js';
import {materialIds} from './profession-data.js';

// Both factions may use every city; dedicated districts serve their own classes.
export const canTrainAt=s=>(trainerNodes.includes(s.location)||!!cityDistricts.find(d=>d.id===s.location)?.classes?.includes(s.classId));

export function cityView(s){
 if(!cityDistricts.some(d=>d.id===s.location)||s.dungeon)return null;
 const current=cityDistricts.find(d=>d.id===s.location),city=capitals.find(c=>c.id===(current.city||'stormwind'));
 const blockedReason=s.hp<=0?'角色已死亡，请先复活。':s.combat?'战斗中无法办理主城服务。':s.escort?'请先完成或停止护送。':!['idle','hunt'].includes(s.activity.type)?'正在旅行或进行其他活动，请等待结束。':'';
 const travel=to=>{try{return travelRoute(s,to).duration;}catch{return null;}};
 const districts=cityDistricts.filter(d=>(d.city||'stormwind')===city.id).map(d=>({...d,travel:travel(d.id),visited:s.visited.includes(d.id)||s.location===d.id,services:d.services.filter(id=>id!=='trainer'||canTrainAt({...s,location:d.id})).map(id=>({...cityServices[id],...(city.id==='stormwind'?{}:{npc:{bank:'银行职员',auction:'拍卖师',inn:'旅店老板',flight:'飞行管理员',quests:'城市守卫'}[id]||cityServices[id].npc,name:id==='flight'?'飞行航线':cityServices[id].name,description:id==='flight'?'发现当地飞行点，前往已解锁的目的地。':cityServices[id].description})}))}));
 const trainer=districts.find(d=>d.classes?.includes(s.classId))?.id||city.id;
 return{
  id:city.id,name:city.name,faction:city.faction,image:atlas.regions[city.name]?.image||null,current:s.location,canInteract:!blockedReason,blockedReason,districts,trainer,
  junkCount:s.bag.filter(i=>items[i.id]?.Quality===0&&items[i.id]?.SellPrice>0&&!protectedItem(i)).length,
  materialCount:s.bag.filter(i=>materialIds.has(i.id)&&!protectedItem(i)).length,
  departures:(city.id==='stormwind'?[['goldshire','闪金镇','沿着城门大道，回到艾尔文森林。'],['sentinel','哨兵岭','前往西部荒野。'],['ironforge','铁炉堡','经矮人区搭乘矿道地铁。']]:[[city.exit,nodes[city.exit].name,'离开主城，继续区域冒险。']]).map(([to,name,description])=>({to,name,description,travel:travel(to)})),
  flights:flights.filter(f=>f.a===city.id||f.b===city.id).map(f=>{const to=f.a===city.id?f.b:f.a;return {to,name:nodes[to].name,duration:f.duration,cost:f.cost,unlocked:s.flightPoints.includes(city.id)&&s.flightPoints.includes(to)};}),
 };
}
