// Rule profiles are registered from the pinned spell data by the domain layer.
// No account/controller checks: an AI-operated arena character is a PvP target.
const profiles=new Map();
export function registerPvpControl(spellId,profile){profiles.set(spellId,Object.freeze({...profile}));}
export const pvpControlProfile=spellId=>profiles.get(spellId);
export const PVP_DR_RESET_MS=15000;
export function syncPvpDiminishing(unit,clock){
 if(!unit.pvp)return;
 for(const [group,state]of Object.entries(unit.diminishing||{})){
  const active=(unit.auras||[]).filter(a=>a.drGroup===group&&a.until>clock);
  if(state.active&&!active.length){state.active=false;state.endedAt=Math.min(clock,state.until);}
  if(active.length){state.active=true;state.until=Math.max(...active.map(a=>a.until));}
  if(!state.active&&clock-state.endedAt>PVP_DR_RESET_MS)delete unit.diminishing[group];
 }
}
export function pvpControlRemaining(unit,spellId,clock,duration){
 const profile=profiles.get(spellId);if(!unit.pvp||!profile)return duration;
 syncPvpDiminishing(unit,clock);
 const multiplier=profile.group?[1,.5,.25,0][Math.min(3,unit.diminishing?.[profile.group]?.count||0)]:1;
 return Math.floor(Math.min(duration,profile.capMs??Infinity)*multiplier);
}
export function preparePvpAura(unit,aura,clock){
 const profile=profiles.get(aura.spell);if(!unit.pvp||!profile||aura.positive||aura.caster===unit.id||!profile.types.includes(aura.type))return aura;
 // Multiple effect slots belonging to the same cast consume DR exactly once.
 const same=(unit.auras||[]).find(a=>a.spell===aura.spell&&a.caster===aura.caster&&a.appliedAt===clock&&a.drGroup===profile.group);
 if(same)return {...aura,until:same.until,drGroup:profile.group,appliedAt:clock,breakOnDamage:profile.breakOnDamage};
 const duration=pvpControlRemaining(unit,aura.spell,clock,aura.until-clock);
 if(duration<=0){unit.lastControlImmune={spell:aura.spell,at:clock,group:profile.group};return null;}
 if(profile.group){unit.diminishing??={};const state=unit.diminishing[profile.group]??{count:0};state.count=Math.min(3,state.count+1);state.active=true;state.until=clock+duration;state.endedAt=clock+duration;unit.diminishing[profile.group]=state;}
 return {...aura,until:clock+duration,drGroup:profile.group,appliedAt:clock,breakOnDamage:profile.breakOnDamage};
}
export function breakPvpControls(unit,clock,amount,random){
 if(!unit.pvp||amount<=0)return;
 // Fear/root use a damage-sensitive break roll; incapacitate/poly break on hit.
 unit.auras=(unit.auras||[]).filter(a=>a.until<=clock||!a.breakOnDamage||a.breakOnDamage==='chance'&&random()>Math.min(1,amount/Math.max(1,unit.maxHp)*5));
 syncPvpDiminishing(unit,clock);
}
