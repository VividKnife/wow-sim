import {cooldownUntil,globalCooldownRemaining} from './spell-timing.js';
import {classCombatMeta,classResource} from '../../../sim-core/src/class-combat.js';
import {combatMembers} from './combat-members.js';
import {stats,spellInfo} from './character.js';
import {spells,items,nameOf,icon} from './catalog.js';
import {effectiveSpeed} from './combat-space.js';
import {ammoCount} from './ammunition.js';

const formNames={bear:'熊形态',cat:'猎豹形态',moonkin:'枭兽形态',travel:'旅行形态',aquatic:'水栖形态',wolf:'幽魂之狼',shadow:'暗影形态'};
const petModes={passive:'被动',defensive:'防御',aggressive:'主动',follow:'跟随',stay:'停留',attack:'攻击指定目标'};
const spellKey=name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const namedSpells=new Map(Object.values(spells).map(sp=>[spellKey(sp.SpellName),sp.Id]));
const elements={earth:'大地',fire:'火焰',water:'水流',air:'空气'};
const spellDetail=id=>({spellId:Number(id),name:Number(id)===992100?'金团战斗药剂':nameOf('spells',Number(id)),icon:icon('spells',Number(id))});
const effectEnd=a=>a?.until??(a?.remaining>0&&a?.interval>0?a.next+(a.remaining-1)*a.interval:0);
function effectsFor(actor,clock){
 const result=new Map();
 const add=(a,detail='',fallback='')=>{
  const id=a?.spell??a?.spellId,until=effectEnd(a);if(!(until>clock))return;
  const key=`${id||fallback}:${a?.caster||''}:${detail}`,prior=result.get(key)||{};
  result.set(key,{...prior,...(id?spellDetail(id):{spellId:null,name:fallback,icon:null}),until:Math.max(prior.until||0,until),charges:a.charges>0&&a.charges<100000?a.charges:prior.charges,stacks:a.stacks??prior.stacks,amount:a.amount??prior.amount,detail,caster:a.caster||null});
 };
 for(const a of [...Object.values(actor.buffs||{}),...(actor.classBuffs||[]),...(actor.talentBuffs||[]),...(actor.auras||[]),...(actor.dots||[]),...(actor.hots||[]),...(actor.periodicClass||[])])add(a);
 add(actor.absorb,'吸收剩余');add(actor.manaShield,'法力护盾剩余');add(actor.seal,'圣印');add(actor.judgement,'审判');if(actor.reactiveClass?.charges!==0)add(actor.reactiveClass,'护盾充能');add(actor.soulstone,'灵魂石');
 for(const [slot,label]of [[16,'主手'],[17,'副手']]){const a=actor.weaponEnchants?.[slot]||(slot===16?actor.weaponEnchant:null);if(a&&a.charges!==0&&(!a.weaponUid||actor.equipment?.[slot]?.uid===a.weaponUid))add(a,label+'强化');}
 for(const [key,id,label]of [['weakenedSoulUntil',6788,'虚弱灵魂'],['sprintUntil',2983,'疾跑'],['innervateUntil',29166,'激活'],['hawkHasteUntil',6150,'强化雄鹰守护'],['feignUntil',5384,'假死']])add({spell:id,until:actor[key]},'',label);
 for(const [key,a]of Object.entries(actor.talentProcs||{})){const id=(actor.learned||[]).find(id=>spellKey(spells[id]?.SpellName||'')===key.toLowerCase())||namedSpells.get(key.toLowerCase());if(id)add({...a,spell:id},'天赋触发');}
 for(const [key,a]of Object.entries(actor.racialEffects||{})){const id=namedSpells.get(key==='forsaken'?'willoftheforsaken':key);if(id)add({...a,spell:id},'种族能力');}
 if(actor.racialBuff)add({...actor.racialBuff,spell:namedSpells.get(actor.racialBuff.kind)},'种族能力');
 add(actor.cannibalize,'种族能力');add({...actor.bloodrage,spell:2687},'怒气回复');
 if(actor.totemWeaponEnchant?.weaponUid===actor.equipment?.[16]?.uid)add(actor.totemWeaponEnchant,'图腾武器强化');add(actor.lightwell,'光明之泉');
 if(actor.stealthed)result.set('stealth',{spellId:null,name:actor.form==='cat'?'潜伏':'潜行',icon:null,until:null,detail:''});
 // One spell can store a numerical buff and several aura effects. Show it once.
 const grouped=new Map();for(const effect of result.values()){const key=effect.spellId?`${effect.spellId}:${effect.caster||''}:${/^[主副]手/.test(effect.detail)?effect.detail:''}`:effect.name;const old=grouped.get(key);grouped.set(key,old?{...old,...effect,until:Math.max(old.until||0,effect.until||0),detail:[...new Set([old.detail,effect.detail].filter(Boolean))].join(' · ')}:effect);}
 return [...grouped.values()];
}

export function battlePresentation(s){
 const battle=s.combat||s.lastCombat;if(!battle)return null;
 const live=!!s.combat,clock=live?s.clock:battle.endedAt,actors=live?combatMembers(s,battle):battle.actorsSnapshot||[],all=[...actors,...battle.enemies],units={};
 for(const actor of all){
  const ally=actors.includes(actor),derived=ally?(live?stats(actor):actor.stats):{maxHp:actor.maxHp,maxMana:actor.maxMana};
  const meta=classCombatMeta[actor.classId],resource=classResource(actor,derived||{}),comboTarget=all.find(t=>t.id===actor.comboTarget&&t.hp>0&&!t.removed),effects=effectsFor(actor,clock);
  const mode=actor.totemUnit?'图腾':actor.petUnit?actor.kind==='beast'?'野兽伙伴':'恶魔伙伴':formNames[actor.form]||(actor.classId===11?'人形态':actor.classId===1?({battle:'战斗姿态',defensive:'防御姿态',berserker:'狂暴姿态'})[actor.stance||'battle']:meta?.name)||'敌方单位';
  const cooldowns=[...new Set([...(actor.learned||[]),...Object.keys(actor.cooldowns||{}).map(Number),...Object.values(actor.categoryCooldowns||{}).map(r=>r.spellId)])].filter(id=>spells[id]&&cooldownUntil(actor,spells[id])>clock).map(id=>({...spellDetail(id),readyAt:cooldownUntil(actor,spells[id])})).sort((a,b)=>a.readyAt-b.readyAt);
  const totems=actor.classId===7?Object.entries(elements).map(([element,label])=>{const t=actor.totems?.[element],active=t?.until>clock&&(!t.totemUnit||t.hp>0);return{element,label,...(active?spellDetail(t.spell):{spellId:null,name:'未放置',icon:null}),id:active?t.id:null,hp:active?t.hp:null,maxHp:active?t.maxHp:null,until:active?t.until:null};}):[];
  const controlled=!!actor.controlledBy&&actor.controlUntil>clock,cast=actor.cast&&actor.cast.until>clock?{...actor.cast,...spellDetail(actor.cast.spell),targetName:all.find(a=>a.id===actor.cast.target)?.name||'区域',startedAt:actor.cast.startedAt??actor.cast.until-(spellInfo(s,actor.cast.spell)?.castMs||0)}:null;
  units[actor.id]={id:actor.id,spellId:actor.spell||null,className:meta?.name||mode,color:meta?.color||'#9fc6aa',portrait:meta?{src:'/icons/atlases/ui-charactercreate-classes.png',frame:meta.frame}:null,mode,resource,secondaryResource:actor.classId===11&&['bear','cat'].includes(actor.form)?{name:'法力',value:actor.mana||0,max:derived?.maxMana||0,tone:'mana'}:null,
   hp:actor.hp,maxHp:derived?.maxHp??actor.maxHp??0,level:actor.level,combo:actor.classId===4||actor.classId===11&&actor.form==='cat'?{value:comboTarget?Math.min(5,actor.combo||0):0,max:5,targetId:comboTarget?.id||null,targetName:comboTarget?.name||'未积累连击点'}:null,
   movement:{speed:actor.hp>0&&!actor.totemUnit?effectiveSpeed(actor,clock):0,baseSpeed:effectiveSpeed({...actor,rootUntil:0,stunUntil:0,polyUntil:0,slowUntil:0,movementSlows:[],auras:[]},clock)},
   effects,cooldowns,totems,cast,globalCooldown:globalCooldownRemaining(actor,clock),canCommand:live&&s.hp>0&&actor.hp>0&&actor.petUnit&&!actor.totemUnit&&actor.ownerId===s.id&&s.pet?.id===actor.id,petMode:petModes[actor.mode]||'防御',happiness:actor.kind==='beast'?((actor.happiness??166500)>=666000?'快乐':(actor.happiness??166500)>=333000?'满足':'不开心'):null,loyalty:actor.loyalty||null,
   controlled,ownerName:all.find(a=>a.id===(actor.ownerId||actor.controlledBy))?.name||null,controlUntil:controlled?actor.controlUntil:null,shards:actor.classId===9&&actor.id===s.id?(live?s.bag.filter(i=>i.id===6265).reduce((n,i)=>n+i.count,0):actor.soulShardCount||0):null,
   attack:actor.classId===3&&actor.learned?.includes(75)&&items[actor.equipment?.[18]?.id]&&actor.equipment[18].durability!==0&&ammoCount(actor)>0?{kind:'ranged',label:'自动射击',startedAt:actor.rangedStartedAt,until:actor.nextRanged,minRange:8,range:35}:null,
   offhand:actor.nextOffhand?{label:'副手攻击',startedAt:actor.offhandStartedAt,until:actor.nextOffhand}:null,
  };
 }
 const spellIds=[...new Set(Object.values(units).flatMap(u=>[u.spellId,...u.effects.map(e=>e.spellId),...u.cooldowns.map(c=>c.spellId),...u.totems.map(t=>t.spellId),u.cast?.spellId]).filter(Boolean))];
 const groundEffects=live?(s.groundEffects||[]).filter(a=>a.until>clock).map(a=>({...a,center:a.center||{x:a.position||0,y:a.positionY||0}})):[];
 if(live)for(const f of s.combat?.raidEncounter?.fires||[])groundEffects.push({...f,school:2,actorId:'mc-boss',spellId:19411,startedAt:f.armedAt-2500,center:{x:f.position,y:f.positionY}});
 return{live,clock,units,spellIds,groundEffects,playerId:s.id};
}
