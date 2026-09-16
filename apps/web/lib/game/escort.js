import reference from '../../data/escort-reference.json' with {type:'json'};
import {creatures,spawns,monsterIdsAt} from './catalog.js';
import {enemy,roll,log} from './character.js';
import {startCombat} from './combat.js';
import {stopRecovery} from './recovery.js';

export const escortPath=reference.rows;
const hostile=new Set(['sentinel','moonbrook'].flatMap(monsterIdsAt));
// 2D encounter approximation: source spawns within 18 horizontal yards of a
// source waypoint. Alternative entries share one GUID and are rolled once.
const nearby=new Map();
for(const spawn of spawns){
 if(spawn.map!==0||!hostile.has(spawn.id))continue;
 let best=Infinity,index=0;escortPath.forEach((p,i)=>{const d=Math.hypot(p.PositionX-spawn.position_x,p.PositionY-spawn.position_y);if(d<best){best=d;index=i;}});
 if(best>18)continue;const row=nearby.get(spawn.guid)||{guid:spawn.guid,index,entries:[]};if(!row.entries.includes(spawn.id))row.entries.push(spawn.id);nearby.set(spawn.guid,row);
}
function moveNext(s){
 const escort=s.escort,to=escortPath[escort.index+1],from=escortPath[escort.index];
 if(!to){s.quests[155].event=true;s.location='moonbrook';s.escortLast={outcome:'arrived',at:s.clock};delete s.escort;s.activity={type:'idle'};log(s,'迪菲亚叛徒指出了秘密入口。返回哨兵岭向格里安·斯托曼报告。','quest');return;}
 const raw=creatures[467],speed=escort.index>=36?2.5*raw.SpeedWalk:7*raw.SpeedRun;
 const ms=Math.ceil(Math.hypot(to.PositionX-from.PositionX,to.PositionY-from.PositionY,to.PositionZ-from.PositionZ)/speed*1000)+(to.WaitTime||0);
 s.activity={type:'escortMove',startedAt:s.clock,endsAt:s.clock+Math.max(100,ms)};
}
export function beginEscort(s){
 if(s.escort||s.dungeon||s.combat||!['idle','hunt'].includes(s.activity.type)||s.location!=='sentinel'||!s.quests[155]||s.quests[155].event)throw new Error('请在哨兵岭接受任务，并结束当前活动后开始护送。');
 if([s,...s.party].some(c=>c.hp<=0))throw new Error('请先复活倒下的成员。');
 const profile={...enemy(s,467,'escort-467'),creatureType:creatures[467].CreatureType,family:creatures[467].Family};
 const npc={...profile,escortNpc:true,classId:0,name:'迪菲亚叛徒',equipment:{},learned:[],talents:{},buffs:{},cooldowns:{},lastManaUse:0,time:s.clock,rage:0,energy:0};
 s.escort={quest:155,npc,index:0,startedAt:s.clock,encounters:[...nearby.values()].map(row=>({...row,entry:row.entries[roll(s,0,row.entries.length-1)],done:false}))};
 stopRecovery(s);log(s,'开始护送迪菲亚叛徒。途中请保护他的安全。','quest');moveNext(s);
}
function fail(s,reason){s.escortLast={outcome:'failed',at:s.clock,reason};delete s.escort;s.activity={type:s.hp>0?'idle':'dead',reason};log(s,reason,'quest');}
export function cancelEscort(s){if(!s.escort)throw new Error('当前没有护送任务。');s.escort.cancelled=true;if(!s.combat)fail(s,'护送已停止，请返回哨兵岭重新开始。');}
export function escortTick(s){
 const escort=s.escort;if(!escort)return;
 if(!s.quests[155]||escort.npc.hp<=0||s.hp<=0||escort.cancelled){escort.cancelled=true;if(!s.combat)fail(s,'护送失败：叛徒、队长倒下或护送中止。返回哨兵岭后可以重新尝试。');return;}
 if(!s.combat&&s.activity.type==='idle')moveNext(s);
}
export function finishEscortMove(s){
 if(!s.escort){s.activity={type:'idle'};return;}
 const escort=s.escort;escort.index++;s.activity={type:'idle'};
 if(escort.index>=36){s.location='moonbrook';if(!s.visited.includes('moonbrook'))s.visited.push('moonbrook');}
 const encounters=escort.encounters.filter(e=>!e.done&&e.index<=escort.index);
 for(const e of encounters)e.done=true;
 if(encounters.length){startCombat(s,encounters.map(e=>e.entry));s.combat.quest=155;for(const e of s.combat.enemies){e.threat[escort.npc.id]=1;e.target=escort.npc.id;}}
 else escortTick(s);
}
export function escortView(s){
 const a=s.escort;return a?{active:true,index:a.index+1,total:escortPath.length,name:a.npc.name,hp:a.npc.hp,maxHp:a.npc.maxHp,endsAt:s.activity.endsAt||null,cancelled:!!a.cancelled}:s.quests[155]&&!s.quests[155].event?{active:false,canStart:s.location==='sentinel'&&!s.combat&&['idle','hunt'].includes(s.activity.type)&&s.hp>0,last:s.escortLast}:null;
}
