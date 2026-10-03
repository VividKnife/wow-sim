// Presentation only: never creates characters, advances time or changes a save.
export const classicMenus=[
 {id:'nearby',name:'附近人物',icon:'inv_misc_head_human_01',key:'N'},
 {id:'quests',name:'任务',icon:'inv_misc_book_09',key:'L'},
 {id:'character',name:'角色',icon:'inv_helmet_03',key:'C'},
 {id:'bag',name:'背包',icon:'inv_misc_bag_08',key:'B'},
 {id:'finder',name:'地下城查找器',icon:'spell_holy_prayerofhealing',key:'I'},
 {id:'dungeon',name:'地下城手册',icon:'inv_misc_head_dragon_01',key:'J'},
 {id:'party',name:'社交与组队',icon:'spell_holy_prayerofhealing',key:'P'},
 {id:'map',name:'世界地图',icon:'inv_misc_map_01',key:'M'},
];
export function webTabForClassic(panel){if(panel==='finder')return 'party';return ['character','bag','mounts'].includes(panel)?'character':['party','dungeon','raid','pvp','log'].includes(panel)?panel:'world';}
export function classicStopAction(state,data){
 if(data.goldRaid?.active)return {command:{type:'goldPause'},label:'暂停金团推进',disabled:!data.goldRaid?.map?.autoAdvance};
 if(state.dungeon)return {command:{type:'dungeonPause'},label:'暂停副本推进',disabled:!data.dungeon?.autoAdvance};
 const travel=state.activity.type==='travel';
 return {command:{type:'stop'},label:state.combat&&state.activity.stopQueued?'已排队：本场结束后停止':state.combat?'本场结束后停止':state.activity.flight?'下一站停靠':'停止活动',disabled:state.hp<=0||travel&&!state.activity.flight||!!state.activity.stopAtNext||['idle','dungeonCannon'].includes(state.activity.type)};
}
