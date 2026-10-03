// Classic weapon acquisition adapted to the existing node/quest scene system.
// Original item, spell, quest and creature records are imported separately.
export const weaponQuestPhases={7786:3,7787:3,9250:6,9251:6,9257:6,9269:6,9270:6,9271:6};
export const weaponQuestOverrides={
 7507:{RequiredClasses:3,RewItemId1:18513,RewItemCount1:1,RewSpellCast:0},
 7508:{RequiredClasses:3},7509:{RequiredClasses:3},
 7622:{PrevQuestId:7621},7633:{PrevQuestId:7632},
 // The blade is earned by a summoned encounter, not conjured on acceptance.
 7787:{SrcItemId:0,SrcItemCount:0},
};
export const weaponQuestLinks={
 7508:{starts:[{type:'creature',id:14368},{type:'item',id:18513}],ends:[{type:'creature',id:14368}]},
 7787:{starts:[{type:'creature',id:14347}],ends:[{type:'creature',id:14347}]},
};
export const weaponItemActions={
 18952:{locations:['ungoro-east'],name:'独自挑战诱惑者西蒙妮',enemy:14533,classId:3,solo:true},
 18953:{locations:['dreadmaul-rock'],name:'独自挑战疯狂的克林弗兰',enemy:14534,classId:3,solo:true},
 18954:{locations:['twilight-base'],name:'独自挑战屠杀者索伦诺尔',enemy:14530,classId:3,solo:true},
 18955:{locations:['frostwhisper'],name:'独自挑战毁灭者阿托留斯',enemy:14535,classId:3,solo:true},
 18492:{locations:['onyxias-lair'],name:'以奥妮克希亚之血淬火古老之刃',inputs:[[18489,1]],raidBoss:'onyxia'},
 19018:{locations:['crystal-vale'],name:'召唤并挑战逐风者桑德兰',enemy:14435},
};
// These sources are usable item interactions, never generic free quest loot.
export const weaponItemSources={19016:['crystal-vale'],18628:['blackrock-depths'],18513:['dire-maul-west'],19017:['molten-core'],18608:['stratholme-gate'],18609:['stratholme-gate'],18713:['irontree'],18715:['irontree'],17182:['blackrock-depths'],22727:['waterspring']};
export const weaponItemUses={
 18659:{label:'合成祈福',classId:5,quests:[7622],inputs:[[18659,1],[18646,1],[18665,1]],outputs:[[18608,1]]},
 18608:{label:'转化为咒逐',classId:5,transform:18609,cooldown:1800000},
 18609:{label:'转化为祈福',classId:5,transform:18608,cooldown:1800000},
 18707:{label:'合成伦鲁迪洛尔长弓',classId:3,quests:[7635,7636],inputs:[[18707,1],[18724,1]],outputs:[[18713,1]]},
 18713:{label:'向古树领取法杖',classId:3,location:'irontree',quests:[7635,7636],outputs:[[18715,1]],once:true},
 17204:{label:'合成萨弗拉斯',inputs:[[17204,1],[17193,1]],outputs:[[17182,1]]},
 17203:{label:'向罗克图斯领取契约',location:'blackrock-depths',outputs:[[18628,1]],once:true},
 18563:{label:'向德米提恩领取复生之瓶',location:'crystal-vale',outputs:[[19016,1]],once:true,untilQuest:7785},
 18564:{label:'向德米提恩领取复生之瓶',location:'crystal-vale',outputs:[[19016,1]],once:true,untilQuest:7785},
 22726:{label:'拼合埃提耶什之杖',phase:6,classIds:[5,8,9,11],inputs:[[22726,40]],outputs:[[22727,1]]},
};
