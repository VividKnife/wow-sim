// Shared by server settlement and browser simulation.
/** @param {number | string | undefined} value */
export function experienceMultiplier(value = 1) {
 const multiplier = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
 if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1000)
  throw new Error('GAME_XP_MULTIPLIER must be a number from 0 to 1000');
 return multiplier;
}
export function applyExperienceBuff(actor, multiplier) {
 const rate = experienceMultiplier(multiplier);
 actor.serverBuffs = rate === 1 ? [] : [{id:'server-experience', name:'经验加成', icon:'/icons/class-assets/spell_holy_blessingofstrength.jpg', xpMultiplier:rate, description:`获得的经验变为基础经验的 ${rate} 倍。`, permanent:true}];
 return actor;
}
export function scaledXp(actor, amount) {
 const multiplier = (actor.serverBuffs || []).reduce((rate, buff) => rate * experienceMultiplier(buff.xpMultiplier), 1);
 const result = Math.floor(amount * multiplier);
 if (!Number.isSafeInteger(result) || result < 0) throw new Error('经验值无效');
 return result;
}
