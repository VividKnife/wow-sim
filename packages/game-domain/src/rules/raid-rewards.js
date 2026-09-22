// Authored rewards for this game's 25-player raid; not original Classic loot.
export const guildRaidItems=[
 [992001,'金焰·大法师的终章',2,0,0,5,52,7,34],
 [992002,'金焰·永固壁垒',11,0,0,7,58,4,35],
 [992003,'金焰·无尽追猎',11,0,0,3,52,7,34],
 [991001,'净焰法师腰带',6,1,55,5,28,7,18],
 [991002,'净焰医者护腕',9,1,40,6,25,5,22],
 [991003,'净焰猎手护腕',9,2,90,3,28,7,18],
 [991004,'净焰守卫长靴',8,4,430,7,30,4,20],
 [991005,'净焰誓约指环',11,0,0,5,26,7,20],
 [991006,'净焰突击指环',11,0,0,3,26,4,20],
 [991011,'熔火学者冠冕',1,1,75,5,36,7,24],
 [991012,'熔火祈愿护肩',3,1,65,6,32,5,26],
 [991013,'熔火追猎胸甲',5,2,220,3,36,7,24],
 [991014,'熔火堡垒胸甲',5,4,660,7,40,4,26],
 [991015,'熔火秘法护符',2,0,0,5,32,7,24],
 [991016,'熔火锋刃项链',2,0,0,3,32,4,24],
].map(([entry,name,InventoryType,subclass,armor,t1,v1,t2,v2])=>({entry,name,InventoryType,subclass,armor,class:4,Quality:4,ItemLevel:entry>=992000?74:66,RequiredLevel:60,AllowableClass:-1,AllowableRace:-1,stat_type1:t1,stat_value1:v1,stat_type2:t2,stat_value2:v2,stackable:1,bonding:1,maxcount:0,SellPrice:25000,BuyPrice:0,MaxDurability:0,raidReward:true}));
