// Display countdowns only. Eligibility and non-time blockers come from the
// server, and the cast command is still validated by the authoritative owner.
export function targetSkillUses(view,targetId,clock){
 const uses={...view.skillUses};
 for(const [spellId,use] of Object.entries(view.skillUsesByTarget?.[targetId]||{})){
  uses[spellId]={...use,remaining:Math.max(0,(view.skillUseReadyAt?.[spellId]||0)-(clock||0))};
 }
 return uses;
}
