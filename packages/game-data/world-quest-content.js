// Classic quest journal categories. Wings share a category, including delivery
// and follow-up quests whose immediate objectives are outside the instance.
export const dungeonQuestZones={
 'deadmines':1581,'stockades':717,'ragefire-chasm':2437,'wailing-caverns':718,
 'shadowfang-keep':209,'blackfathom-deeps':719,'gnomeregan':133,'razorfen-kraul':1717,
 'scarlet-monastery-graveyard':796,'scarlet-monastery-library':796,
 'scarlet-monastery-armory':796,'scarlet-monastery-cathedral':796,
 'razorfen-downs':722,'uldaman':1337,'zul-farrak':978,
 'maraudon-purple':2100,'maraudon-orange':2100,'maraudon-inner':2100,
 'sunken-temple':1477,'blackrock-depths':1584,
 'lower-blackrock-spire':1583,'upper-blackrock-spire':1583,
 'dire-maul-east':2557,'dire-maul-west':2557,'dire-maul-north':2557,
 'scholomance':2057,'stratholme-live':2017,'stratholme-undead':2017,
 'molten-core':2717,'onyxias-lair':2159,
};

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
 8072:{locations:['sludge-fen'],name:'潜入高塔并取得钥匙',classId:4},
 11522:{locations:['steamwheedle'],name:'召唤并挑战亚奎门塔斯',enemy:9453},
 11413:{locations:['terror-run'],name:'前往葛拉卡温泉装满娜玛拉之瓶'},
 11952:{locations:['irontree'],name:'净化夜龙草并采集',inputs:[[11516,4]]},
 11951:{locations:['irontree'],name:'净化鞭根草并采集',inputs:[[11516,3]]},
 12885:{locations:['darrowshire'],name:'拼合帕米拉的洋娃娃',inputs:[[12886,1],[12887,1],[12888,1]]},
 13155:{locations:['darrowshire'],name:'用神秘水晶净化徽记',inputs:[[13157,1]]},
 3935:{locations:['booty-bay'],name:'用食物引出奈古拉什',enemy:1494,inputs:[[3409,10],[4595,5]]},
 20513:{locations:['twilight-base'],name:'召唤并挑战深渊圣殿骑士',enemy:15209,inputs:[[20406,1],[20407,1],[20408,1]]},
 20514:{locations:['twilight-base'],name:'召唤并挑战深渊公爵',enemy:15206,inputs:[[20406,1],[20407,1],[20408,1],[20422,1]]},
 20515:{locations:['twilight-base'],name:'召唤并挑战深渊领主',enemy:15203,inputs:[[20406,1],[20407,1],[20408,1],[20451,1]]},
};
export const questFishingSources={12238:{locations:['auberdine'],required:1},13890:{locations:['caer-darrow'],required:250},13757:{locations:['caer-darrow'],required:250}};
