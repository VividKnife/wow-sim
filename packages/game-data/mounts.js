export const ridingLevel=20;
// Test boost gift: available to every race without changing vendor horses.
export const boostMount={id:900020,name:'旅行棕马',level:ridingLevel,bonus:60,price:0,tone:'brown',testGift:true};
export const mountCatalog=[
 {id:2414,name:'杂色马',level:ridingLevel,bonus:60,price:800000,tone:'pinto'},
 {id:5655,name:'栗色马',level:ridingLevel,bonus:60,price:800000,tone:'chestnut'},
 {id:5656,name:'棕马',level:ridingLevel,bonus:60,price:800000,tone:'brown'},
 {id:18776,name:'迅捷褐色马',level:60,bonus:100,price:10000000,tone:'palomino'},
 {id:18777,name:'迅捷棕马',level:60,bonus:100,price:10000000,tone:'brown'},
 {id:18778,name:'迅捷白马',level:60,bonus:100,price:10000000,tone:'white'},
];
export const rewardMounts=[{id:49283,name:'幽灵虎',level:ridingLevel,bonus:60,price:0,tone:'spectral',reward:true,icon:'/icons/assets/ability_mount_whitetiger.png'}];
export const bossMounts=[{id:13335,name:'死亡军马的缰绳',level:60,bonus:100,price:0,tone:'undead',bossDrop:true,displayId:10718,icon:'/icons/assets/ability_mount_undeadhorse.png',bossId:10440,dungeonId:'stratholme-undead'}];
export const collectibleMounts=[...mountCatalog,boostMount,...rewardMounts,...bossMounts];
