import {stats,rng,log} from './character.js';
import {spells,nameOf} from './catalog.js';
import {onTalentEvent} from './talent-runtime.js';
import {recordMetric} from './combat-metrics.js';

function applyHealing(s,source,caster,target,amount,spell,label){
 if(!target||target.hp<=0)return;
 for(const a of target.auras||[])if(a.until>s.clock&&a.type===118)amount*=1+a.amount/100;
 if(target.racialBuff?.kind==='bloodfury'&&target.racialBuff.until>s.clock)amount*=.5;
 const actual=Math.min(Math.max(0,stats(target).maxHp-target.hp),Math.max(0,Math.round(amount)));target.hp+=actual;
 if(!actual)return;
 if(caster)onTalentEvent(s,caster,{type:'heal',target,spell:spells[spell],amount:actual,periodic:true},{stats,rng,actors:[caster,target]});
 const text=label||nameOf('spells',spell);
 recordMetric(s,source,target,actual,{kind:'healing',effective:true,spellId:spell,label:text});
 if(s.combat){
  if(caster){
   const enemies=s.combat.enemies.filter(e=>e.hp>0&&!e.removed);
   for(const e of enemies)e.threat[caster.id]=(e.threat[caster.id]||0)+actual*.5/Math.max(1,enemies.length);
  }
  const key=source.name+' · '+text;s.combat.healing[key]=(s.combat.healing[key]||0)+actual;
 }
 log(s,`${source.name} 的${text}为 ${target.name} 恢复 ${actual} 点生命`,'heal',{actorId:source.id,targetId:target.id,spellId:spell,amount:actual});
}
export function healAmount(s,caster,target,amount,spell,label){
 return applyHealing(s,caster,caster,target,amount,spell,label);
}
/** Applied periodic amounts belong to the recipient. An absent caster keeps
 * credit through a small source reference, without becoming a writable unit
 * or a threat target in a different instance. */
export function healPeriodicAmount(s,caster,target,effect,label){
 return applyHealing(s,caster||effect.source,caster,target,effect.amount,effect.spell,label);
}
