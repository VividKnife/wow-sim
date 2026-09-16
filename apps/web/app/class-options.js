export const raceOptions=[
 {id:1,name:'人类',nameEn:'Human',faction:'Alliance'},
 {id:2,name:'兽人',nameEn:'Orc',faction:'Horde'},
 {id:3,name:'矮人',nameEn:'Dwarf',faction:'Alliance'},
 {id:4,name:'暗夜精灵',nameEn:'Night Elf',faction:'Alliance'},
 {id:5,name:'亡灵',nameEn:'Undead',faction:'Horde'},
 {id:6,name:'牛头人',nameEn:'Tauren',faction:'Horde'},
 {id:7,name:'侏儒',nameEn:'Gnome',faction:'Alliance'},
 {id:8,name:'巨魔',nameEn:'Troll',faction:'Horde'},
];

export const classOptions=[
 {id:1,name:'战士',nameEn:'Warrior',races:[1,2,3,4,5,6,7,8],power:'rage'},
 {id:2,name:'圣骑士',nameEn:'Paladin',races:[1,3],power:'mana'},
 {id:3,name:'猎人',nameEn:'Hunter',races:[2,3,4,6,8],power:'mana'},
 {id:4,name:'潜行者',nameEn:'Rogue',races:[1,2,3,4,5,7,8],power:'energy'},
 {id:5,name:'牧师',nameEn:'Priest',races:[1,3,4,5,8],power:'mana'},
 {id:7,name:'萨满祭司',nameEn:'Shaman',races:[2,6,8],power:'mana'},
 {id:8,name:'法师',nameEn:'Mage',races:[1,5,7,8],power:'mana'},
 {id:9,name:'术士',nameEn:'Warlock',races:[1,2,5,7],power:'mana'},
 {id:11,name:'德鲁伊',nameEn:'Druid',races:[4,6],power:'mana'},
];

export function racesForClass(classId){
 const playable=new Set(classOptions.find(option=>option.id===Number(classId))?.races||[]);
 return raceOptions.filter(race=>playable.has(race.id));
}

export function buildCreateCommand(name,classId,raceId){
 const selectedClass=classOptions.find(option=>option.id===Number(classId));
 if(!selectedClass||!selectedClass.races.includes(Number(raceId)))throw new Error('这个种族与职业组合不可用。');
 const cleanName=String(name||'').trim();
 if(!cleanName)throw new Error('请输入角色名字。');
 return{type:'create',name:cleanName,classId:selectedClass.id,raceId:Number(raceId)};
}
