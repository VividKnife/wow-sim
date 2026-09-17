// Spell aura IDs and timing semantics follow the pinned CMaNGOS reference.
export const activeAuras=(unit,clock)=>(unit.auras||[]).filter(a=>a.until>clock);
export const hasAura=(unit,type,clock)=>activeAuras(unit,clock).some(a=>a.type===type);
export const hasSpellAura=(unit,spell,clock)=>activeAuras(unit,clock).some(a=>a.spell===spell);
export const controlled=(unit,clock)=>unit.stunUntil>clock||unit.polyUntil>clock||hasAura(unit,12,clock)||hasAura(unit,7,clock)||hasAura(unit,5,clock);
export const rooted=(unit,clock)=>unit.rootUntil>clock||hasAura(unit,26,clock);
export const schoolImmune=(unit,school,clock)=>activeAuras(unit,clock).some(a=>a.type===39&&(a.misc&(1<<school)));
export function armorWithAuras(unit,armor,clock){
 const auras=activeAuras(unit,clock);
 for(const a of auras)if(a.type===22&&(a.misc&1))armor+=a.amount;
 for(const a of auras)if(a.type===101&&(a.misc&1))armor*=1+a.amount/100;
 return Math.max(0,armor);
}
function timeMultiplier(unit,clock,types){return activeAuras(unit,clock).filter(a=>types.includes(a.type)).reduce((m,a)=>m*(a.amount>0?1/(1+a.amount/100):1-a.amount/100),1);}
export const attackTimeMultiplier=(unit,clock)=>timeMultiplier(unit,clock,[9,138]);
export const castTimeMultiplier=(unit,clock)=>timeMultiplier(unit,clock,[65]);
export const movementMultiplier=(unit,clock)=>Math.max(0,1-Math.max(0,...activeAuras(unit,clock).filter(a=>a.type===33).map(a=>-a.amount/100),...(unit.movementSlows||[]).filter(a=>a.until>clock).map(a=>a.amount)));
export function addMovementSlow(unit,slow,clock){
 // Preserve a restored legacy slow when the first source-aware slow arrives.
 if(!unit.movementSlows)unit.movementSlows=unit.slowUntil>clock?[{caster:null,spell:0,amount:unit.slow||0,until:unit.slowUntil}]:[];
 unit.movementSlows=unit.movementSlows.filter(a=>a.until>clock&&!(a.caster===slow.caster&&a.spell===slow.spell));
 unit.movementSlows.push(slow);
 // Legacy consumers retain a summary; movement uses each source's own expiry.
 const strongest=unit.movementSlows.reduce((a,b)=>b.amount>a.amount||b.amount===a.amount&&b.until>a.until?b:a);
 unit.slow=strongest.amount;unit.slowUntil=strongest.until;
}
export const physicalDamageBonus=(unit,clock)=>activeAuras(unit,clock).filter(a=>a.type===13&&(a.misc&1)).reduce((n,a)=>n+a.amount,0);

export function addCombatAura(unit,aura,clock){
 if(aura.mechanic){const immunity=activeAuras(unit,clock).find(a=>a.type===77&&a.misc===aura.mechanic);if(immunity){if(immunity.consumeOnImmune)immunity.until=clock;return;}}
 if(aura.type===27){unit.cast=null;unit.nextAction=clock;}
 // Refresh an existing effect rather than duplicating ticks or modifiers.
 unit.auras=(unit.auras||[]).filter(a=>a.until>clock&&!(a.spell===aura.spell&&a.effect===aura.effect&&(!aura.perCaster||a.caster===aura.caster)));
 unit.auras.push(aura);
 if([5,7,12].includes(aura.type)){unit.cast=null;unit.nextAction=clock;}
}
