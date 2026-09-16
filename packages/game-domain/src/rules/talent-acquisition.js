import {bagCapacity,canEquip} from './character.js';
import {talents,spells,classAbilities,items} from './catalog.js';

// Learn-spell talents (e.g. shaman two-handed weapons) grant a separate spell.
// Track the transitive grant rather than assuming the talent rank is the skill.
export function talentGrantIds(ids){
 const found=new Set(),pending=[...ids];
 while(pending.length){const id=pending.pop();if(!id||found.has(id))continue;found.add(id);const sp=spells[id];if(!sp)continue;for(let n=1;n<=3;n++)if(sp['Effect'+n]===36&&sp['EffectTriggerSpell'+n])pending.push(sp['EffectTriggerSpell'+n]);}
 return found;
}
export function grantTalentRank(c,t,nextRank){
 const old=c.talents[t.id]||0,oldIds=talentGrantIds(old?[t.ranks[old-1]]:[]),newIds=talentGrantIds([t.ranks[nextRank-1]]);
 c.learned=c.learned.filter(id=>!oldIds.has(id)||newIds.has(id));c.talents[t.id]=nextRank;
 for(const id of newIds)if(!c.learned.includes(id))c.learned.push(id);
 const names=new Set([...newIds].map(id=>spells[id]?.SpellName));
 c.dormantTalentSpells=(c.dormantTalentSpells||[]).filter(id=>{if(names.has(spells[id]?.SpellName)){if(!c.learned.includes(id))c.learned.push(id);return false;}return true;});
}
export function resetTalentGrants(c){
 const selected=Object.keys(c.talents).map(id=>talents[id]).filter(Boolean);
 const granted=talentGrantIds(selected.flatMap(t=>t.ranks));
 const activeNames=new Set([...granted].filter(id=>!(spells[id]?.Attributes&64)).map(id=>spells[id]?.SpellName));
 const trained=new Set((classAbilities[c.classId]||[]).filter(a=>a.acquisition==='trainer').map(a=>a.spellId));
 c.dormantTalentSpells??=[];
 c.learned=c.learned.filter(id=>{if(granted.has(id))return false;if(activeNames.has(spells[id]?.SpellName)){if(trained.has(id)&&!c.dormantTalentSpells.includes(id))c.dormantTalentSpells.push(id);return false;}return true;});
 c.talents={};c.talentBuffs=[];c.talentProcs={};
 if((c.form==='moonkin'&&activeNames.has('Moonkin Form'))||(c.form==='shadow'&&activeNames.has('Shadowform')))c.form=null;
 for(const key of ['classBuffs','auras','hots','periodicClass'])c[key]=(c[key]||[]).filter(b=>!granted.has(b.spell)&&!activeNames.has(spells[b.spell]?.SpellName));
 for(const [slot,item]of Object.entries(c.equipment||{}))if(!canEquip(c,items[item.id])){if(c.bag.length>=bagCapacity(c))throw new Error('背包需要空位存放洗点后无法使用的装备');c.bag.push(item);delete c.equipment[slot];}

}
