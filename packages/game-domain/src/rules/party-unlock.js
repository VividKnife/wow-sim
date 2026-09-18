export const PARTY_LEVEL=18;
export const PARTY_QUEST=900001;
export const PARTY_REPLACEMENT_COST=100000;
export function syncPartyQuest(s){
 if(s.growthPolicy==='companion'||s.level<PARTY_LEVEL||s.completed[PARTY_QUEST]||s.quests[PARTY_QUEST])return;
 s.quests[PARTY_QUEST]={kills:{},event:false,acceptedAt:s.clock,expiresAt:0};
}
export const partyUnlocked=s=>s.level>=PARTY_LEVEL&&!!s.completed?.[PARTY_QUEST];
