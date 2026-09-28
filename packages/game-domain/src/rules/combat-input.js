import {spells,spellChain,icon,nameOf} from './catalog.js';
import {spellInfo,log} from './character.js';
import {combatMembers} from './combat-members.js';
import {aliveEnemy,inSpellRange} from './combat-space.js';
import {controlled,hasAura} from '../../../sim-core/src/combat-auras.js';
import {cooldownUntil,gcdUntil} from './spell-timing.js';
import {arenaSight} from '../../../sim-core/src/arena-space.js';

// An executable input contract, not an inference from the presence of a DBC row.
// Add families only with target/legality/settlement tests. Ranks remain explicit.
const families={
 enemy:'Fireball|Frostbolt|Fire Blast|Arcane Missiles|Arcane Explosion|Flamestrike|Blizzard|Scorch|Pyroblast|Counterspell|Sunder Armor|Taunt|Pummel|Shield Bash|Sinister Strike|Eviscerate|Kick|Smite|Shadow Word: Pain|Mind Blast|Hammer of Justice|Arcane Shot|Serpent Sting|Aimed Shot|Multi-Shot|Volley|Tranquilizing Shot|Lightning Bolt|Chain Lightning|Earth Shock|Flame Shock|Frost Shock|Purge|Shadow Bolt|Immolate|Corruption|Curse of Agony|Searing Pain|Drain Life|Fear|Wrath|Moonfire|Starfire',
 friendly:'Lesser Heal|Heal|Flash Heal|Greater Heal|Renew|Power Word: Shield|Fear Ward|Power Infusion|Holy Light|Flash of Light|Lay on Hands|Cleanse|Purify|Healing Wave|Lesser Healing Wave|Chain Heal|Healing Touch|Regrowth|Rejuvenation|Innervate|Remove Curse|Remove Lesser Curse',
 either:'Dispel Magic',
 self:'Ice Block|Cold Snap|Shield Wall|Shield Block|Last Stand|Bloodrage|Evasion|Sprint|Divine Shield|Rapid Fire|Barkskin',
};
const targets=new Map(Object.entries(families).flatMap(([kind,names])=>names.split('|').map(name=>[name,kind])));
export const combatInputTarget=sp=>targets.get(sp?.SpellName)||null;
export const combatInputSpellIds=c=>[...new Set(c.learned)].filter(id=>combatInputTarget(spells[id]));
export const damagingInput=sp=>[1,2,3].some(n=>[2,9,17,31,58,121].includes(sp?.['Effect'+n])||[3,53,89].includes(sp?.['EffectApplyAuraName'+n]));
export function combatInputTargetReason(s,c,sp,target){
 const kind=combatInputTarget(sp),friendly=combatMembers(s).includes(target),enemy=s.combat?.enemies.includes(target)&&!target?.controlledBy;
 if(!kind||!c.learned.includes(sp.Id))return '成员没有学会可指令施放的这个技能';
 if(c.hp<=0)return '施法者已倒下';
 if(!target||target.hp<=0||target.removed)return '目标已失效';
 if(kind==='self'?target!==c:kind==='friendly'?!friendly:kind==='enemy'?!enemy:!friendly&&!enemy)return '技能目标类型不适用';
 if(enemy&&!aliveEnemy(target))return '目标已失效';
 return '';
}
export function combatInputReadyReason(s,c,sp,target){
 const invalid=combatInputTargetReason(s,c,sp,target);if(invalid)return invalid;
 if(controlled(c,s.clock))return '施法者被控制';
 if(sp.School>0&&(c.silenceUntil>s.clock||hasAura(c,27,s.clock))||(c.schoolLockouts?.[sp.School]||0)>s.clock)return '学派被锁定或施法者被沉默';
 if(cooldownUntil(c,sp)>s.clock)return '技能仍在冷却';
 if(c!==target&&!inSpellRange(c,target,sp))return '目标超出施法距离';
 if(c!==target&&!arenaSight(c,target))return '目标不在视线内';
 const pool=sp.PowerType===1?'rage':sp.PowerType===2?'focus':sp.PowerType===3?'energy':[-2,4294967294].includes(sp.PowerType)?'hp':'mana';
 if((c[pool]||0)<sp.mana||pool==='hp'&&c.hp<=sp.mana)return '资源不足';
 if(s.combat.command?.holdFire&&damagingInput(sp))return '团队正在停火';
 return '';
}
export function inputResult(s,input,status,reason=''){
 const command=s.combat.command;
 command.inputs=(command.inputs||[]).filter(row=>row.sequence!==input.sequence);
 command.results=[...(command.results||[]),{...input,status,reason,at:s.clock}].slice(-40);
 log(s,`${nameOf('spells',input.spellId)}：${reason||{started:'已开始施放',cancelled:'已取消',expired:'指令已过期'}[status]||status}`,'command',{actorId:input.memberId,targetId:input.targetId,spellId:input.spellId,inputSequence:input.sequence,status});
}
export function queueCombatInput(s,c,spellId,targetId){
 const target=combatMembers(s).find(a=>a.id===targetId)||s.combat.enemies.find(a=>a.id===targetId),sp=spellInfo(c,spellId);
 const reason=combatInputTargetReason(s,c,sp,target);if(reason)throw new Error(reason);
 const command=s.combat.command;
 for(const previous of command.inputs||[])if(previous.memberId===c.id)inputResult(s,previous,'cancelled','被新的施法指令替换');
 const sequence=command.inputSequence=(command.inputSequence||0)+1;
 const input={sequence,memberId:c.id,spellId,targetId,receivedAt:s.clock,expiresAt:s.clock+5000};
 (command.inputs??=[]).push(input);
 return input;
}
export function pruneCombatInputs(s,actors){
 for(const input of s.combat.command?.inputs||[]){
  const actor=actors.find(a=>a.id===input.memberId),target=actors.find(a=>a.id===input.targetId)||s.combat.enemies.find(a=>a.id===input.targetId);
  if(!actor||actor.hp<=0||!target||target.hp<=0||target.removed)inputResult(s,input,'rejected','施法者或目标已失效');
  else if(input.expiresAt<=s.clock)inputResult(s,input,'expired','等待施法窗口超过5秒');
 }
}
export function pendingCombatInput(s,c){return s.combat.command?.inputs?.find(row=>row.memberId===c.id);}
export function inputWaiting(s,c,sp){const occupied=sp.castMs||sp.ChannelInterruptFlags||sp.StartRecoveryTime;return !!(occupied&&(c.cast||c.nextAction>s.clock)||gcdUntil(c,sp)>s.clock);}
export function combatInputSkills(c){return combatInputSpellIds(c).map(id=>({spellId:id,name:nameOf('spells',id),rank:spellChain[id]?.rank||0,icon:icon('spells',id),targetKind:combatInputTarget(spells[id])}));}
