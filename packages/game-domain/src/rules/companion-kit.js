// Quest-issued level-18 green equipment. These are adaptation items, not source loot.
// Keep a stable catalog so inventory, tooltips and persistence use ordinary items.
export function companionKitItems(){
 const result=[];
 for(const [kind,armor,stat] of [['tank',3,4],['melee',2,3],['caster',1,5]]){
  for(const [slot,label,type] of [[1,'头盔',1],[2,'项链',2],[3,'肩甲',3],[5,'胸甲',5],[6,'腰带',6],[7,'护腿',7],[8,'长靴',8],[9,'护腕',9],[10,'手套',10],[11,'戒指',11],[12,'指环',11],[13,'徽记',12],[14,'护符',12],[15,'披风',16]]){
   const entry=990000+['tank','melee','caster'].indexOf(kind)*100+slot;
   const armored=[1,3,5,6,7,8,9,10].includes(slot);
   result.push({entry,name:'同盟新兵'+label,class:4,subclass:armored?armor:slot===15?1:0,InventoryType:type,Quality:2,ItemLevel:20,RequiredLevel:18,AllowableClass:-1,AllowableRace:-1,armor:armored?armor*25:slot===15?15:0,stat_type1:7,stat_value1:2,stat_type2:stat,stat_value2:3,stackable:1,bonding:1,SellPrice:0,BuyPrice:0,MaxDurability:0,companionKit:kind,companionSlot:slot});
  }
 }
 return result;
}
