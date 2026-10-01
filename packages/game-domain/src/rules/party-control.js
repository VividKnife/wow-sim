export const partyLeaderId=s=>s.sharedParty?.leaderId??s.id;
export const partyLeader=s=>[s,...s.party].find(c=>c.id===partyLeaderId(s));
export const sharedHumans=s=>(s.sharedParty?.participantIds?.length||0)>1||s.party.some(c=>!c.npcPlayer&&c.quests);
export const controlledPartyMembers=(s,actorId=s.id)=>[s,...s.party].filter(c=>!sharedHumans(s)||c.id===actorId||actorId===partyLeaderId(s)&&(c.npcPlayer||!c.quests));
export const dungeonControlActions=new Set(['dungeonNext','dungeonNavigate','dungeonPause','dungeonInteract','dungeonSkip']);
