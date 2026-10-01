import {bossCombatArea,nearestCombatPoint,placeCombatUnit} from './combat-area.js';
import {combatRole} from './combat-roles.js';
import {combatMembers} from './combat-members.js';
import {raidBossesFor,raidNodesFor,raidRoutePlan} from './molten-core-content.js';

export function requiredRaidRoom(id){
 const area=bossCombatArea(id);
 if(!area)throw new Error(`团本首领 ${id} 缺少编译后的专属房间。`);
 return area;
}
export function raidPreparationBoss(raid){
 const bosses=raidBossesFor(raid.raidId),route=raidNodesFor(raid.raidId);
 if(bosses.some(b=>b.id===raid.activeBoss)&&!(raid.cleared||[]).includes(raid.activeBoss))return raid.activeBoss;
 if(bosses.some(b=>b.id===raid.locationId))return raid.locationId;
 if(raid.destination){
  const next=raidRoutePlan({...raid,cleared:raid.cleared||[],clearedPacks:raid.clearedPacks||[]},raid.destination).find(id=>bosses.some(b=>b.id===id));
  if(next)return next;
 }
 const index=route.findIndex(n=>n.id===raid.locationId);
 return route.slice(index+1).find(n=>n.kind==='boss'&&!(raid.cleared||[]).includes(n.id))?.id||bosses.at(-1).id;
}
export function raidGridPoint(area,anchor,index,count,spacing=2,columns=8){
 columns=Math.min(columns,count);const rows=Math.ceil(count/columns);
 return nearestCombatPoint(area,{x:anchor.x+(index%columns-(columns-1)/2)*spacing,y:anchor.y+(Math.floor(index/columns)-(rows-1)/2)*spacing});
}
export function positionRaidCompanions(s){
 const owners=[s,...s.party],slots=new Map();
 for(const c of combatMembers(s).filter(c=>!owners.includes(c))){
  const owner=owners.find(a=>a.id===c.ownerId||a.pet===c||Object.values(a.totems||{}).includes(c))||s;
  const slot=slots.get(owner.id)||0;slots.set(owner.id,slot+1);
  placeCombatUnit(s,c,{x:owner.position-1-slot*.8,y:owner.positionY+1});
 }
}
export function positionRaidActors(s,actors,tanks,formation){
 const area=s.combat.area,{anchors}=area;
 const groups={melee:[],ranged:[],offTank:[]};
 for(const c of actors){
  if(c===tanks[0]){placeCombatUnit(s,c,anchors.mainTank);continue;}
  groups[combatRole(c)==='tank'?'offTank':combatRole(c)==='melee'?'melee':'ranged'].push(c);
 }
 for(const [role,members]of Object.entries(groups))for(const [i,c]of members.entries())placeCombatUnit(s,c,raidGridPoint(area,anchors[role],i,members.length,role==='ranged'&&formation==='spread'?4:2,role==='ranged'?6:4));
}
