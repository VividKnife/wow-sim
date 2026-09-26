import {stats} from './character.js';
export function restoreRaidMember(c,s){
 c.time=s.clock;c.cast=null;c.rest=null;c.auras=[];c.dots=[];c.hots=[];c.periodicClass=[];c.buffs=[];c.classBuffs=[];
 c.cooldowns={};c.categoryCooldowns={};c.globalCooldowns={};c.globalCooldown=0;
 c.fearUntil=0;c.stunUntil=0;c.rootUntil=0;c.polyUntil=0;c.silenceUntil=0;c.schoolLockouts={};
 c.rage=0;c.energy=100;c.combo=0;c.talentProcs={};c.nextAction=s.clock;c.nextSwing=s.clock;c.nextRanged=s.clock;
 if(c.classId===3){c.ammunition={11285:2000,11284:2000};if(!c.learned.includes(19801))c.learned.push(19801);}
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
}
