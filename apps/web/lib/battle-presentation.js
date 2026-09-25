// World encounters are watched in-place. Dungeon/raid pages retain their dialog.
export function inlineWorldBattle(tab,dungeon){return tab==='world'&&!dungeon;}
export function opensBattleDialog(command,inline){
 return command.type==='goldStart'||command.type==='raidStart'||
  !inline&&(command.type==='hunt'||command.type==='useQuestItem'&&command.id===7308);
}
