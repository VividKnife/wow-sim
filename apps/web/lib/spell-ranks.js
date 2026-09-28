// Keep one version per spell, preserving the order in which spell families appear.
export function highestSpellRanks(skills){
 const families=new Map();
 const rank=skill=>Number(String(skill.rank||'').match(/\d+/)?.[0]||0);
 for(const skill of skills){
  const key=skill.nameEn||skill.name||skill.spellId;
  const current=families.get(key);
  if(!current||rank(skill)>rank(current)||rank(skill)===rank(current)&&(skill.requiredLevel||0)>(current.requiredLevel||0))families.set(key,skill);
 }
 return [...families.values()];
}

export function spellbookSkills(skills,filter='已学习'){
 const eligible=skills.filter(skill=>filter==='全部'||filter==='已学习'&&skill.known||filter==='可学习'&&skill.canTrain||filter==='未学习'&&!skill.known);
 if(filter!=='全部')return highestSpellRanks(eligible);
 // In the overview, show the highest learned version before future versions.
 const learned=new Map(highestSpellRanks(eligible.filter(skill=>skill.known)).map(skill=>[skill.nameEn||skill.name||skill.spellId,skill]));
 return highestSpellRanks(eligible).map(skill=>learned.get(skill.nameEn||skill.name||skill.spellId)||skill);
}
