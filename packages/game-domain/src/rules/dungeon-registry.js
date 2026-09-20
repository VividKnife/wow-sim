import deadmines from '../../../game-data/data/deadmines-reference.json' with {type:'json'};
import stockades from '../../../game-data/data/stockades-reference.json' with {type:'json'};

export const dungeonDefinitions=Object.freeze({
 deadmines:{id:'deadmines',name:'死亡矿井',zone:'西部荒野',entrance:'deadmines',minimumLevel:deadmines.entrance.minimumLevel,recommendedLevel:18,description:'深入迪菲亚兄弟会的秘密船坞，阻止范克里夫的复仇计划。',reference:deadmines,rareEntries:{3586:.2}},
 stockades:{id:'stockades',name:'暴风城监狱',zone:'暴风城',entrance:'stockades',minimumLevel:stockades.entrance.minimumLevel,recommendedLevel:26,description:'暴动的囚犯占据了监狱。进入牢房，镇压叛乱，追查迪菲亚阴谋的线索。',reference:stockades,rareEntries:{1720:.2}},
});
export function dungeonDefinition(id){
 if(typeof id!=='string'||!Object.hasOwn(dungeonDefinitions,id))throw new Error('未知或尚未开放的副本。');
 return dungeonDefinitions[id];
}
export function dungeonIdFor(s){return s.dungeon?.id||Object.values(dungeonDefinitions).find(d=>d.entrance===s.location)?.id||'deadmines';}
export function dungeonRoute(id){return dungeonDefinition(typeof id==='string'?id:dungeonIdFor(id)).reference.encounters;}
