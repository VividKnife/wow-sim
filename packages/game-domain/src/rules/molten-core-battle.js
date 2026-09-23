import {raidPlan,initRaidCommand} from './raid-command.js';
import {startCombat} from './combat.js';
import {combatRole} from './combat-roles.js';
import {raidNodesFor,raidBossesFor,moltenCoreTrash,raidEnemy} from './molten-core-content.js';

export function beginMoltenCoreBattle(s,bossId,tactics){
 const moltenCoreRoute=raidNodesFor(s.guildRaid?.active?s.guildRaid.raidId:undefined),moltenCoreBosses=raidBossesFor(s.guildRaid?.active?s.guildRaid.raidId:undefined);
 const node=moltenCoreRoute.find(n=>n.id===bossId),def=moltenCoreBosses.find(b=>b.id===bossId)||node;
 if(!def||s.combat)throw new Error('当前不能开始这场首领战。');
 const profile=(...args)=>raidEnemy(s,...args);
 const foes=node?.kind==='trash'?node.types.map((type,i)=>{const t=moltenCoreTrash[type];return {...profile('mc-trash-'+i,t.name,t.entry,t.hp,t.low,t.high),level:62,rank:1,trashType:type};}):[profile('mc-boss',def.name,def.entry,def.hp,def.low,def.high)];
 if(bossId==='lucifron')for(let i=0;i<2;i++)foes.push(profile(`mc-guard-${i+1}`,`烈焰行者护卫 ${i+1}`,12119,14000,430,610));
 const addGroups={gehennas:[2,'烈焰行者',11661,14000],garr:[4,'火誓者',12099,15000],sulfuron:[4,'烈焰祭司',11662,13000],golemagg:[2,'熔岩犬',11672,90000],majordomo:[8,'烈焰议会',11663,15000]};
 const group=addGroups[bossId];
 if(group)for(let i=0;i<group[0];i++)foes.push({...profile('mc-add-'+i,bossId==='majordomo'?(i<4?'烈焰行者精英':'烈焰行者医师'):group[1],bossId==='majordomo'?(i<4?11664:11663):group[2],group[3],330,480),raidHealer:bossId==='sulfuron'||bossId==='majordomo'&&i>=4});
 if(bossId==='majordomo')foes[0].auras.push({spell:20620,type:39,misc:127,until:s.clock+240000,positive:true});
 startCombat(s,[],true,foes,{shape:'rectangle',minX:-20,maxX:50,minY:-25,maxY:25});
 s.combat.ground='cave';
 s.combat.raidMode=s.goldRaid?.active?'gold':s.guildRaid?.active?'guild':'demo';
 const actors=[s,...s.party],plan=raidPlan(s,bossId),allTanks=actors.filter(c=>combatRole(c)==='tank'),tanks=[allTanks.find(c=>c.id===plan.mainTank),allTanks.find(c=>c.id===plan.offTank)].filter(Boolean);
 const spread=plan.formation==='spread'?6:2;
 for(const [i,c]of actors.entries()){
  c.raidIndex=i;c.raidSquad=Math.floor(i/5);c.raidMainTank=c.id===tanks[0]?.id;
  c.position=['tank','melee'].includes(combatRole(c))?22:4+(i%3)*2;c.positionY=(i%5-2)*spread+(Math.floor(i/5)%2?2:0);
 }
 for(const [i,e]of foes.entries()){e.position=30;e.positionY=i===0?0:8;e.target=tanks[i===0?0:1]?.id||s.id;e.threat[e.target]=2500;}
 if(bossId==='onyxia')for(const [i,c]of actors.entries()){c.position=c.raidMainTank?25:combatRole(c)==='melee'?30:20;c.positionY=c.raidMainTank?0:(i%2?1:-1)*(combatRole(c)==='melee'?5:16+(i%3)*3);}
 const at=s.clock;
 s.combat.raidEncounter={id:bossId,enrageAt:at+(def.enrageMs||180000),kind:node?.kind||'boss',bossId:foes[0].id,tactics:{...tactics},nextDoom:at+8000,nextCurse:at+12000,nextShock:at+5000,nextFrenzy:at+12000,nextFear:at+22000,nextBomb:at+7000,nextSpecial:at+8000,nextPulse:at+12000,nextHeal:at+7000,nextSubmerge:at+45000,deadAdds:[],bombs:[],fires:[],events:[],support:{dispels:0,tranquilizes:0,wards:0},failures:{doom:0,fire:0,feared:0}};
 if(s.goldRaid?.active||s.guildRaid?.active)initRaidCommand(s,bossId);
}
