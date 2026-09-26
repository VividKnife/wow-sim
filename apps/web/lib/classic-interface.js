// Presentation only: never creates characters, advances time or changes a save.
export const classicMenus=[
 {id:'nearby',name:'附近人物',icon:'spell_holy_magicalsentry',key:'N'},
 {id:'quests',name:'任务',icon:'inv_misc_book_09',key:'L'},
 {id:'character',name:'角色',icon:'inv_helmet_03',key:'C'},
 {id:'bag',name:'背包',icon:'inv_misc_bag_08',key:'B'},
 {id:'dungeon',name:'地下城',icon:'inv_misc_head_dragon_01',key:'I'},
 {id:'pvp',name:'PvP',icon:'inv_sword_04',key:'H'},
 {id:'party',name:'队伍',icon:'spell_holy_prayerofhealing',key:'P'},
 {id:'map',name:'世界地图',icon:'inv_misc_map_01',key:'M'},
];
export function webTabForClassic(panel){return ['character','bag','mounts'].includes(panel)?'character':['party','dungeon','raid','pvp','log'].includes(panel)?panel:'world';}
export function classicStopAction(state,data){
 if(data.goldRaid?.active)return {command:{type:'goldPause'},label:'暂停金团推进',disabled:!data.goldRaid?.map?.autoAdvance};
 if(state.dungeon)return {command:{type:'dungeonPause'},label:'暂停副本推进',disabled:!data.dungeon?.autoAdvance};
 const travel=state.activity.type==='travel';
 return {command:{type:'stop'},label:state.combat?'本场结束后停止':state.activity.flight?'下一站停靠':'停止活动',disabled:state.hp<=0||travel&&!state.activity.flight||!!state.activity.stopAtNext||['idle','dungeonCannon'].includes(state.activity.type)};
}
