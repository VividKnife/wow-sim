import {raidCommandTick} from './raid-command.js';
import {raidNotice} from './molten-core-mechanics.js';
import {addRaidField,raidFieldsTick} from './raid-battlefield.js';
import {placeCombatUnit} from './combat-area.js';
import {rng} from './character.js';
// Authored mechanics on the shared combat engine. Timers/marks survive checkpoints.
export function worldBossTick(s,actors,hurt){
 const r=s.combat.raidEncounter,boss=s.combat.enemies.find(e=>e.id===r.bossId);
 if(!boss||boss.hp<=0)return;
 const living=actors.filter(c=>c.hp>0);
 raidCommandTick(s,actors);for(const c of living)c.raidTargetId=boss.id;
 const hit=(c,amount,label,school)=>hurt(s,boss,c,amount,label,{school});
 if(r.id==='azuregos'){
  if(s.clock>=r.nextSpecial){r.nextSpecial=s.clock+12000;const tank=living.find(c=>c.id===boss.target)||living[0];if(tank)hit(tank,2400,'冰霜吐息',4);}
  if(s.clock>=r.nextManaBomb){r.nextManaBomb=s.clock+15000;const target=living.filter(c=>c.maxMana>0);const c=target[Math.floor(rng(s)*target.length)];if(c)addRaidField(s,{center:{x:c.position,y:c.positionY},radius:8},{label:'法力风暴',damage:600,school:4,delay:2500,duration:6000});}
  if(s.clock>=r.nextFrenzy){r.nextFrenzy=s.clock+30000;boss.threat={};for(const c of living)placeCombatUnit(s,c,{x:boss.position-4+(rng(s)*8),y:boss.positionY-4+rng(s)*8});raidNotice(s,'奥术真空！团队被拉近，坦克重新建立仇恨。');}
  raidFieldsTick(s,actors,boss,hurt);
 }else{
  r.deadSouls??=[];for(const c of actors.filter(c=>c.hp<=0&&!r.deadSouls.includes(c.id))){r.deadSouls.push(c.id);boss.hp=Math.min(boss.maxHp,boss.hp+70000);raidNotice(s,`${c.name}的灵魂恢复了卡扎克的生命。`);}
  const enraged=s.clock-s.combat.startedAt>=180000;
  if(enraged&&!r.enraged){r.enraged=true;raidNotice(s,'卡扎克进入狂暴，暗影箭雨加速！');}
  if(s.clock>=r.nextSpecial){r.nextSpecial=s.clock+(enraged?1000:12000);for(const c of living)hit(c,900,'暗影箭雨',5);}
  r.marks??=[];
  if(s.clock>=r.nextManaBomb){r.nextManaBomb=s.clock+20000;const pool=living.filter(c=>c.maxMana>0),c=pool[Math.floor(rng(s)*pool.length)];if(c){r.marks.push({id:c.id,until:s.clock+10000,next:s.clock});raidNotice(s,`${c.name}受到卡扎克印记，注意法力！`);}}
  for(const mark of r.marks){const c=living.find(c=>c.id===mark.id);if(!c||mark.until<=s.clock)continue;if(s.clock>=mark.next){mark.next=s.clock+1000;c.mana=Math.max(0,c.mana-Math.ceil(c.maxMana*.1));if(c.mana===0){for(const target of living)hit(target,2500,'卡扎克印记爆发',5);mark.until=s.clock;}}}
  r.marks=r.marks.filter(m=>m.until>s.clock);
 }
}
