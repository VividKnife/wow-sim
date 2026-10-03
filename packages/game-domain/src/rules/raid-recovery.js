import {provisionAmmo,weaponAmmoType} from './ammunition.js';
import {stats} from './character.js';
export function restoreRaidMember(c,s){
 const alive=c.hp>0;
 c.time=s.clock;c.cast=null;c.rest=null;
 c.auras=(c.auras||[]).filter(a=>alive&&a.positive&&a.until>s.clock);
 c.buffs=Object.fromEntries(Object.entries(c.buffs||{}).filter(([,b])=>alive&&b.until>s.clock));
 c.classBuffs=(c.classBuffs||[]).filter(b=>alive&&b.until>s.clock);
 c.itemBuffs=(c.itemBuffs||[]).filter(b=>(alive||b.persistThroughDeath)&&b.until>s.clock);
 c.dots=[];c.hots=[];c.periodicClass=(c.periodicClass||[]).filter(p=>alive&&p.until>s.clock&&[s,...s.party].some(a=>a.id===p.caster));
 c.cooldowns={};c.categoryCooldowns={};c.globalCooldowns={};c.globalCooldown=0;
 c.fearUntil=0;c.stunUntil=0;c.rootUntil=0;c.polyUntil=0;c.silenceUntil=0;c.schoolLockouts={};
 c.rage=0;c.energy=100;c.combo=0;c.talentProcs={};c.nextAction=s.clock;c.nextSwing=s.clock;c.nextRanged=s.clock;
 if(c.classId===3){provisionAmmo(c,{[weaponAmmoType(c)===3?11284:11285]:2000});if(!c.learned.includes(19801))c.learned.push(19801);}
 const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;
}
