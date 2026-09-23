// Twenty-five player adaptation; source identities and phase thresholds follow
// CMaNGOS 8ec338a1704e7dcb1c0213eb7ed58f9231ade40f boss_onyxia.cpp.
export const onyxiaBoss={id:'onyxia',entry:10184,name:'奥妮克希亚',subtitle:'黑龙公主',hp:240000,low:900,high:1200,enrageMs:360000,description:'坦克将龙头背向团队；65%升空，清理雏龙并避开深呼吸；40%落地后应对恐惧与熔岩。'};
export const onyxiaRoute=[
 {id:'onyxia-warders',name:'巢穴守卫',kind:'trash',parent:'entrance',position:[430,490],types:['onyxiaWarder','onyxiaWarder'],description:'分开牵制龙人守卫，清理通向主巢的洞穴。'},
 {id:'onyxia',name:'奥妮克希亚',kind:'boss',parent:'onyxia-warders',position:[500,270],description:onyxiaBoss.description},
];
export const onyxiaMap={width:1002,height:668,points:{entrance:[465,575],...Object.fromEntries(onyxiaRoute.map(n=>[n.id,n.position]))},edges:onyxiaRoute.map(n=>[n.parent,n.id]),floorByNode:{entrance:1,'onyxia-warders':1,onyxia:1},floors:[{id:1,name:'奥妮克希亚的巢穴',image:'/maps/dungeons/onyxiaslair-1.webp'}],attribution:'原版地图 · 节点与25人战斗为本作改编'};
