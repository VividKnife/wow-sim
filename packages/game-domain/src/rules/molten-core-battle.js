import {startCombat} from './combat.js';
import {combatRole} from './combat-roles.js';
import {moltenCoreBosses} from './molten-core-encounter.js';

export function beginMoltenCoreBattle(s,bossId,tactics){
 const def=moltenCoreBosses.find(b=>b.id===bossId);
 if(!def||s.combat)throw new Error('当前不能开始这场首领战。');
 const profile=(id,name,entry,hp,low,high)=>({id,name,entry,level:63,hp,maxHp:hp,mana:0,maxMana:0,armor:3200,low,high,swing:2000,rank:3,threat:{},dots:[],auras:[],nextAttack:s.clock,nextSpell:s.clock,moveSpeed:5,walkSpeed:2.5,raidScripted:true,rewarded:true});
 const foes=[profile('mc-boss',def.name,def.entry,def.hp,def.low,def.high)];
 if(bossId==='lucifron')for(let i=0;i<2;i++)foes.push(profile(`mc-guard-${i+1}`,`烈焰行者护卫 ${i+1}`,12119,14000,430,610));
 startCombat(s,[],true,foes,{shape:'rectangle',minX:-20,maxX:50,minY:-25,maxY:25});
 s.combat.ground='cave';
 const actors=[s,...s.party],tanks=actors.filter(c=>combatRole(c)==='tank');
 for(const [i,c]of actors.entries()){
  c.raidIndex=i;c.raidSquad=Math.floor(i/5);c.raidMainTank=c.id===tanks[0]?.id;
  c.position=['tank','melee'].includes(combatRole(c))?22:4+(i%3)*2;c.positionY=(i%5-2)*4+(Math.floor(i/5)%2?2:0);
 }
 for(const [i,e]of foes.entries()){e.position=30;e.positionY=i===0?0:8;e.target=tanks[i===0?0:1]?.id||s.id;e.threat[e.target]=2500;}
 const at=s.clock;
 s.combat.raidEncounter={id:bossId,bossId:foes[0].id,tactics:{...tactics},nextDoom:at+8000,nextCurse:at+12000,nextShock:at+5000,nextFrenzy:at+12000,nextFear:at+22000,nextBomb:at+7000,fires:[],events:[],support:{dispels:0,tranquilizes:0,wards:0},failures:{doom:0,fire:0,feared:0}};
}
