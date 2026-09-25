const clamp=n=>Math.max(0,Math.min(1,n));

// Classic PvE reference model: +19% dual-wield white miss, a steeper
// NPC skill-gap penalty above ten points, and mutually exclusive outcomes.
export function weaponMissChance(skill,defense,{hit=0,dualWield=false,playerTarget=false}={}){
 const d=defense-skill,penalty=playerTarget||d<=0?d*.0004:d<=10?d*.001:.01+(d-10)*.006;
 return clamp(.05+penalty+(dualWield?.19:0)-hit);
}
export function rollAttackTable(roll,chances){
 let boundary=0;
 for(const name of ['miss','dodge','parry','glancing','block','critical','crushing']){
  boundary+=clamp(chances[name]||0);if(roll<Math.min(1,boundary))return name;
 }
 return 'hit';
}
export function glanceMultiplier(skill,defense,roll,{caster=false}={}){
 const delta=defense-skill;if(delta<0)return 1;
 const high=Math.max(.2,Math.min(.99,(caster?.9:1.2)-.03*delta));
 const low=Math.max(.01,Math.min(high,caster?.6:.91,(caster?.6:1.3)-.05*delta));
 return low+(high-low)*roll;
}
export function spellMissChance(level,targetLevel,hit=0,{playerTarget=false}={}){
 const d=targetLevel-level;
 return Math.max(.01,Math.min(.99,(d<=2?.04+d*.01:.06+(d-2)*(playerTarget?.07:.11))-hit));
}
