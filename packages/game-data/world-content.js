// Classic geography adapted to the game's location graph. World coordinates
// locate source spawns; map pins and road durations are deliberately schematic.
import {endgameRegions,endgameRoads,endgameFlights,endgameDungeons} from './world-endgame.js';
export const racialHomes={
 1:{start:'northshire',capital:'stormwind',name:'北郡修道院'},
 2:{start:'valley-of-trials',capital:'orgrimmar',name:'试炼谷'},
 3:{start:'coldridge',capital:'ironforge',name:'寒脊山谷'},
 4:{start:'shadowglen',capital:'darnassus',name:'幽影谷'},
 5:{start:'deathknell',capital:'undercity',name:'丧钟镇'},
 6:{start:'red-cloud-mesa',capital:'thunderbluff',name:'红云台地'},
 7:{start:'coldridge',capital:'ironforge',name:'寒脊山谷'},
 8:{start:'valley-of-trials',capital:'orgrimmar',name:'试炼谷'},
};
// id, Chinese name, map, level range, faction, locations [id,name,x,y,kind].
const regions=[
 ['dun-morogh','丹莫罗',0,1,10,'Alliance',[
  ['coldridge','寒脊山谷',-6240,331,'town'],['anvilmar','安威玛尔',-6125,385,'town'],['coldridge-pass','寒脊山小径',-5860,20],['kharanos','卡拉诺斯',-5600,-480,'town'],['brewnall','烈酒村',-5370,320],['frostmane','霜鬃巨魔要塞',-5530,580],['golbolar','古博拉采掘场',-5740,-1600],['amberstill','冻石农场',-5500,-1300,'town']]],
 ['loch-modan','洛克莫丹',0,10,20,'Alliance',[
  ['thelsamar','塞尔萨玛',-5400,-2900,'town'],['south-gate','南门岗哨',-5650,-2550],['stonewrought','巨石水坝',-4700,-3300],['farstrider','远行者小屋',-5670,-4250,'town'],['ironbands','铁环挖掘场',-5750,-3700],['silverstream','银泉矿洞',-4900,-2980],['algaz','奥加兹岗哨',-4826,-2677,'outpost']]],
 ['redridge','赤脊山',0,15,25,'Alliance',[
  ['lakeshire','湖畔镇',-9270,-2190,'town'],['alther-mill','奥瑟尔伐木场',-9140,-2800],['stonewatch','石堡要塞',-9340,-3070],['render-valley','撕裂者山谷',-9710,-3100],['renders-camp','撕裂者营地',-8670,-2380]]],
 ['duskwood','暮色森林',0,18,30,'Alliance',[
  ['darkshire','夜色镇',-10560,-1180,'town'],['ravenhill','乌鸦岭',-10700,330],['ravenhill-cemetery','乌鸦岭墓园',-10350,360],['twilight-grove','黎明森林',-10300,-420],['tranquil-gardens','静谧花园墓场',-11050,-1330],['vul-gol','沃古尔食人魔山',-11020,-240]]],
 ['wetlands','湿地',0,20,30,'Alliance',[
  ['menethil','米奈希尔港',-3740,-755,'town'],['greenwarden','绿色守卫者林地',-3370,-3190],['whelgar','维尔加挖掘场',-3500,-1800],['dunmodr','丹莫德',-2600,-2450,'outpost'],['dragonmaw','龙喉大门',-4080,-2660],['bluegill','蓝腮沼泽',-3190,-1220]]],
 ['teldrassil','泰达希尔',1,1,10,'Alliance',[
  ['shadowglen','幽影谷',10311,832,'town'],['shadowthread','影丝洞',10800,920],['dolanaar','多兰纳尔',9860,960,'town'],['starbreeze','星风村',9840,370],['banethil','班奈希尔兽穴',9820,1540],['wellspring','涌泉湖',10570,1660],['ruttheran','鲁瑟兰村',8695,960,'town']]],
 ['darkshore','黑海岸',1,10,20,'Alliance',[
  ['auberdine','奥伯丁',6435,485,'town'],['ametharan','亚米萨兰',5720,180],['bashalaran','巴莎兰',6750,-20],['cliffspring','峭壁之泉',7040,-580],['masters-glaive','主宰之剑',4580,450],['mathystra','玛塞斯特拉废墟',7410,-960]]],
 ['durotar','杜隆塔尔',1,1,10,'Horde',[
  ['valley-of-trials','试炼谷',-618,-4251,'town'],['burning-blade','火刃集会所',-195,-4315],['senjin','森金村',-826,-4920,'town'],['echo-isles','回音群岛',-1150,-5500],['razor-hill','剃刀岭',315,-4740,'town'],['tiragarde','提拉加德城堡',-185,-5070],['skull-rock','骷髅石',1450,-4870],['drygulch','枯水谷',1040,-4400]]],
 ['mulgore','莫高雷',1,1,10,'Horde',[
  ['red-cloud-mesa','红云台地',-2917,-258,'town'],['camp-narache','纳拉其营地',-2910,-80,'town'],['brambleblade','刺刃峡谷',-3020,-1050],['bloodhoof','血蹄村',-2320,-380,'town'],['palemane','白鬃石',-2070,160],['venture-mulgore','风险投资公司矿洞',-1900,-1100],['red-rocks','赤色石',-1070,-1100]]],
 ['tirisfal','提瑞斯法林地',0,1,10,'Horde',[
  ['deathknell','丧钟镇',1676,1678,'town'],['night-web','夜行蜘蛛洞穴',2050,1800],['solliden','索利丹农场',2270,1350],['brill','布瑞尔',2260,290,'town'],['agaman','阿加曼德磨坊',2800,900],['garrens-haunt','加伦鬼屋',2850,350],['scarlet-watch','血色十字军哨岗',2950,-560]]],
 ['silverpine','银松森林',0,10,20,'Horde',[
  ['sepulcher','瑟伯切尔',510,1630,'town'],['fenris','芬里斯岛',740,680],['decrepit-ferry','破旧渡口',660,980],['ambermill','安伯米尔',-140,1100],['pyrewood','焚木村',-380,1530],['beren','博伦的巢穴',-620,1050]]],
 ['barrens','贫瘠之地',1,10,25,'Horde',[
  ['crossroads','十字路口',-460,-2650,'town'],['ratchet','棘齿城',-955,-3675,'town'],['far-watch','前沿哨所',-10,-3630,'outpost'],['forgotten-pools','遗忘之池',100,-1930],['sludge-fen','淤泥沼泽',1060,-3000],['lushwater','甜水绿洲',-990,-2050],['camp-taurajo','陶拉祖营地',-2380,-1880,'town'],['northwatch','北方城堡',-1980,-3680],['bael-modan','巴尔莫丹',-4100,-2250],['field-giants','巨人旷野',-3120,-2100]]],
 ['stonetalon','石爪山脉',1,15,27,'Contested',[
  ['sun-rock','烈日石居',950,950,'town'],['stonetalon-peak','石爪峰',2700,1500,'town'],['windshear','狂风峭壁',1050,-300],['charred-vale','焦炭谷',500,1450],['webwinder','蛛网小径',400,-500]]],
 ['ashenvale','灰谷',1,18,30,'Contested',[
  ['astranaar','阿斯特兰纳',2750,-420,'town'],['splintertree','碎木岗哨',2300,-2520,'town'],['zoram','佐拉姆前哨站',3370,1000,'town'],['maestras','迈斯特拉岗哨',3200,200,'outpost'],['raynewood','林中树居',2700,-1850],['fallen-sky','冥火岭',2100,-3000],['warsong-camp','战歌伐木场',1900,-3600]]],
 ['hillsbrad','希尔斯布莱德丘陵',0,20,30,'Contested',[
  ['southshore','南海镇',-840,-530,'town'],['tarren-mill','塔伦米尔',0,-940,'town'],['hillsbrad-fields','希尔斯布莱德农场',-490,0],['azurelode','碧玉矿洞',-870,120],['durnholde','敦霍尔德城堡',-520,-1400],['eastern-strand','东部海岸',-1100,-1100]]],
 ['thousand-needles','千针石林',1,25,35,'Contested',[
  ['freewind','乱风岗',-5480,-2430,'town'],['great-lift','升降梯',-4650,-1840],['darkcloud','黑云峰',-5000,-1700],['highperch','风巢',-5050,-950],['shimmering-flats','闪光平原',-6200,-3900],['mirage-raceway','沙漠赛道',-6200,-4500,'town']]],
 ['arathi','阿拉希高地',0,30,40,'Contested',[
  ['refuge-pointe','避难谷地',-1260,-2520,'town'],['hammerfall','落锤镇',-930,-3530,'town'],['stromgarde','激流堡',-1680,-1800],['boulderfist','石拳大厅',-1950,-2800],['circle-binding','禁锢法阵',-850,-2200],['faldirs','法迪尔海湾',-2130,-2000]]],
 ['desolace','凄凉之地',1,30,40,'Contested',[
  ['nijels','尼耶尔前哨站',150,1240,'town'],['shadowprey','葬影村',-1620,3100,'town'],['kodo-graveyard','科多兽坟场',-1300,1750],['mannoroc','玛诺洛克集会所',-1880,1800],['gelkis','吉尔吉斯村',-2150,2450],['magram','玛格拉姆村',-1800,950],['thunder-axe','雷斧堡垒',-450,1750]]],
 ['stranglethorn','荆棘谷',0,30,45,'Contested',[
  ['rebel-camp','反抗军营地',-11320,-200,'town'],['nesingwary','奈辛瓦里远征队营地',-11620,-50,'town'],['gromgol','格罗姆高营地',-12380,150,'town'],['kurzen','库尔森营地',-11650,-700],['gurubashi','古拉巴什竞技场',-13250,150],['booty-bay','藏宝海湾',-14400,450,'town'],['venture-stranglethorn','风险投资公司营地',-12000,-600],['mistvale','薄雾山谷',-13900,50]]],
 ['badlands','荒芜之地',0,35,45,'Contested',[
  ['kargath','卡加斯',-6630,-2180,'town'],['hammertoe','铁趾挖掘场',-6440,-3380],['agmond','埃格蒙德的营地',-7040,-3350],['lethlor','莱瑟罗峡谷',-6800,-4050]]],
 ['swamp-sorrows','悲伤沼泽',0,35,45,'Contested',[
  ['stonard','斯通纳德',-10460,-3260,'town'],['fallow-sanctuary','农田避难所',-10150,-2800],['splinterspear','断矛路口',-10370,-2600],['pool-tears','泪水之池',-10450,-3800]]],
 ['dustwallow','尘泥沼泽',1,35,45,'Contested',[
  ['theramore','塞拉摩',-3820,-4510,'town'],['brackenwall','蕨墙村',-3140,-2840,'town'],['shady-rest','树荫旅店',-3720,-2500],['witch-hill','女巫岭',-2800,-3750],['wyrmbog','巨龙沼泽',-4500,-3850]]],
 ['alterac','奥特兰克山脉',0,30,40,'Contested',[
  ['alterac-ruins','奥特兰克废墟',620,-650],['dalaran-crater','达拉然',270,300],['chillwind','冰风岗',680,-1450],['growless','无草洞',440,-100],['soferas-naze','索菲亚高地',-80,-1200]]],
 ['tanaris','塔纳利斯',1,40,50,'Contested',[
  ['gadgetzan','加基森',-7160,-3780,'town'],['waterspring','清泉平原',-7300,-4500],['steamwheedle','热砂港',-6950,-4800,'town']]],
 ['feralas','菲拉斯',1,40,50,'Contested',[
  ['camp-mojache','莫沙彻营地',-4430,240,'town'],['feathermoon','羽月要塞',-4370,3280,'town'],['lower-wilds','低地荒野',-4450,-500],['dire-maul-road','厄运之槌外道',-4100,1150],['northspring','北泉岗哨',-2950,2700]]],
 ['hinterlands','辛特兰',0,40,50,'Contested',[
  ['aerie-peak','鹰巢山',290,-2110,'town'],['revantusk','恶齿村',-630,-4720,'town'],['shadra-alor','沙德拉洛',-300,-2900],['jintha-alor','辛萨罗',-180,-3900]]],
];
regions.push(...endgameRegions);
export const worldRegions=regions.map(([id,name,map,min,max,faction])=>({id,name,map,min,max,faction}));
export const worldNodes=regions.flatMap(([,region,map,min,max,faction,places])=>places.map(([id,name,x,y,kind='wild'])=>({id,name,region,map,x,y,min,max,kind,faction})));
for(const home of Object.values(racialHomes)){const node=worldNodes.find(n=>n.id===home.start);if(node){node.min=1;node.max=5;}}
export const capitals=[
 {id:'stormwind',name:'暴风城',map:0,x:-8833,y:628,faction:'Alliance',exit:'goldshire'},
 {id:'ironforge',name:'铁炉堡',map:0,x:-4845,y:-1140,faction:'Alliance',exit:'kharanos'},
 {id:'darnassus',name:'达纳苏斯',map:1,x:9950,y:2180,faction:'Alliance',exit:'dolanaar'},
 {id:'orgrimmar',name:'奥格瑞玛',map:1,x:1560,y:-4400,faction:'Horde',exit:'razor-hill'},
 {id:'thunderbluff',name:'雷霆崖',map:1,x:-1270,y:120,faction:'Horde',exit:'bloodhoof'},
 {id:'undercity',name:'幽暗城',map:0,x:1580,y:240,faction:'Horde',exit:'brill'},
];
for(const c of capitals)worldNodes.push({...c,region:c.name,kind:'city',min:1,max:60});
export const capitalDistricts=[];
const districtNames={ironforge:['平民区','大锻炉','探险者大厅'],darnassus:['贸易区','工匠区','塞纳里奥区'],orgrimmar:['力量谷','荣誉谷','智慧谷'],thunderbluff:['中央台地','猎人高地','长者高地'],undercity:['贸易区','军事区','魔法区']};
// District anchors calibrated against the shipped Classic city map artwork.
const districtPoints={ironforge:[[29,63],[48,44],[70,23]],darnassus:[[62,70],[60,18],[35,16]],orgrimmar:[[51,68],[76,25],[37,38]],thunderbluff:[[47,46],[56,82],[76,30]],undercity:[[66,43],[47,27],[81,26]]};
for(const c of capitals.filter(c=>c.id!=='stormwind'))for(let i=0;i<3;i++){
 const id=i?`${c.id}-district-${i}`:c.id;
 capitalDistricts.push({id,city:c.id,name:districtNames[c.id][i],subtitle:c.name,description:`${c.name}的${districtNames[c.id][i]}，在这里整顿装备、学习技艺并准备下一段旅程。`,point:districtPoints[c.id][i],services:i===0?['bank','auction','shop','inn','flight','quests']:['trainer','professions','shop','quests'],classes:i===0?[]:[1,2,3,4,5,7,8,9,11]});
 if(i)worldNodes.push({...c,id,name:districtNames[c.id][i],region:c.name,kind:'city',min:1,max:60,x:c.x+i*90,y:c.y+i*100});
}
worldNodes.push({id:'moonglade',name:'月光林地',region:'月光林地',map:1,x:7965,y:-2490,min:10,max:60,kind:'town',faction:'Contested'});
worldNodes.push({id:'onyxias-lair',name:'奥妮克希亚的巢穴',region:'尘泥沼泽',map:1,x:-4708,y:-3727,min:60,max:60,kind:'dungeon',faction:'Contested'});
worldNodes.push({id:'molten-core',name:'熔火之心',region:'灼热峡谷',map:0,x:-7500,y:-1200,min:60,max:60,kind:'dungeon',faction:'Contested'});
const allianceTowns=['astranaar','stonetalon-peak','nijels','southshore','refuge-pointe','theramore','feathermoon','aerie-peak','rebel-camp'];
const hordeTowns=['sun-rock','splintertree','zoram','tarren-mill','hammerfall','shadowprey','gromgol','kargath','stonard','brackenwall','freewind','camp-mojache','revantusk'];
for(const n of worldNodes){if(allianceTowns.includes(n.id))n.faction='Alliance';if(hordeTowns.includes(n.id))n.faction='Horde';if(n.id==='ratchet')n.faction='Contested';}
export const worldFlightNodes=['ironforge','thelsamar','lakeshire','darkshire','menethil','southshore','refuge-pointe','aerie-peak','booty-bay','tarren-mill','sepulcher','undercity','hammerfall','kargath','gromgol','stonard','darnassus','auberdine','astranaar','stonetalon-peak','nijels','feathermoon','theramore','orgrimmar','crossroads','ratchet','camp-taurajo','thunderbluff','sun-rock','splintertree','zoram','shadowprey','freewind','brackenwall','camp-mojache','gadgetzan','revantusk'];
export const worldRoads=regions.flatMap(([, , , , , ,places])=>places.slice(1).map((p,i)=>[places[i][0],p[0]]));
worldRoads.push(...endgameRoads);
worldRoads.push(['wyrmbog','onyxias-lair'],['blackrock-mountain','molten-core']);
worldFlightNodes.push(...endgameFlights);
worldRoads.push(...capitals.map(c=>[c.id,c.exit]),
 ['coldridge','kharanos'],['kharanos','south-gate'],['amberstill','south-gate'],['stonewrought','algaz'],['lakeshire','darkshire'],['ravenhill','sentinel'],['darkshire','rebel-camp'],['dunmodr','refuge-pointe'],['hammerfall','tarren-mill'],['tarren-mill','alterac-ruins'],['southshore','pyrewood'],['deathknell','brill'],['brill','sepulcher'],['thelsamar','kargath'],['darkshire','splinterspear'],['aerie-peak','tarren-mill'],
 ['shadowglen','dolanaar'],['auberdine','maestras'],['masters-glaive','maestras'],['maestras','astranaar'],['astranaar','stonetalon-peak'],['splintertree','crossroads'],['razor-hill','far-watch'],['red-cloud-mesa','bloodhoof'],['bloodhoof','camp-taurajo'],['crossroads','webwinder'],['charred-vale','nijels'],['camp-taurajo','great-lift'],['camp-taurajo','shady-rest'],['mirage-raceway','gadgetzan'],['highperch','lower-wilds'],['shadowprey','dire-maul-road']);
worldRoads.push(...capitalDistricts.filter(d=>d.id!==d.city).map(d=>[d.city,d.id]));
export const worldTransports=[
 ['ruttheran','auberdine','boat',180000],['auberdine','menethil','boat',240000],['menethil','theramore','boat',240000],['ratchet','booty-bay','boat',240000],
 ['orgrimmar','brill','zeppelin',240000],['orgrimmar','gromgol','zeppelin',240000],['brill','gromgol','zeppelin',240000],['feathermoon','dire-maul-road','boat',90000],['darnassus','ruttheran','portal',10000],
 ['auberdine','moonglade','flight',180000],
];
export const worldDungeons=[
 ['ragefire-chasm',389,'orgrimmar',8,13,18],['wailing-caverns',43,'lushwater',10,17,24],['shadowfang-keep',33,'pyrewood',10,22,30],['blackfathom-deeps',48,'zoram',10,24,32],['gnomeregan',90,'brewnall',15,29,38],['razorfen-kraul',47,'bael-modan',15,29,38],
 ['scarlet-monastery-graveyard',189,'scarlet-watch',20,28,35],['scarlet-monastery-library',189,'scarlet-watch',20,32,39],['scarlet-monastery-armory',189,'scarlet-watch',20,35,42],['scarlet-monastery-cathedral',189,'scarlet-watch',20,38,45],['razorfen-downs',129,'great-lift',25,37,46],['uldaman',70,'hammertoe',30,40,50],
 ...endgameDungeons,
].map(([id,map,parent,minimumLevel,min,max,name])=>({id,map,parent,minimumLevel,min,max,name}));
