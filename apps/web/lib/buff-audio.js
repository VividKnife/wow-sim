// These cues are unchanged Classic sound assets, not synthetic approximations.
export function buffSoundForEvent(event,skill={}){
 if(event.kind!=='buff'||!event.spellId)return null;
 const name=skill.nameEn||skill.SpellName||'';
 if(name==='Thorns')return 'buff-thorns';
 if(/^(Greater )?Blessing of /.test(name))return 'buff-blessing';
 if(['Divine Spirit','Prayer of Spirit','Shadow Protection','Prayer of Shadow Protection'].includes(name))return 'buff-protection';
 if(['Arcane Intellect','Arcane Brilliance','Power Word: Fortitude','Prayer of Fortitude','Mark of the Wild','Gift of the Wild'].includes(name))return 'buff-spirit';
 return null;
}
export function freshBuffSounds(logs,skills,afterId,clock){
 const cues=new Set();
 for(const event of logs){
  if(event.id<=afterId||event.at>clock||clock-event.at>1500)continue;
  const cue=buffSoundForEvent(event,skills.find(s=>s.spellId===event.spellId));if(cue)cues.add(cue);
 }
 return [...cues];
}
