// Shared presentation constants; no server catalogue is imported by the canvas.
/** @type {Record<number,{name:string,color:string,frame:number[],hint:string}>} */
export const classCombatMeta={
 1:{name:'战士',color:'#c69b6d',frame:[0,0],hint:'按姿态、怒气与触发条件安排攻击；留意防御技能和下一次武器挥击。'},
 2:{name:'圣骑士',color:'#f48cba',frame:[0,2],hint:'留意圣印、光环和审判效果；治疗与防护能力消耗法力。'},
 3:{name:'猎人',color:'#aad372',frame:[0,1],hint:'自动射击需要合适距离；查看守护、陷阱和宠物状态，可直接下达宠物命令。'},
 4:{name:'潜行者',color:'#fff468',frame:[2,0],hint:'连击点属于指定目标；留意能量、潜行、毒药和终结技。'},
 5:{name:'牧师',color:'#eeeeee',frame:[2,1],hint:'查看队友生命、护盾和虚弱灵魂；治疗与引导都显示当前目标。'},
 7:{name:'萨满祭司',color:'#0070dd',frame:[1,1],hint:'四种元素各保留一个图腾；留意图腾寿命、护盾充能和武器强化。'},
 8:{name:'法师',color:'#3fc7eb',frame:[1,0],hint:'留意护甲、吸收盾、控场和冷却；引导会显示剩余时间。'},
 9:{name:'术士',color:'#8788ee',frame:[3,1],hint:'查看诅咒、持续伤害、灵魂碎片和恶魔；引导吸取与宠物状态分开显示。'},
 11:{name:'德鲁伊',color:'#ff7c0a',frame:[3,0],hint:'形态决定当前资源；熊和猎豹同时保留法力显示，猎豹连击点绑定目标。'},
};
export function classResource(actor,derived={}){
 const make=(name,key,max,value=actor[key]||0)=>({name,key,max:Math.max(0,max||0),value:Math.max(0,Math.min(max||0,value)),tone:key==='rage'?'rage':key==='energy'||key==='focus'?'energy':'mana'});
 if(actor.totemUnit)return null;
 if(actor.petUnit&&actor.kind==='beast')return make('集中值','focus',100,actor.focus??100);
 if(actor.classId===1||actor.classId===11&&actor.form==='bear')return make('怒气','rage',100,(actor.rage||0)/10);
 if(actor.classId===4||actor.classId===11&&actor.form==='cat')return make('能量','energy',derived.maxEnergy||100);
 return make('法力','mana',derived.maxMana??actor.maxMana??0);
}
