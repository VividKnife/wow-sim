// Match teams are sporting sides, independent of world factions.
export const WARSONG = {
 id:'warsong-gulch', name:'战歌峡谷', unlockLevel:20, teamSize:10, capturesToWin:3,
 preparationMs:10000, resurrectionMs:30000, flagReturnMs:10000, flagResetMs:10000,
 width:160, height:100,
 teams:[{name:'银翼队',color:'#72baff',base:'blue-flag',graveyard:'blue-grave',safe:'blue-roof'},
        {name:'战歌队',color:'#fa8675',base:'red-flag',graveyard:'red-grave',safe:'red-roof'}],
 nodes:[
  {id:'blue-flag',name:'银翼旗室',x:12,y:50}, {id:'blue-roof',name:'银翼高台',x:12,y:24},
  {id:'blue-ramp',name:'银翼坡道',x:33,y:24}, {id:'blue-tunnel',name:'银翼隧道',x:34,y:50},
  {id:'blue-grave',name:'银翼墓地',x:26,y:80}, {id:'blue-flank',name:'银翼侧翼',x:47,y:77},
  {id:'west-top',name:'西侧树丛',x:55,y:24}, {id:'west-mid',name:'银翼前场',x:55,y:50},
  {id:'mid-top',name:'北侧小屋',x:80,y:22}, {id:'mid',name:'中场',x:80,y:50},
  {id:'mid-bottom',name:'南侧小屋',x:80,y:78},
  {id:'east-top',name:'东侧树丛',x:105,y:24}, {id:'east-mid',name:'战歌前场',x:105,y:50},
  {id:'red-flank',name:'战歌侧翼',x:113,y:77}, {id:'red-grave',name:'战歌墓地',x:134,y:80},
  {id:'red-ramp',name:'战歌坡道',x:127,y:24}, {id:'red-tunnel',name:'战歌隧道',x:126,y:50},
  {id:'red-roof',name:'战歌高台',x:148,y:24}, {id:'red-flag',name:'战歌旗室',x:148,y:50},
 ],
 edges:[
  ['blue-flag','blue-roof'],['blue-roof','blue-ramp'],['blue-flag','blue-tunnel'],
  ['blue-ramp','west-top'],['blue-tunnel','west-mid'],['blue-grave','blue-flank'],
  ['blue-flank','west-mid'],['blue-flank','mid-bottom'],['west-top','west-mid'],
  ['west-top','mid-top'],['west-mid','mid'],['mid-top','mid'],['mid','mid-bottom'],
  ['mid-top','east-top'],['mid','east-mid'],['mid-bottom','red-flank'],
  ['east-top','east-mid'],['red-flank','east-mid'],['red-grave','red-flank'],
  ['east-top','red-ramp'],['east-mid','red-tunnel'],['red-ramp','red-roof'],
  ['red-roof','red-flag'],['red-tunnel','red-flag'],
 ],
 // Solid walls between the two base entrances. Roads go around them.
 walls:[{x:20,y:32,w:18,h:11},{x:122,y:32,w:18,h:11}],
 buffs:[{id:'blue-speed',node:'blue-tunnel',kind:'speed',name:'疾速'},
        {id:'red-speed',node:'red-tunnel',kind:'speed',name:'疾速'},
        {id:'north-berserk',node:'mid-top',kind:'berserk',name:'狂暴'},
        {id:'south-heal',node:'mid-bottom',kind:'restoration',name:'恢复'}],
};
export const BATTLEGROUND_ORDERS = [
 {id:'capture',name:'夺取敌旗',short:'夺旗',description:'前往敌方旗室取旗；持旗后自动返家，己旗失窃时退守高台。'},
 {id:'defend',name:'留守基地',short:'守家',description:'守卫旗室，优先攻击附近的敌方旗手，不被诱离基地。'},
 {id:'escort',name:'保护我方旗手',short:'护旗',description:'随我方旗手移动，治疗护送、拦截追兵；取旗前支援夺旗手。'},
 {id:'recover',name:'追回我方旗帜',short:'追旗',description:'追击敌方旗手，击杀后归还己旗；己旗安全时在前场拦截。'},
 {id:'midfield',name:'中场拦截',short:'中场',description:'控制中场，优先拦截敌方旗手和进入射程的敌人。'},
 {id:'rally',name:'指定地点集合',short:'集合',description:'前往地图选定的位置并驻守，可用于接应、撤退或组织下一轮进攻。'},
];
export const BATTLEGROUND_ROUTES = [{id:'tunnel',name:'隧道 · 最短路线'},{id:'ramp',name:'坡道 · 北侧迂回'},{id:'flank',name:'侧翼 · 南侧绕行'}];
