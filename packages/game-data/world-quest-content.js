// Node adaptations for source script summons. These are not static spawn claims.
export const questCreaturePlacements={
 3694:['astranaar'],7750:['serpents-coil'],7729:['serpents-coil'],7918:['gadgetzan'],
 8392:['ironforge'],9136:['dreadmaul-rock'],9598:['irontree'],10296:['lower-blackrock-spire'],
 10776:['upper-blackrock-spire'],12580:['keep'],13716:['maraudon-inner'],12238:['maraudon-inner'],
 14504:['dire-maul-west'],14524:['irontree'],14525:['irontree'],14526:['irontree'],
 14566:['dire-maul-west'],14568:['scholomance'],
 16031:['stratholme-undead'],16073:['upper-blackrock-spire'],
};
export const questObjectPlacements={112877:['uldaman'],142194:['steamwheedle'],142343:['gadgetzan']};
// Explicit product scope, independent from where a quest happens to be offered.
export const excludedQuestZones=new Set([2597,3277,3358,2677,2159,3428,3429,3456,1977,-284,-364,-365,-366,-368,-22,-369,-370,-374,-376]);
export const excludedQuestIds=new Set([
 9121,9122,9123,9033,9165,9292,9310,9419,9422,9664,9665,
 8508,8597,8598,8599,8733,8742,8743,
 ...Array.from({length:19},(_,i)=>7660+i), // Retired mount exchange records.
]);
export function questScopeReason(q){
 if(excludedQuestZones.has(q.ZoneOrSort))return '未开放的节日、战场或后续团队阶段';
 if(excludedQuestIds.has(q.entry))return '后续阶段或已废弃内容';
 return '';
}

// Script rewards with no static loot row. Inputs and encounters remain required.
export const questItemActions={
 8072:{locations:['sludge-fen'],name:'潜入高塔并取得钥匙',duration:15000,classId:4},
 11522:{locations:['steamwheedle'],name:'召唤并挑战亚奎门塔斯',duration:5000,enemy:9453},
 11413:{locations:['terror-run'],name:'前往葛拉卡温泉装满娜玛拉之瓶',duration:10000},
 11952:{locations:['irontree'],name:'净化夜龙草并采集',duration:15000,inputs:[[11516,4]]},
 11951:{locations:['irontree'],name:'净化鞭根草并采集',duration:15000,inputs:[[11516,3]]},
 12885:{locations:['darrowshire'],name:'拼合帕米拉的洋娃娃',duration:5000,inputs:[[12886,1],[12887,1],[12888,1]]},
 13155:{locations:['darrowshire'],name:'用神秘水晶净化徽记',duration:10000,inputs:[[13157,1]]},
 3935:{locations:['booty-bay'],name:'用食物引出奈古拉什',duration:5000,enemy:1494,inputs:[[3409,10],[4595,5]]},
 20513:{locations:['twilight-base'],name:'召唤并挑战深渊圣殿骑士',duration:5000,enemy:15209,inputs:[[20406,1],[20407,1],[20408,1]]},
 20514:{locations:['twilight-base'],name:'召唤并挑战深渊公爵',duration:5000,enemy:15206,inputs:[[20406,1],[20407,1],[20408,1],[20422,1]]},
 20515:{locations:['twilight-base'],name:'召唤并挑战深渊领主',duration:5000,enemy:15203,inputs:[[20406,1],[20407,1],[20408,1],[20451,1]]},
};
export const questFishingSources={12238:{locations:['auberdine'],required:1},13890:{locations:['caer-darrow'],required:250},13757:{locations:['caer-darrow'],required:250}};
