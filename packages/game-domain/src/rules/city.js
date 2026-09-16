import {cityDistricts,cityServices} from './city-data.js';
import {nodes,trainerNodes,items,flights} from './catalog.js';
import {travelRoute} from './mounts.js';
import {protectedItem} from './inventory.js';
import {materialIds} from './profession-data.js';

// Existing shared-route trainers remain available; dedicated city districts
// additionally serve their own classes.
export const canTrainAt=s=>trainerNodes.includes(s.location)||!!cityDistricts.find(d=>d.id===s.location)?.classes?.includes(s.classId);

export function cityView(s){
 if(!cityDistricts.some(d=>d.id===s.location)||s.dungeon)return null;
 const blockedReason=s.hp<=0?'角色已死亡，请先复活。':s.combat?'战斗中无法办理主城服务。':s.escort?'请先完成或停止护送。':!['idle','hunt'].includes(s.activity.type)?'正在旅行或进行其他活动，请等待结束。':'';
 const travel=to=>{try{return travelRoute(s,to).duration;}catch{return null;}};
 const districts=cityDistricts.map(d=>({...d,travel:travel(d.id),visited:s.visited.includes(d.id)||s.location===d.id,services:d.services.filter(id=>id!=='trainer'||canTrainAt({...s,location:d.id})).map(id=>({...cityServices[id]}))}));
 const trainer=cityDistricts.find(d=>d.classes?.includes(s.classId))?.id||'magetower';
 return{
  id:'stormwind',name:'暴风城',current:s.location,canInteract:!blockedReason,blockedReason,districts,trainer,
  junkCount:s.bag.filter(i=>items[i.id]?.Quality===0&&items[i.id]?.SellPrice>0&&!protectedItem(i)).length,
  materialCount:s.bag.filter(i=>materialIds.has(i.id)&&!protectedItem(i)).length,
  departures:[['goldshire','闪金镇','沿着城门大道，回到艾尔文森林。'],['sentinel','哨兵岭','前往西部荒野，继续迪菲亚兄弟会的线索。'],['ironforge','铁炉堡','经矮人区搭乘矿道地铁。']].map(([to,name,description])=>({to,name,description,travel:travel(to)})),
  flights:flights.filter(f=>f.a==='stormwind'||f.b==='stormwind').map(f=>{const to=f.a==='stormwind'?f.b:f.a;return {to,name:nodes[to].name,duration:f.duration,cost:f.cost,unlocked:s.flightPoints.includes('stormwind')&&s.flightPoints.includes(to)};}),
 };
}
