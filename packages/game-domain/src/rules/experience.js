// Shared by server settlement and browser simulation.
/** @param {number | string | undefined} value */
export function experienceMultiplier(value = 2) {
 const multiplier = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
 if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1000)
  throw new Error('GAME_XP_MULTIPLIER must be a number from 0 to 1000');
 return multiplier;
}
export function applyExperienceBuff(actor, multiplier) {
 const rate = experienceMultiplier(multiplier);
 actor.serverBuffs = [
  ...(actor.serverBuffs || []).filter(buff => buff.gm),
  ...(rate === 1 ? [] : [{id:'server-experience', name:'经验加成', icon:'/icons/class-assets/spell_holy_blessingofstrength.jpg', xpMultiplier:rate, description:`获得的经验变为基础经验的 ${rate} 倍。`, permanent:true}]),
  {id:'server-movement', name:'移动速度加成', icon:'/icons/class-assets/ability_rogue_sprint.jpg', movementMultiplier:2, description:'基础移动速度提高至 2 倍；与坐骑和飞行速度叠加。', permanent:true},
 ];
 return actor;
}
export function scaledXp(actor, amount) {
 const multiplier = activeServerBuffs(actor).reduce((rate, buff) => rate * (buff.xpMultiplier === undefined ? 1 : experienceMultiplier(buff.xpMultiplier)), 1);
 const result = Math.floor(amount * multiplier);
 if (!Number.isSafeInteger(result) || result < 0) throw new Error('经验值无效');
 return result;
}
export function movementMultiplier(actor) {
 return activeServerBuffs(actor).reduce((rate, buff) => rate * (buff.movementMultiplier ?? 1), 1);
}

export function activeServerBuffs(actor) {
 const clock=actor.time??actor.clock??0;
 return (actor.serverBuffs||[]).filter(buff=>(buff.startsAt==null||buff.startsAt<=clock)&&(buff.until==null||buff.until>clock));
}
