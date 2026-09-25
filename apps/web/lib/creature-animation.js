// Native AnimationData IDs. Every choice is resolved against the actual clips
// in the imported asset; no claim that every creature has every humanoid emote.
const choices={idle:[0],walk:[4,5,0],attack:[17,16,19,18],cast:[53,54,32,16],hurt:[9,8,10],
 dead:[1],stun:[14,8,0],submerge:[201],emerge:[127],surrender:[0]};
export function creatureClip(animations,action){
 const id=(choices[action]||choices.idle).find(id=>animations.includes(id))??0;
 return `anim_${id}`;
}
export function creatureAction(unit,effects,clock,wall,moving){
 const cue=unit.modelAnimation;
 if(cue?.action==='surrender'&&cue.startedAt<=clock&&clock<=cue.until)return {action:'surrender',key:cue.startedAt};
 if(unit.hp<=0)return {action:'dead',key:'death'};
 if(cue&&cue.startedAt<=clock&&clock<cue.until)return {action:cue.action,key:cue.startedAt};
 if(unit.stunUntil>clock)return {action:'stun',key:'stun'};
 if(unit.cast?.until>clock)return {action:'cast',key:unit.cast.startedAt};
 const recent=effects.filter(e=>wall>=e.shownAt&&wall-e.shownAt<600);
 const attack=recent.findLast(e=>e.actorId===unit.id&&!e.periodic&&['damage','incoming','cast','heal','launch','miss'].includes(e.kind));
 if(attack)return {action:attack.spellId||['cast','heal','launch'].includes(attack.kind)?'cast':'attack',key:attack.id??attack.shownAt};
 const hurt=recent.findLast(e=>e.targetId===unit.id&&e.amount>0&&e.kind!=='heal'&&wall-e.shownAt<200);
 if(hurt)return {action:'hurt',key:hurt.id??hurt.shownAt};
 return {action:moving&&!(unit.rootUntil>clock)?'walk':'idle',key:'loop'};
}
export const creatureOneShot=action=>['attack','cast','hurt','dead','submerge','emerge','surrender'].includes(action);
