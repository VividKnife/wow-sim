import {raidCreatureStats} from './raid-scaling.js';
// Instanced cooperative encounters use the existing weekly gold-raid lockout.
// Locations, route and arena are authored for this simulation.
export const worldBosses=[
 {id:'azuregos',entry:6109,name:'艾索雷葛斯',zone:'艾萨拉',subtitle:'蓝龙守护者',description:'冰霜吐息与法力风暴威胁团队；奥术真空将队伍拉回首领并清空仇恨，坦克及时接怪。'},
 {id:'kazzak',entry:12397,name:'卡扎克',zone:'诅咒之地',subtitle:'末日领主',description:'应对暗影箭雨和卡扎克印记。队员死亡会恢复首领生命，三分钟后进入狂暴。'},
].map(b=>({...b,...raidCreatureStats(b.entry),phase:2}));
export const worldBossById=Object.fromEntries(worldBosses.map(b=>[b.id,b]));
export const worldBossRoute=id=>[{id,name:worldBossById[id].name,kind:'boss',parent:'entrance',position:[500,230],description:worldBossById[id].description}];
export const worldBossMap=id=>({width:1000,height:668,points:{entrance:[500,540],[id]:[500,230]},edges:[['entrance',id]],floorByNode:{entrance:1,[id]:1},floors:[{id:1,name:worldBossById[id].zone,image:null}],attribution:'本作世界首领战场示意图'});
export function worldBossRoom(id){return {id,name:worldBossById[id].name,shape:'rectangle',minX:-45,maxX:45,minY:-40,maxY:40,anchors:{boss:{x:12,y:0},mainTank:{x:17,y:0},offTank:{x:17,y:8},melee:{x:7,y:0},ranged:{x:-15,y:0},adds:{x:12,y:12}}};}
