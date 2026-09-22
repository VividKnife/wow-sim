// Authored 25-player encounters and routes; not a literal Classic spawn table.
export const moltenCoreBosses=[
 {id:'lucifron',entry:12118,name:'鲁西弗隆',subtitle:'诅咒与末日',hp:180000,low:950,high:1300,description:'副坦接住两名护卫，优先击杀护卫。法师解除诅咒，牧师驱散末日。'},
 {id:'magmadar',entry:11982,name:'玛格曼达',subtitle:'狂暴与熔岩',hp:230000,low:1300,high:1700,description:'猎人宁神射击，牧师保护主坦免受恐惧，团队离开熔岩炸弹。'},
 {id:'gehennas',entry:12259,name:'基赫纳斯',subtitle:'火雨与诅咒',hp:190000,low:1100,high:1450,description:'清理两名烈焰行者，解除降低治疗效果的诅咒，并撤出火雨。'},
 {id:'garr',entry:12057,name:'加尔',subtitle:'熔岩之誓',hp:205000,low:1150,high:1500,description:'副坦牵制四名火誓者，逐个击破。火誓者死亡爆炸并强化加尔。'},
 {id:'baron-geddon',entry:12056,name:'迦顿男爵',subtitle:'活体炸弹',hp:220000,low:1200,high:1550,description:'驱散燃烧法力的点燃，被活体炸弹点名后远离队友；地狱火期间撤离。'},
 {id:'shazzrah',entry:12264,name:'沙斯拉尔',subtitle:'奥术传送',hp:215000,low:1100,high:1500,description:'解除放大奥术伤害的诅咒。首领传送到后排后坦克重新接怪。'},
 {id:'sulfuron',entry:12098,name:'萨弗隆先驱者',subtitle:'烈焰祭司',hp:200000,low:1200,high:1550,description:'优先清理四名会治疗首领的烈焰祭司，驱散暗言术：痛。'},
 {id:'golemagg',entry:11988,name:'焚化者古雷曼格',subtitle:'熔火巨人',hp:270000,low:1400,high:1800,description:'副坦牵制两只熔岩犬，输出集中攻击首领；首领倒下后熔岩犬随之消散。'},
 {id:'majordomo',entry:12018,name:'管理者埃克索图斯',subtitle:'烈焰议会',hp:150000,low:900,high:1250,description:'前八名首领符文熄灭后现身。击败四名精英与四名医师，迫使管理者投降。'},
 {id:'ragnaros',entry:11502,name:'拉格纳罗斯',subtitle:'炎魔之王',hp:310000,low:1450,high:1850,description:'躲避熔岩爆发，应对击退。炎魔潜入熔岩时击败六名烈焰之子，迫使其重新现身。'},
].map(b=>({...b,reward:b.name+'战功'}));

export const moltenCoreTrash={
 giant:{entry:11658,name:'熔核巨人',hp:19000,low:650,high:850,ability:'践踏'},
 destroyer:{entry:11659,name:'熔核摧毁者',hp:23000,low:720,high:950,ability:'践踏'},
 hound:{entry:11671,name:'熔火恶犬',hp:12500,low:370,high:510,ability:'熔岩吐息'},
 ancient:{entry:11673,name:'上古熔火恶犬',hp:25000,low:700,high:920,ability:'恐慌'},
 imp:{entry:11669,name:'烈焰小鬼',hp:6500,low:180,high:250,ability:'火焰箭'},
 surger:{entry:12101,name:'熔岩奔腾者',hp:20000,low:580,high:770,ability:'冲击'},
 annihilator:{entry:11665,name:'熔岩歼灭者',hp:21000,low:650,high:860,ability:'冲击'},
 firelord:{entry:11668,name:'火焰之王',hp:20000,low:450,high:650,ability:'火焰之雨'},
 walker:{entry:11661,name:'烈焰行者',hp:15000,low:420,high:600,ability:'火焰箭'},
 priest:{entry:11662,name:'烈焰行者祭司',hp:12000,low:300,high:450,ability:'治疗'},
 lava:{entry:12076,name:'熔岩元素',hp:19000,low:600,high:800,ability:'熔岩吐息'},
};
const route=[];
function pack(id,name,x,y,types,parent){route.push({id,name,kind:'trash',position:[x,y],types,parent,description:'先清施法者，再由坦克牵制精英。'});}
function boss(id,x,y,parent){const b=moltenCoreBosses.find(b=>b.id===id);route.push({id,name:b.name,kind:'boss',position:[x,y],parent,description:b.description});}
pack('mc-gate','熔核入口守卫',130,105,['giant','giant'],'entrance');
pack('mc-bridge','熔岩桥巡逻',220,135,['surger','annihilator'],'mc-gate');
pack('mc-imps','烈焰小鬼群',310,155,['imp','imp','imp','imp','imp','imp'],'mc-bridge');
pack('mc-hounds-1','熔火犬巢前哨',385,115,['hound','hound','hound','hound'],'mc-imps');
boss('lucifron',465,85,'mc-hounds-1');
pack('mc-hounds-2','兽王犬群',550,125,['ancient','hound','hound'],'lucifron');
boss('magmadar',655,85,'mc-hounds-2');
pack('mc-crossing','熔火岔路',320,260,['giant','firelord'],'mc-imps');
pack('mc-gehennas','烈焰行者营地',220,315,['walker','walker','priest'],'mc-crossing');
boss('gehennas',115,355,'mc-gehennas');
pack('mc-garr','火誓者石廊',425,295,['annihilator','surger','lava'],'mc-crossing');
boss('garr',535,260,'mc-garr');
pack('mc-geddon','焚火巡逻',620,320,['firelord','lava','surger'],'garr');
boss('baron-geddon',725,285,'mc-geddon');
pack('mc-shazzrah','奥术哨所',820,335,['walker','priest','walker'],'mc-geddon');
boss('shazzrah',905,285,'mc-shazzrah');
pack('mc-descent','熔岩深处',530,400,['destroyer','giant'],'mc-garr');
pack('mc-sulfuron','先驱者卫队',660,440,['walker','priest','priest','walker'],'mc-descent');
boss('sulfuron',755,480,'mc-sulfuron');
pack('mc-golemagg','巨人熔池',400,445,['destroyer','lava','lava'],'mc-descent');
boss('golemagg',310,475,'mc-golemagg');
pack('mc-council','烈焰议会守卫',585,540,['walker','walker','priest','firelord'],'mc-descent');
boss('majordomo',660,600,'mc-council');
pack('mc-core','炎魔之路',435,580,['firelord','lava','surger','annihilator'],'majordomo');
boss('ragnaros',235,590,'mc-core');
export const moltenCoreRoute=route;
export const moltenCoreMap={width:1002,height:668,points:{entrance:[60,65],...Object.fromEntries(route.map(n=>[n.id,n.position]))},edges:route.map(n=>[n.parent,n.id]),floorByNode:Object.fromEntries(['entrance',...route.map(n=>n.id)].map(id=>[id,1])),floors:[{id:1,name:'熔火之心 · 团队路线图',image:'/maps/dungeons/molten-core.svg'}],attribution:'本作25人路线示意图'};
export function moltenCorePath(from,to){
 const queue=[[from]],seen=new Set([from]);
 for(const path of queue){const last=path.at(-1);if(last===to)return path;for(const [a,b]of moltenCoreMap.edges){const next=a===last?b:b===last?a:null;if(next&&!seen.has(next)){seen.add(next);queue.push([...path,next]);}}}return [];
}
export function raidRouteState(){return {clearedPacks:[],locationId:'entrance',destination:null,autoAdvance:false,nextAdvance:0};}
export function raidRoutePlan(r,destination){
 const isDone=id=>r.cleared.includes(id)||r.clearedPacks.includes(id);
 if(destination==='full')return route.filter(n=>!isDone(n.id)).map(n=>n.id);
 if(!route.some(n=>n.id===destination))throw new Error('未知地图目的地。');
 return moltenCorePath(r.locationId,destination).filter(id=>id!=='entrance'&&!isDone(id));
}
export function raidRouteLock(r,id){
 if(id==='majordomo'&&!moltenCoreBosses.slice(0,8).every(b=>r.cleared.includes(b.id)))return '熄灭前八名首领的符文后才能挑战管理者。';
 if(id==='ragnaros'&&!r.cleared.includes('majordomo'))return '先击败管理者埃克索图斯，才能召唤炎魔之王。';
 return '';
}
export function raidMapView(s,r,canNavigate){
 const plan=r.destination?raidRoutePlan(r,r.destination):[];
 return {id:'molten-core',name:'熔火之心',locationId:r.locationId,destination:r.destination,path:plan,autoAdvance:r.autoAdvance,canFullClear:canNavigate,navigateReason:canNavigate?'':'请先结束战斗、休整或拍卖，并领取战利品。',map:moltenCoreMap,
 route:route.map(n=>{const cleared=(n.kind==='boss'?r.cleared:r.clearedPacks).includes(n.id),lock=raidRouteLock(r,n.id);return {...n,status:cleared?'cleared':s.combat?.raidEncounter?.id===n.id?'current':'ahead',bossIds:n.kind==='boss'?[moltenCoreBosses.find(b=>b.id===n.id).entry]:[],quests:[],enemies:n.types?.map(t=>moltenCoreTrash[t])||[],path:moltenCorePath(r.locationId,n.id),canNavigate:canNavigate&&!cleared&&!lock,navigateReason:lock};})};
}
