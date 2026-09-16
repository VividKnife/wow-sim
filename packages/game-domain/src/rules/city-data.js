// Authored node-based city experience. Coordinates and roads are an adaptation,
// not measured client paths; NPC labels describe service roles.
export const cityServices={
 bank:{id:'bank',name:'银行',npc:'贸易区银行职员',description:'把旅途所得妥善存放，为下一次冒险腾出空间。',greeting:'欢迎回来。无论是材料还是珍藏，我们都会替你保管好。'},
 auction:{id:'auction',name:'拍卖行',npc:'贸易区拍卖师',description:'购买材料、出售闲置物品。沿用远程模拟市场。',greeting:'看看今天需要些什么？这里明码标价，模拟买家会在 30 秒后收购。'},
 shop:{id:'shop',name:'商人与补给',npc:'城区商人',description:'补充食物与饮水，清理背包里的灰色杂物。',greeting:'出门前检查一下行囊。路很长，别忘了带上补给。'},
 inn:{id:'inn',name:'旅店与炉石',npc:'贸易区旅店老板',description:'绑定炉石，使用随身食物与饮水休整。',greeting:'把这里当成你的家吧。下次旅途劳顿时，炉石会指引你回来。'},
 trainer:{id:'trainer',name:'职业训练',npc:'职业训练师',description:'学习新技能，查看训练条件，重置已分配的天赋。',greeting:'让我看看你在旅途中学到了什么。准备好学习下一课了吗？'},
 professions:{id:'professions',name:'生活职业与工坊',npc:'城区工匠',description:'学习专业、查看配方，把收集的材料变成装备与补给。',greeting:'一门手艺，要靠耐心磨练。把材料拿出来，我们开始吧。'},
 flight:{id:'flight',name:'狮鹫飞行',npc:'狮鹫管理员',description:'发现暴风城飞行点，乘狮鹫前往已解锁的哨兵岭。',greeting:'狮鹫已经准备好了。先确认目的地的飞行路线已经开通。'},
 tram:{id:'tram',name:'矿道地铁',npc:'地铁站务员',description:'从矮人区乘坐矿道地铁前往铁炉堡。',greeting:'下一站，铁炉堡。请站稳扶好，列车即将出发。'},
 quests:{id:'quests',name:'城区任务',npc:'暴风城卫兵',description:'查看当前城区的委托与交付，继续你的冒险。',greeting:'王国的道路并不太平。留意你的任务日志，愿圣光与你同在。'},
};

export const cityDistricts=[
 {id:'stormwind',name:'贸易区',subtitle:'城市的心跳',description:'人声穿过拱廊，商队在运河边卸货。银行、旅店和狮鹫塔都在附近。',point:[57,56],services:['bank','auction','shop','inn','flight','quests']},
 {id:'magetower',name:'法师区',subtitle:'高塔与奥术',description:'石阶向高塔盘旋，魔法的微光映在蓝色屋顶上。这里也是共享路线的职业训练站。',point:[35,69],services:['trainer','professions','shop','quests'],classes:[8,9,7]},
 {id:'bluerecluse',name:'蓝色隐士',subtitle:'酒馆里的秘密',description:'杯盏轻响，低语在烛光中流动。法师们的研究偶尔会带来意想不到的访客。',point:[43,80],services:['shop','quests']},
 {id:'oldtown',name:'旧城区',subtitle:'兵刃与街巷',description:'训练场传来盾牌相击的声音，狭窄街巷通向戒备森严的军营。',point:[70,44],services:['trainer','shop','professions','quests'],classes:[1,4]},
 {id:'dwarven',name:'矮人区',subtitle:'炉火不息',description:'锤声和蒸汽交织，工匠的炉火昼夜不熄。矿道地铁从这里通往铁炉堡。',point:[60,23],services:['trainer','professions','shop','tram','quests'],classes:[3]},
 {id:'cathedral',name:'教堂广场',subtitle:'圣光照耀之地',description:'钟声越过石砌广场。牧师与圣骑士在大教堂里传授守护同伴的技艺。',point:[43,37],services:['trainer','professions','quests'],classes:[2,5]},
 {id:'park',name:'花园',subtitle:'城墙中的绿意',description:'水声掩住远处的喧嚣，树影沿着步道铺开。自然的守望者在这里接待来访者。',point:[21,51],services:['trainer','professions'],classes:[11]},
 {id:'keep',name:'暴风要塞',subtitle:'王国的旗帜',description:'蓝金旗帜在高墙上飘扬。从这里回望运河，下一段旅程正等着你。',point:[81,18],services:['quests']},
];

export const additionalCityNodes=[
 ['dwarven','矮人区','暴风城',-8365,605,1,60,'city'],
 ['cathedral','教堂广场','暴风城',-8580,800,1,60,'city'],
 ['park','花园','暴风城',-8750,1100,1,60,'city'],
 ['keep','暴风要塞','暴风城',-8465,350,1,60,'city'],
];
export const cityRoads=[['oldtown','dwarven'],['stormwind','cathedral'],['cathedral','dwarven'],['cathedral','park'],['park','magetower'],['dwarven','keep'],['keep','oldtown']];
