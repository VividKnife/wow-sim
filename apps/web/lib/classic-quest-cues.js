// Match the quest marks shown by nearby NPCs: five levels below is green,
// while quests three or more levels above are orange or red.
export function isYellowQuest(level, playerLevel) {
 return Number.isFinite(level) && level >= playerLevel - 4 && level <= playerLevel + 2;
}

export function hasNearbyQuestCue(interactions, quests, playerLevel) {
 const byId = new Map(quests.map(quest => [quest.id, quest]));
 return interactions.some(npc =>
  npc.accepts.some(id => {
   const quest = byId.get(id);
   return quest?.canAccept && isYellowQuest(quest.level, playerLevel);
  }) || npc.turnIns.some(id => {
   const quest = byId.get(id);
   return quest?.canTurnIn && quest.complete;
  })
 );
}

export function hasOutdoorQuestTarget(monsters) {
 return monsters.some(monster => monster.quest);
}
