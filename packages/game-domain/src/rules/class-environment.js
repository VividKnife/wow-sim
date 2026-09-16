import {spells,lookup,nodes} from './catalog.js';
import {racialModifiers} from './racial-effects.js';
export const environmentSpellNames=new Set(['Slow Fall','Levitate','Water Breathing','Water Walking','Unending Breath','Safe Fall','Feline Grace','Aquatic Form']);
export const waterNodeIds=new Set(['mirror','crystal','coastnorth','coast','lighthouse']);
const members=s=>[s,...(s.party||[])];
function environment(c,clock=0){if(!c.environment)c.environment={mode:'shore',breathMs:60000*(1+racialModifiers(c).underwaterBreathingPct),lastTick:clock};return c.environment;}
function activeEffects(c,clock){return(c.environmentBuffs||[]).filter(b=>b.until>clock);}
export function environmentModifiers(c,clock=c.time||0){const buffs=activeEffects(c,clock),source=[...(c.learned||[]).map(id=>spells[id]).filter(sp=>sp&&(sp.Attributes&64)),...buffs.map(b=>spells[b.spell]).filter(Boolean)];let safeFall=0,slowFall=false,waterWalk=false,waterBreathing=c.form==='aquatic';for(const sp of source){if(sp.SpellName==='Feline Grace'&&c.form!=='cat')continue;for(let i=1;i<=3;i++){const aura=sp['EffectApplyAuraName'+i];if(aura===144)safeFall+=sp['EffectBasePoints'+i]+1;if([105,106].includes(aura))slowFall=true;if(aura===104)waterWalk=true;if(aura===82)waterBreathing=true;}}
 return{safeFall,slowFall,waterWalk,waterBreathing,breathMaxMs:60000*(1+racialModifiers(c).underwaterBreathingPct),swimSpeed:4.722222*(c.form==='aquatic'?1.5:1)};
}
export function environmentSpellUse(s,sp,target=s){if(!environmentSpellNames.has(sp?.SpellName))return null;const unit=typeof target==='string'?members(s).find(c=>c.id===target):target||s;let reason=!unit?'目标不在小队中':unit.hp<=0?'目标已死亡':sp.SpellName==='Aquatic Form'&&(!waterNodeIds.has(s.location)||!['swim','underwater'].includes((s.environment?.mode||'shore')))?'需要先进入水中':'';return{canUse:!reason,reason,description:sp.SpellName==='Aquatic Form'?'进入水栖形态，提高游泳速度并获得水下呼吸':'施加环境移动或呼吸效果'};}
export function executeEnvironmentSpell(s,c,target,sp){if(!environmentSpellNames.has(sp?.SpellName))return false;if(!environmentSpellUse(s,sp,target).canUse)return false;if(sp.SpellName==='Aquatic Form'){target.form='aquatic';target.swimming=true;return true;}if(sp.Attributes&64)return true;target.environmentBuffs??=[];target.environmentBuffs=target.environmentBuffs.filter(b=>b.spell!==sp.Id);const duration=sp.durationMs||lookup.SpellDuration[sp.DurationIndex]?.baseMs||600000;target.environmentBuffs.push({spell:sp.Id,caster:c.id,until:s.clock+(duration<0?Number.MAX_SAFE_INTEGER:duration)});return true;}
export function environmentAction(s,action){const mode=action.mode;if(!['swim','dive','surface','shore'].includes(mode))throw new Error('无效的环境动作');if(s.hp<=0)throw new Error('死亡时无法游泳');if(s.combat||s.dungeon||!['idle','hunt'].includes(s.activity?.type||'idle'))throw new Error('请先结束当前活动');if(!waterNodeIds.has(s.location))throw new Error('当前位置没有可进入的水域');const old=environment(s,s.clock),mods=environmentModifiers(s,s.clock);if(old.mode==='shore')old.breathMs=mods.breathMaxMs;old.mode=mode==='dive'?'underwater':mode==='shore'?'shore':mode==='surface'&&mods.waterWalk?'waterwalk':'swim';old.lastTick=s.clock;if(old.mode!=='underwater')old.nextDrown=null;s.swimming=['swim','underwater'].includes(old.mode);if(mode==='shore'&&s.form==='aquatic')s.form=null;return true;}
function environmentalDamage(s,c,amount,label,api){if(c.hp<=0||amount<=0)return;const source={id:'environment',name:'环境',level:c.level||1,hp:0};if(api.hurtPlayer)api.hurtPlayer(s,source,c,amount,label,{periodic:true,school:0,environmental:true});else c.hp=Math.max(0,c.hp-Math.floor(amount));}
function randomLevel(s,level){let x=s.rngState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0;return Math.floor(s.rngState/4294967296*Math.max(1,level));}
// Formulas follow pinned Player.cpp GetWaterBreathingInterval and HandleFall:
// drowning=maxHP/5+urand(0,level-1); fall=(.018*(height-safeFall)-.2426)*maxHP.
export function environmentTick(s,api={}){
 for(const c of members(s)){const state=environment(c,s.clock),now=s.clock,dt=Math.max(0,now-(state.lastTick??now)),mods=environmentModifiers(c,now);state.lastTick=now;
  c.environmentBuffs=(c.environmentBuffs||[]).filter(b=>b.until>now);
  if(!waterNodeIds.has(s.location)){state.mode='shore';c.swimming=false;if(c.form==='aquatic')c.form=null;}
  if(state.mode==='waterwalk'&&!mods.waterWalk){state.mode='swim';c.swimming=true;}
  if(c.hp>0&&state.mode==='underwater'&&!mods.waterBreathing&&!(c.talentProcs?.spiritOfRedemption?.until>now)){
   const before=state.breathMs??mods.breathMaxMs;state.breathMs=Math.max(0,before-dt);if(state.breathMs===0){state.nextDrown??=now-Math.max(0,dt-before)+1000;while(c.hp>0&&state.nextDrown<=now){environmentalDamage(s,c,Math.floor((api.stats?.(c)?.maxHp||c.maxHp||c.hp)/5)+randomLevel(s,c.level||1),'溺水',api);state.nextDrown+=1000;}}
  }else{state.breathMs=Math.min(mods.breathMaxMs,(state.breathMs||0)+dt*10);if(mods.waterBreathing)state.breathMs=mods.breathMaxMs;state.nextDrown=null;}
  if(c.fall&&c.fall.landAt<=now){const fall=c.fall;c.fall=null;if(c.hp>0&&fall.height>=14.57&&!mods.slowFall&&!['swim','underwater'].includes(state.mode)){const max=api.stats?.(c)?.maxHp||c.maxHp||c.hp,amount=Math.floor(Math.max(0,Math.min(1,.018*(fall.height-mods.safeFall)-.2426))*max);environmentalDamage(s,c,amount,'坠落',api);}}
 }
}
export function environmentView(s){const state=s.environment||{mode:'shore',breathMs:environmentModifiers(s,s.clock).breathMaxMs},mods=environmentModifiers(s,s.clock),water=waterNodeIds.has(s.location);return{environment:{locationName:nodes[s.location]?.name||s.location,hasWater:water,mode:state.mode,breathMs:state.breathMs,breathMaxMs:mods.breathMaxMs,waterBreathing:mods.waterBreathing,waterWalking:mods.waterWalk,slowFall:mods.slowFall,safeFall:mods.safeFall,swimSpeed:mods.swimSpeed,canChangeMode:water&&s.hp>0&&!s.combat&&!s.dungeon&&['idle','hunt'].includes(s.activity?.type||'idle'),forms:s.form,falling:!!s.fall}};}
export function environmentDamage(c){c.environmentBuffs=(c.environmentBuffs||[]).filter(b=>!((spells[b.spell]?.AuraInterruptFlags||0)&2));}


