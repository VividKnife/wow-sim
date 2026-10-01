import {raidScaling} from './raid-scaling.js';
import {placeCombatUnit} from './combat-area.js';
import {requiredRaidRoom,positionRaidActors,positionRaidCompanions,raidGridPoint} from './raid-room-layout.js';
import {initializeRaidBattlefield} from './raid-battlefield.js';
import {raidPlan,initRaidCommand} from './raid-command.js';
import {startCombat} from './combat.js';
import {combatRole} from './combat-roles.js';
import {raidNodesFor,raidBossesFor,moltenCoreTrash,raidEnemy} from './molten-core-content.js';

export function beginMoltenCoreBattle(s,bossId,tactics){
 const moltenCoreRoute=raidNodesFor(s.goldRaid?.raidId),moltenCoreBosses=raidBossesFor(s.goldRaid?.raidId);
 const node=moltenCoreRoute.find(n=>n.id===bossId),def=moltenCoreBosses.find(b=>b.id===bossId)||node;
 if(!def||s.combat)throw new Error('当前不能开始这场首领战。');
 const profile=(...args)=>raidEnemy(s,...args);
 const foes=node?.kind==='trash'?node.types.map((type,i)=>{const t=moltenCoreTrash[type];return {...profile('mc-trash-'+i,t.name,t.entry),trashType:type};}):[profile('mc-boss',def.name,def.entry)];
 if(bossId==='lucifron')for(let i=0;i<2;i++)foes.push(profile(`mc-guard-${i+1}`,`烈焰行者护卫 ${i+1}`,12119));
 const addGroups={gehennas:[2,'烈焰行者',11661],garr:[8,'火誓者',12099],sulfuron:[4,'烈焰祭司',11662],golemagg:[2,'熔岩犬',11672],majordomo:[8,'烈焰议会',11663]};
 const group=addGroups[bossId];
 if(group)for(let i=0;i<group[0];i++)foes.push({...profile('mc-add-'+i,bossId==='majordomo'?(i<4?'烈焰行者精英':'烈焰行者医师'):group[1],bossId==='majordomo'?(i<4?11664:11663):group[2]),raidHealer:bossId==='sulfuron'||bossId==='majordomo'&&i>=4});
 if(bossId==='majordomo')foes[0].auras.push({spell:20620,type:39,misc:127,until:s.clock+raidScaling.encounterLimitMs,positive:true});
 const area=node?.kind==='trash'?{shape:'rectangle',minX:-20,maxX:50,minY:-28,maxY:28}:requiredRaidRoom(bossId);
 startCombat(s,[],true,foes,area);
 s.combat.ground=bossId==='onyxia'?'onyxia':'molten';
 if(node?.kind==='trash')s.combat.area.name=def.name;
 s.combat.raidMode=s.goldRaid?.active?'gold':'demo';
 const actors=[s,...s.party],plan=raidPlan(s,bossId),allTanks=actors.filter(c=>combatRole(c)==='tank'),tanks=[allTanks.find(c=>c.id===plan.mainTank),allTanks.find(c=>c.id===plan.offTank)].filter(Boolean);
 tanks.push(...allTanks.filter(c=>!tanks.includes(c)));
 const spread=plan.formation==='spread'?6:2;
 for(const [i,c]of actors.entries()){
  c.raidIndex=i;c.raidSquad=Math.floor(i/5);c.raidMainTank=c.id===tanks[0]?.id;
  if(node?.kind==='trash')placeCombatUnit(s,c,{x:['tank','melee'].includes(combatRole(c))?22:4+(i%3)*2,y:(i%5-2)*spread+(Math.floor(i/5)%2?2:0)});
 }
 for(const [i,e]of foes.entries()){
  placeCombatUnit(s,e,area.anchors?(i===0?area.anchors.boss:raidGridPoint(area,area.anchors.adds,i-1,foes.length-1,3,4)):{x:30,y:i===0?0:8});
  e.target=(i===0?tanks[0]:(tanks.slice(1)[(i-1)%Math.max(1,tanks.length-1)]||tanks[0]))?.id||s.id;e.threat[e.target]=2500;
 }
 if(bossId==='onyxia'){
  const {boss,mainTank}=s.combat.area.anchors;
  foes[0].position=boss.x;foes[0].positionY=boss.y;
  for(const [i,c]of actors.entries())placeCombatUnit(s,c,{x:c.raidMainTank?mainTank.x:combatRole(c)==='melee'?boss.x:boss.x-10,y:c.raidMainTank?mainTank.y:boss.y+(i%2?1:-1)*(combatRole(c)==='melee'?5:16+(i%3)*3)});
 }else if(node?.kind!=='trash')positionRaidActors(s,actors,tanks,plan.formation);
 positionRaidCompanions(s);
 const at=s.clock;
 s.combat.raidEncounter={id:bossId,attemptEndsAt:at+raidScaling.encounterLimitMs,kind:node?.kind||'boss',bossId:foes[0].id,tactics:{...tactics},nextDoom:at+8000,nextCurse:at+12000,nextShock:at+5000,nextFrenzy:at+30000,nextFear:at+8000,nextBomb:at+12000,nextManaBomb:at+18000,nextSpecial:at+8000,nextPulse:at+12000,nextHeal:at+7000,nextSubmerge:at+180000,deadAdds:[],bombs:[],fieldSequence:0,fires:[],events:[],support:{dispels:0,tranquilizes:0,wards:0},failures:{doom:0,fire:0,feared:0}};
 initializeRaidBattlefield(s,foes[0]);
 if(s.goldRaid?.active)initRaidCommand(s,bossId);
}
