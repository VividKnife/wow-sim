/** Search includes bosses so players can find a named encounter. */
export function filterJournal(journal,query){
 const needle=query.trim().toLocaleLowerCase();
 return journal.filter(d=>[d.name,d.zone,...d.bosses.map(b=>b.name)].some(value=>value.toLocaleLowerCase().includes(needle)));
}
/** Browsing is local UI state; active runs always come from the server snapshot. */
export function journalSelection(data,selectedId,bossId){
 const selected=data.dungeonJournal?.find(d=>d.id===selectedId)??null;
 const expedition=data.dungeon?.active?data.dungeon:null;
 return {selected,expedition,boss:selected?.bosses.find(b=>b.id===bossId)??selected?.bosses[0]??null,
  entry:!expedition&&selected?.playable?data.dungeons?.[selected.id]??null:null};
}

/** Limit the rendered list even for bosses with large shared world-drop pools. */
export function journalLootPage(loot,{includeShared=false,query='',page=1}={}){
 const needle=query.trim().toLocaleLowerCase();
 const filtered=loot.filter(item=>(includeShared||!item.shared)&&item.name.toLocaleLowerCase().includes(needle));
 const pages=Math.max(1,Math.ceil(filtered.length/30)),current=Math.max(1,Math.min(pages,page));
 return {items:filtered.slice((current-1)*30,current*30),total:filtered.length,page:current,pages,hiddenShared:loot.filter(item=>item.shared).length};
}
