import {fieldContains,fieldSafePoint,spiralField} from '../../../sim-core/src/encounter-geometry.js';
import {controlled} from '../../../sim-core/src/combat-auras.js';
import {point} from '../../../sim-core/src/geometry.js';
import {moveToward} from './combat-space.js';
import {goldAvoidsFire} from './gold-raid-npcs.js';

/** @param {{label?:string,delay?:number,duration?:number,damage?:number,school?:number,spellId?:number,once?:boolean,terrain?:boolean,unavoidable?:boolean,followId?:string,interval?:number}} options */
export function addRaidField(s,geometry,options={}){
 const {label='熔岩灼烧',delay=2500,duration=8500,damage=750,school=2,spellId=19411,...extra}=options;
 const r=s.combat.raidEncounter;
 const field={id:`field-${s.clock}-${++r.fieldSequence}`,...geometry,label,school,spellId,damage,startedAt:s.clock,armedAt:s.clock+delay,next:s.clock+delay,until:s.clock+delay+duration,...extra};
 r.fires.push(field);return field;
}
export function initializeRaidBattlefield(s,boss){
 const r=s.combat.raidEncounter;
 if(r.id!=='ragnaros')return;
 boss.moveSpeed=0;boss.walkSpeed=0;
 const options={label:'螺旋熔岩',delay:0,duration:r.enrageAt-s.clock,damage:750,terrain:true};
 addRaidField(s,spiralField(point(boss)),options);
 addRaidField(s,{center:point(boss),radius:3},{...options,label:'炎魔熔池'});
 for(const c of [s,...s.party])if(r.fires.some(f=>fieldContains(f,c,1.5))){const p=fieldSafePoint(c,r.fires,s.combat.area);c.position=p.x;c.positionY=p.y;}
}
export function raidFieldsTick(s,actors,boss,hurt){
 const r=s.combat.raidEncounter;
 r.fires=r.fires.filter(f=>f.until>s.clock);
 for(const f of r.fires){
  if(f.followId){const source=[...actors,...s.combat.enemies].find(a=>a.id===f.followId);if(!source||source.hp<=0){f.until=s.clock;continue;}f.center=point(source);}
  if(s.clock>=f.armedAt&&s.clock>=f.next){
   f.next=s.clock+(f.interval||1000);
   for(const c of actors.filter(c=>c.hp>0&&fieldContains(f,c))){r.failures.fire++;if(c.goldNpc)c.goldProfile.fireHits++;hurt(s,boss,c,f.damage,f.label,{spellId:f.spellId,school:f.school,periodic:!f.once});}
   if(f.once)f.until=s.clock+300;
  }
 }
 if(!r.tactics.avoidFire)return;
 for(const c of actors.filter(c=>c.hp>0&&!c.totemUnit&&!controlled(c,s.clock))){
  const threats=r.fires.filter(f=>f.until>s.clock&&!f.unavoidable&&fieldContains(f,c,1)&&goldAvoidsFire(s,c,f));
  if(!threats.length)continue;
  if(r.command?.plan.movement==='finishCast'&&c.cast&&threats.every(f=>s.clock<f.armedAt))continue;
  c.cast=null;const destination=fieldSafePoint(c,r.fires.filter(f=>f.until>s.clock&&!f.unavoidable),s.combat.area);
  moveToward(s,c,destination,0,s.clock);c.raidEvadingAt=s.clock;
 }
}
export function raidFieldPresentation(battle,actors,clock){
 const r=battle.raidEncounter;if(!r)return [];
 const fields=(r.fires||[]).filter(f=>f.until>clock).map(f=>({...f,mechanic:true,actorId:r.bossId,center:f.followId?point([...actors,...battle.enemies].find(a=>a.id===f.followId)||f.center):f.center}));
 for(const bomb of r.bombs||[]){const c=actors.find(a=>a.id===bomb.actorId);if(c?.hp>0&&bomb.at>clock)fields.push({id:`bomb-${c.id}-${bomb.at}`,label:'活体炸弹',mechanic:true,followId:c.id,center:point(c),radius:9,school:2,startedAt:bomb.at-7000,armedAt:bomb.at,until:bomb.at,actorId:c.id});}
 return fields;
}
