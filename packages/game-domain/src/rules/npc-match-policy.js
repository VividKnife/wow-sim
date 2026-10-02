export const NPC_LEVEL_RANGE={below:1,above:3};
export const npcLevelFits=(level,leaderLevel)=>Number.isSafeInteger(level)&&level>=Math.max(10,leaderLevel-NPC_LEVEL_RANGE.below)&&level<=Math.min(60,leaderLevel+NPC_LEVEL_RANGE.above);
export function dungeonLevelsFit(members,leaderId,minimumLevel){
 const leader=members.find(m=>m.id===leaderId&&!m.npc);if(!leader)return false;
 return members.every(m=>Number.isSafeInteger(m.level)&&m.level>=minimumLevel&&m.level<=60&&(!m.npc||npcLevelFits(m.level,leader.level)));
}
