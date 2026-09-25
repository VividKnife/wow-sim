/** Consume each reward once, starting after the snapshot that opened the character. */
export function createExperienceNotifications(state){
 let characterId=state.id,sequence=state.logSequence||0;
 return snapshot=>{
  if(snapshot.id!==characterId||snapshot.logSequence<sequence){characterId=snapshot.id;sequence=snapshot.logSequence||0;return [];}
  const rewards=(snapshot.logs||[]).filter(log=>log.id>sequence&&log.kind==='xp'&&Number.isFinite(log.amount)&&log.amount>0);
  sequence=Math.max(sequence,snapshot.logSequence||0);
  return rewards;
 };
}
