// Matches the game's green quest marker: at least five levels below the player.
export const isLowLevelQuest=(playerLevel,questLevel)=>playerLevel-questLevel>=5;
