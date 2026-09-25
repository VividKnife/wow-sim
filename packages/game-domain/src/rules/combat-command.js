import {spells,creatures,icon,nameOf} from './catalog.js';
import {spellInfo,log} from './character.js';
import {combatMembers} from './combat-members.js';
import {strategySpellIds,protectedTarget,areaSpell} from './combat-strategy.js';
import {aliveEnemy,areaTargets} from './combat-space.js';
import {controlled,hasAura} from '../../../sim-core/src/combat-auras.js';
import {cooldownUntil} from './spell-timing.js';

export const commandMarks={skull:'☠ 骷髅',cross:'✕ 十字',moon:'☾ 月亮',square:'■ 方块',star:'★ 星星',diamond:'◆ 菱形'};
const soft=new Set(['Polymorph','Polymorph: Turtle','Polymorph: Pig','Sap','Freezing Trap','Shackle Undead','Hibernate','Banish','Repentance','Blind','Wyvern Sting']);
const hard=new Set(['Hammer of Justice','Bash','Concussion Blow','Kidney Shot','Cheap Shot','Gouge','Frost Nova','Psychic Scream','Fear','Death Coil','Intimidating Shout']);
const interrupts=new Set(['Counterspell','Kick','Pummel','Shield Bash','Earth Shock','Silence']);
const tactics=new Set(['Taunt','Growl','Challenging Shout','Challenging Roar','Concussive Shot','Wing Clip','Frost Shock','Earthbind Totem']);
export const commandSkillKind=sp=>soft.has(sp?.SpellName)?'soft':hard.has(sp?.SpellName)?'hard':interrupts.has(sp?.SpellName)?'interrupt':tactics.has(sp?.SpellName)?'tactic':null;
const commandSkills=c=>strategySpellIds(c).filter(id=>commandSkillKind(spells[id])&&(spells[id].SpellName!=='Growl'||c.classId===11));
export const commandActors=s=>combatMembers(s).filter(c=>!c.petUnit&&!c.totemUnit&&!c.escortNpc);
export const commandAvailable=s=>!!s.combat?.dungeon&&!s.combat?.raidEncounter&&!s.combat?.pvp&&commandActors(s).length<=5;
export const commandOrder=(s,c)=>{const orders=(s.combat?.command?.orders||[]).filter(o=>o.memberId===c.id),queued=orders.find(o=>!['soft','kite'].includes(o.kind));return queued&&(queued.executed||queued.kind!=='interrupt'||s.combat.enemies.some(e=>e.id===queued.targetId&&e.cast))?queued:orders.find(o=>['soft','kite'].includes(o.kind))||queued;};
export const commandDamageMode=(s,c)=>s.combat?.command?.memberModes?.[c.id]||s.combat?.command?.mode||'auto';
export const commandDamageSpell=sp=>[1,2,3].some(n=>[2,9,17,31,58,121].includes(sp?.['Effect'+n])||sp?.['EffectApplyAuraName'+n]===3);
export const commandAreaSkills=c=>strategySpellIds(c).filter(id=>areaSpell(spells[id])&&commandDamageSpell(spells[id])&&!commandSkillKind(spells[id]));
export const commandDamageRules=(s,c)=>commandDamageMode(s,c)==='aoe'?commandAreaSkills(c).map(spell=>({spell,condition:'always',value:0,enabled:true})):[];
export function commandProtected(s,e){
 const command=s.combat?.command;if(!command||!e)return false;
 const alive=s.combat.enemies.filter(x=>aliveEnemy(x)&&!x.controlledBy);
 return alive.length>1&&command.orders.some(o=>o.targetId===e.id&&o.kind==='soft'&&commandActors(s).some(c=>c.id===o.memberId&&c.hp>0));
}
export function commandSkillReason(s,c,e,sp){
 if(!e||!aliveEnemy(e)||e.controlledBy)return '目标已失效';
 if(c.hp<=0)return '成员已倒下';
 const template=creatures[e.entry],type=template?.CreatureType||e.creatureType;
 if(sp.TargetCreatureType&&!(sp.TargetCreatureType&(1<<(type-1))))return '目标生物类型不适用';
 if(sp.SpellName==='Sap'&&type!==7)return '闷棍仅对人型生物生效';
 if(sp.SpellName==='Sap'&&s.combat.pull?.engagedAt!=null)return '闷棍需要在接战前安排';
 const mechanics=[sp.Mechanic,...[1,2,3].map(n=>sp['EffectMechanic'+n])].filter(Boolean);
 if(mechanics.some(m=>template?.MechanicImmuneMask&(1<<(m-1)))||template?.SchoolImmuneMask&(1<<sp.School))return '目标免疫该控制';
 return '';
}
export function commandWaiting(s,c,e,sp){
 const invalid=commandSkillReason(s,c,e,sp);if(invalid)return invalid;
 if(controlled(c,s.clock)||sp.School>0&&(c.silenceUntil>s.clock||hasAura(c,27,s.clock)))return '等待解除控制 / 沉默';
 if(c.cast)return '正在施法';
 if(commandSkillKind(sp)==='soft'&&(e.dots||[]).some(dot=>dot.remaining>0))return '等待目标持续伤害结束';
 if(protectedTarget(e,s.clock)&&commandSkillKind(sp)==='soft')return '正在维持控制';
 if(sp.SpellName==='Freezing Trap'&&c.trap)return '陷阱已布置，等待目标靠近';
 if(sp.SpellName==='Freezing Trap'&&s.combat.pull?.engagedAt!=null&&!(c.feignUntil>s.clock))return '需要先假死脱战才能布置陷阱';
 if(['Sap','Cheap Shot'].includes(sp.SpellName)&&!c.stealthed)return '等待潜行';
 if(sp.SpellName==='Bash'&&c.form!=='bear')return '需要熊形态';
 if(sp.SpellName==='Kidney Shot'&&(!c.combo||c.comboTarget!==e.id))return '需要该目标的连击点';
 const remaining=cooldownUntil(c,sp)-s.clock;if(remaining>0)return `等待冷却 ${Math.ceil(remaining/1000)}秒`;
 const pool=sp.PowerType===1?'rage':sp.PowerType===3?'energy':'mana';if((c[pool]||0)<sp.mana)return '等待资源';
 if(commandSkillKind(sp)==='interrupt'&&!e.cast)return '等待敌人施法';
 return '准备执行（遵守射程与公共冷却）';
}
export function combatCommandAction(s,a){
 if(a.order==='prepare'){
  if(typeof a.enabled!=='boolean'||s.combat)throw new Error('请在战斗前选择指挥模式');
  s.settings.commandCombat=a.enabled;return;
 }
 if(!commandAvailable(s)||a.encounterId!==s.combat.id)throw new Error('当前五人战斗已变化，请重新打开指挥面板');
 const battle=s.combat;
 if(a.order==='takeover'){battle.command??={paused:true,marks:{},orders:[],focusId:null,holdFire:false};battle.command.paused=true;log(s,'接管小队指挥，战斗已暂停。','info');return;}
 // A live order enables command mode without pausing or restarting the fight.
 const cmd=battle.command??={paused:false,marks:{},orders:[],focusId:null,holdFire:false};
 if(a.order==='pause'||a.order==='resume'){cmd.paused=a.order==='pause';log(s,cmd.paused?'指挥暂停。':'指挥完成，继续战斗。','info');return;}
 if(a.order==='holdFire'){if(typeof a.enabled!=='boolean')throw new Error('停火指令无效');cmd.holdFire=a.enabled;if(a.enabled)for(const c of commandActors(s))if(c.cast&&battle.enemies.some(e=>e.id===c.cast.target)){c.cast=null;c.nextAction=s.clock;}return;}
 if(a.order==='clearAll'){cmd.orders=[];cmd.marks={};cmd.focusId=null;cmd.holdFire=false;cmd.mode='auto';cmd.memberModes={};return;}
 if(a.order==='mode'){
  if(!['auto','single','aoe'].includes(a.mode))throw new Error('输出模式无效');
  const members=a.memberId?commandActors(s).filter(c=>c.id===a.memberId&&c.hp>0):commandActors(s);
  if(!members.length)throw new Error('请选择存活的参战成员');
  if(a.memberId){cmd.memberModes??={};cmd.memberModes[a.memberId]=a.mode;if(a.mode==='auto')cmd.orders=cmd.orders.filter(o=>o.memberId!==a.memberId);}
  else{cmd.mode=a.mode;cmd.memberModes={};if(a.mode==='auto'){cmd.orders=[];cmd.focusId=null;cmd.holdFire=false;}}
  for(const c of members){const sp=c.cast&&spellInfo(c,c.cast.spell);if(a.mode==='single'&&sp&&areaSpell(sp)&&commandDamageSpell(sp)){c.cast=null;c.nextAction=s.clock;}}
  return;
 }
 const e=battle.enemies.find(e=>e.id===a.targetId&&aliveEnemy(e)&&!e.controlledBy);if(!e)throw new Error('请选择存活的敌人');
 if(a.order==='mark'){if(a.mark!==''&&!Object.hasOwn(commandMarks,a.mark))throw new Error('无效的敌人标记');for(const id of Object.keys(cmd.marks))if(cmd.marks[id]===a.mark)delete cmd.marks[id];if(a.mark)cmd.marks[e.id]=a.mark;else delete cmd.marks[e.id];return;}
 if(a.order==='clear'){cmd.orders=cmd.orders.filter(o=>o.targetId!==e.id);if(cmd.focusId===e.id)cmd.focusId=null;delete cmd.marks[e.id];return;}
 if(a.order==='focus'){cmd.focusId=e.id;cmd.orders=cmd.orders.filter(o=>o.targetId!==e.id);for(const id of Object.keys(cmd.marks))if(cmd.marks[id]==='skull')delete cmd.marks[id];cmd.marks[e.id]='skull';log(s,'集火目标：'+e.name,'info');return;}
 if(!['control','kite'].includes(a.order))throw new Error('未知的指挥命令');
 const c=commandActors(s).find(c=>c.id===a.memberId&&c.hp>0);if(!c)throw new Error('请选择存活的参战成员');
 let kind='kite';
 if(a.order==='control'){
  const sp=spellInfo(c,a.spellId);kind=commandSkillKind(sp);
  if(!commandSkills(c).includes(a.spellId)||!kind)throw new Error('该成员没有学会这个控制技能');
  const reason=commandSkillReason(s,c,e,sp);if(reason)throw new Error(reason);
 }
 if(a.order==='kite'&&![3,8,9,7,11,5].includes(c.classId))throw new Error('请选择可以远程牵制的成员');
 const persistent=['soft','kite'].includes(kind);
 cmd.orders=cmd.orders.filter(o=>persistent?!(o.memberId===c.id&&['soft','kite'].includes(o.kind)||o.targetId===e.id&&['soft','kite'].includes(o.kind)):!(o.memberId===c.id&&!['soft','kite'].includes(o.kind)));
 cmd.orders.push({kind,memberId:c.id,targetId:e.id,...(a.order==='control'?{spellId:a.spellId}:{})});
 if(cmd.focusId===e.id&&kind==='soft')cmd.focusId=null;
 if(c.cast){c.cast=null;c.nextAction=s.clock;}
 // Cancel outgoing casts aimed at a newly reserved control target. Projectiles
 // already in flight and existing DoTs remain real risks; they are not erased.
 if(kind==='soft')for(const ally of commandActors(s)){const cast=ally.cast;if(!cast||cast.friendly)continue;const aim=battle.enemies.find(t=>t.id===cast.target),spell=spellInfo(ally,cast.spell);if(cast.target===e.id||spell&&areaTargets(s,ally,aim,spell,cast.center).some(t=>t.id===e.id)){ally.cast=null;ally.nextAction=s.clock;}}
 log(s,`${c.name} → ${e.name}：${kind==='kite'?'风筝牵制':nameOf('spells',a.spellId)}`,'info');
}
export function combatCommandView(s){
 if(!commandAvailable(s))return null;
 const members=commandActors(s),enemies=s.combat.enemies.filter(e=>aliveEnemy(e)&&!e.controlledBy);
 return {members:members.map(c=>({id:c.id,name:c.name,classId:c.classId,hp:c.hp,canAoe:commandAreaSkills(c).length>0,canKite:c.hp>0&&[3,8,9,7,11,5].includes(c.classId)})),skills:members.filter(c=>c.hp>0).flatMap(c=>commandSkills(c).map(id=>{const sp=spellInfo(c,id);return {memberId:c.id,memberName:c.name,spellId:id,name:nameOf('spells',id),icon:icon('spells',id),kind:commandSkillKind(sp),cooldownUntil:cooldownUntil(c,sp),range:sp.range||5,targets:Object.fromEntries(enemies.map(e=>[e.id,{reason:commandSkillReason(s,c,e,sp),status:commandWaiting(s,c,e,sp)}]))};}))};
}
