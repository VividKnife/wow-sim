import {table,items,spells,spellChain,xpTable,talents,startingItems,lookup,creatures,nameOf} from './catalog.js';
export const clone=x=>JSON.parse(JSON.stringify(x));
export function rng(s){let x=s.rngState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rngState=x>>>0;return s.rngState/4294967296;}
export const roll=(s,min,max)=>Math.floor(min+rng(s)*(max-min+1));
export function log(s,text,kind='info'){s.logs.push({id:++s.logSequence,at:s.clock,text,kind});if(s.logs.length>140)s.logs.shift();}
export const slotOf=i=>({20:5,17:16,13:16,21:16,22:17,23:17,15:18,26:18})[i.InventoryType]||i.InventoryType;
export function canEquip(c,i){return !!i&&i.RequiredLevel<=c.level&&(i.AllowableClass===-1||!i.AllowableClass||(i.AllowableClass&(1<<(c.classId-1))))&&(i.AllowableRace===-1||!i.AllowableRace||(i.AllowableRace&1))&&(!i.RequiredSkill)&&((i.class===4&&(i.subclass<=({1:3,4:2,5:1,8:1}[c.classId]||1)||i.subclass===6&&c.classId===1))||(i.class===2&&({1:[0,1,4,5,6,7,8,10,13,15,16,18],4:[0,4,7,13,15,16,18],5:[4,10,15,19],8:[7,10,15,19]}[c.classId]||[]).includes(i.subclass))||i.InventoryType===4);}
export function talentRank(c,name){return Object.values(talents).find(t=>t.name===name)?c.talents?.[Object.values(talents).find(t=>t.name===name).id]||0:0;}
export function stats(c){
 const base=table('player_levelstats').find(r=>r.race===1&&r.class===c.classId&&r.level===Math.min(20,c.level));
 const classBase=table('player_classlevelstats').find(r=>r.class===c.classId&&r.level===Math.min(20,c.level));
 const result={str:base.str,agi:base.agi,sta:base.sta,int:base.inte,spi:base.spi,armor:base.agi*2,spellPower:0,healing:0};
 for(const e of Object.values(c.equipment||{})){const i=items[e.id];if(!i||e.durability===0&&i.MaxDurability)continue;result.armor+=i.armor;for(let n=1;n<=10;n++){const key={3:'agi',4:'str',5:'int',6:'spi',7:'sta'}[i['stat_type'+n]];if(key)result[key]+=i['stat_value'+n];}for(let n=1;n<=5;n++){const aura=spells[i['spellid_'+n]];if(i['spelltrigger_'+n]!==1||!aura)continue;for(let j=1;j<=3;j++){if(aura['EffectApplyAuraName'+j]===13)result.spellPower+=aura['EffectBasePoints'+j]+1;if(aura['EffectApplyAuraName'+j]===135)result.healing+=aura['EffectBasePoints'+j]+1;}}}
 for(const a of Object.values(c.buffs||{})){if(a.until<=c.time)continue;if(a.kind==='int')result.int+=a.amount;if(a.kind==='armor')result.armor+=a.amount;if(a.kind==='sta')result.sta+=a.amount;}
 result.maxHp=classBase.basehp+Math.min(20,result.sta)+Math.max(0,result.sta-20)*10;
 result.maxMana=classBase.basemana?classBase.basemana+Math.min(20,result.int)+Math.max(0,result.int-20)*15:0;
 result.maxMana=Math.floor(result.maxMana*(1+.02*talentRank(c,'Arcane Mind')));
 result.maxHp=Math.floor(result.maxHp*(1+.02*talentRank(c,'Endurance')));
 result.baseMana=classBase.basemana;result.crit=.05;result.spellCrit=.01+result.int/({8:59.5,5:59.2}[c.classId]||60)/100;
 result.attackPower=Math.max(0,c.classId===4?c.str+c.agi+c.level*2-20:result.str*2+c.level*({1:3,8:0,5:0}[c.classId]||0)-20);
 return result;
}
export function newCharacter(name,classId=8,level=1){const c={id:'player',name,classId,level,xp:0,equipment:{},talents:{},learned:[133,168],cooldowns:{},buffs:{},hp:0,mana:0,time:0,lastManaUse:-5000};return c;}
export function makeItem(s,id,count=1){const i=items[id];if(!i)throw new Error('物品数据缺失：'+id);return{uid:'i'+(++s.itemSequence),id,count,durability:i.MaxDurability,bound:!!(i.bonding===1||i.bonding===4)};}
export function equipStarter(s){for(const row of startingItems){const i=items[row.itemId];const item=makeItem(s,row.itemId,row.count);if(i.InventoryType&&i.class!==1)s.equipment[slotOf(i)]=item;else s.bag.push(item);}const st=stats(s);s.hp=st.maxHp;s.mana=st.maxMana;}
export const countItem=(s,id)=>s.bag.filter(i=>i.id===id).reduce((n,i)=>n+i.count,0);
export const bagCapacity=s=>16+s.bags.reduce((n,i)=>n+(items[i.id]?.ContainerSlots||0),0);
export function takeItem(s,id,count){if(countItem(s,id)<count)throw new Error('缺少 '+nameOf('items',id));for(const item of [...s.bag]){if(item.id!==id)continue;const used=Math.min(item.count,count);item.count-=used;count-=used;if(!item.count)s.bag.splice(s.bag.indexOf(item),1);if(!count)break;}}
export function addItem(s,id,count=1,pending=true){const data=items[id];if(!data)return false;if(data.maxcount>0)count=Math.min(count,Math.max(0,data.maxcount-countItem(s,id)-Object.values(s.equipment).filter(i=>i.id===id).length));const max=Math.max(1,data.stackable);for(const item of s.bag.filter(i=>i.id===id&&i.count<max)){const n=Math.min(count,max-item.count);item.count+=n;count-=n;}
 while(count>0&&s.bag.length<bagCapacity(s)){const n=Math.min(max,count);s.bag.push(makeItem(s,id,n));count-=n;}
 if(count&&pending)s.pending.push(makeItem(s,id,count));return count===0;
}
export function gainXp(s,c,amount){if(c.level>=20)return;c.xp+=amount;if(c===s)s.totals.xp+=amount;while(c.level<20&&c.xp>=xpTable[c.level].xp_for_next_level){c.xp-=xpTable[c.level].xp_for_next_level;c.level++;const st=stats(c);c.hp=st.maxHp;c.mana=st.maxMana;log(s,`${c.name} 升到了 ${c.level} 级！`,'level');}if(c.level===20)c.xp=0;}
export function killXp(playerLevel,mobLevel,elite=false,dungeon=false){const diff=mobLevel-playerLevel;const base=playerLevel*5+45;const trivial=playerLevel<10?4:playerLevel<20?5:6;const zd=playerLevel<8?5:playerLevel<10?6:playerLevel<12?7:playerLevel<16?8:playerLevel<20?9:11;let amount=diff>=0?base*(1+.05*Math.min(4,diff)):-diff<=trivial?base*(1+diff/zd):0;if(elite)amount*=dungeon?2.5:2;const integer=Math.floor(amount),fraction=amount-integer;return fraction===.5?integer+(integer%2):Math.round(amount);}
export function knownRank(c,first){const original=spells[first];return c.learned.filter(id=>spells[id]&&((spellChain[id]?.first_spell||id)===first||spells[id].SpellName===original?.SpellName)).sort((a,b)=>spells[b].SpellLevel-spells[a].SpellLevel)[0]||null;}
export function spellInfo(c,id){const sp=spells[id];if(!sp)return null;const cast=lookup.SpellCastTimes[sp.CastingTimeIndex];const duration=lookup.SpellDuration[sp.DurationIndex];const range=lookup.SpellRange[sp.RangeIndex];let castMs=Math.max(cast?.minimumMs||0,(cast?.baseMs||0)+(cast?.perLevelMs||0)*c.level);if(sp.SpellName==='Fireball')castMs-=talentRank(c,'Improved Fireball')*100;if(sp.SpellName==='Frostbolt')castMs-=talentRank(c,'Improved Frostbolt')*100;
 let mana=sp.ManaCost+sp.ManaCostPerlevel*Math.max(0,c.level-sp.SpellLevel)+stats(c).baseMana*sp.ManaCostPercentage/100;if(sp.School===4)mana*=1-.05*talentRank(c,'Frost Channeling');
 return{...sp,castMs:Math.max(0,castMs),durationMs:Math.max(0,duration?.baseMs||0),range:range?.maximumYards||0,mana:Math.floor(mana),cooldownMs:Math.max(sp.RecoveryTime,sp.CategoryRecoveryTime)-(sp.SpellName==='Fire Blast'?talentRank(c,'Improved Fire Blast')*500:sp.SpellName==='Frost Nova'?talentRank(c,'Improved Frost Nova')*2000:0)};
}
export function effectRange(c,sp,n=1){const level=Math.max(0,Math.min(c.level,sp.MaxLevel||c.level)-sp.SpellLevel);const base=sp['EffectBasePoints'+n]+level*sp['EffectRealPointsPerLevel'+n];const dice=Math.max(1,sp['EffectDieSides'+n]+level*sp['EffectDicePerLevel'+n]);return[Math.floor(base+Math.max(1,sp['EffectBaseDice'+n])),Math.floor(base+dice)];}
export const armorReduction=(armor,level)=>Math.min(.75,Math.max(0,armor)/(Math.max(0,armor)+400+85*level));
export function enemy(s,id,key){const raw=creatures[id];if(!raw)throw new Error('怪物数据不存在');const level=roll(s,raw.MinLevel,raw.MaxLevel);const base=table('creature_template_classlevelstats').find(r=>r.Level===level&&r.Class===raw.UnitClass)||table('creature_template_classlevelstats').find(r=>r.Level===level);const fraction=raw.MaxLevel===raw.MinLevel?0:(level-raw.MinLevel)/(raw.MaxLevel-raw.MinLevel);const hp=Math.round(raw.MinLevelHealth>0?raw.MinLevelHealth+(raw.MaxLevelHealth-raw.MinLevelHealth)*fraction:base.BaseHealthExp0*raw.HealthMultiplier);const armor=raw.Armor||Math.round(base.BaseArmor*raw.ArmorMultiplier);const swing=raw.MeleeBaseAttackTime||2000;const low=raw.MinMeleeDmg||((base.BaseDamageExp0+base.BaseMeleeAttackPower/14)*swing/1000*raw.DamageMultiplier);const high=raw.MaxMeleeDmg||low*(raw.DamageVariance||1);
 return{id:key,entry:id,name:nameOf('npcs',id),level,hp,maxHp:hp,mana:raw.MinLevelMana||base.BaseMana*raw.PowerMultiplier,armor,low,high,swing,rank:raw.Rank,threat:{},distance:30,slowUntil:0,rootUntil:0,stunUntil:0,polyUntil:0,cast:null,nextAttack:0,nextSpell:6000,dots:[],dead:false};}
