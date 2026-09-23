// Timings and spell identities from the pinned CMaNGOS ScriptDevAI snapshot.
// Positions, bomb machinery and awakening are adapted to the simulator arena.
// See docs/research/import/classic-boss-scripts.json for exact source hashes.
export const dungeonBossSkills={
 4275:[{spell:7588,first:1000,repeat:[2900,4800],target:'victim'},{spell:7803,first:1000,repeat:[30000,38000],target:'self',near:5},{spell:7621,first:[20000,30000],repeat:[20000,35000],target:'other'}],
 6487:[{spell:13323,first:15000,repeat:20000,target:'other'},{spell:8988,first:7500,repeat:[15000,22000],target:'self'},{spell:9433,first:[1000,3000],repeat:[2500,8500],target:'self'}],
 3975:[{spell:15496,first:7500,repeat:[7500,17500],target:'victim'},{spell:8989,first:14500,repeat:[15000,25000],target:'self'}],
 7800:[{spell:10101,first:[12000,20000],repeat:[17000,20000],target:'victim'}],
 2748:[{spell:6524,first:[7000,14000],repeat:[8000,17000],target:'self'}],
 3976:[{spell:14518,first:6000,repeat:[6000,15000],target:'victim'},{spell:5589,first:7000,repeat:[7000,18500],target:'victim'}],
 3977:[{spell:9481,first:2000,repeat:[2000,3000],target:'victim'},{spell:12039,first:13000,repeat:13000,target:'self',below:75},{spell:22187,first:8000,repeat:[22000,45000],target:'self'}],
};
export const dungeonBossGuides={
 4275:{spells:[7588,7803,7621],text:'暗影箭持续攻击主要目标，阿鲁高的诅咒威胁其他队员；靠近时会施放雷霆震击。'},
 6487:{spells:[13323,8988,9433,9438,9435],text:'注意变形术与沉默。生命降至一半时施放奥术气泡，随后引爆；气泡期间停止普通攻击。'},
 3975:{spells:[15496,8989,8269],text:'旋风斩威胁近战范围，生命低于 30% 时狂暴。倒下后还会有血色预备兵加入战斗。'},
 7800:{spells:[10101,11130,11504],text:'注意击退与步行炸弹，优先清理炸弹；生命低于一半后炸弹出现得更频繁。炸弹机关使用战斗场地改编。'},
 2748:{spells:[6524,10252,10258,10259],text:'地震影响周围队员。战斗中持续唤醒土灵，生命降低时分批唤醒守卫；先处理增援。唤醒过程使用战斗场地改编。'},
 3976:{spells:[14518,5589,8990],text:'先击倒莫格莱尼。怀特迈恩加入后，半血施放深度睡眠并复活他，随后需要同时面对两位首领。'},
 3977:{spells:[9481,12039,22187,9256,9232],text:'打断治疗并应对圣光惩击。半血进入复活阶段；莫格莱尼复活后，两位首领必须都被击败。'},
 646:{spells:[6432,6433,12787,6435,6436],text:'生命降低时跺脚并跑向武器箱，依次换上双斧和重锤。换武器期间准备治疗，重锤阶段注意猛击。'},
};
