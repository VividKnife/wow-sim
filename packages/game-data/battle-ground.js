// Shared presentation presets. Terrain is captured when an encounter starts,
// so a completed battle does not change appearance after travelling elsewhere.
export const battleGrounds={
 cave:{name:'洞穴岩地',image:'/battle/ground/cave.webp'},
 deck:{name:'木质甲板',image:'/battle/ground/deck.webp'},
 dirt:{name:'黄土地面',image:'/battle/ground/dirt.webp'},
 water:{name:'水面',image:'/battle/ground/water.webp'},
 grass:{name:'草土地面',image:'/battle/ground/grass.webp'},
};
const caveLocations=new Set(['echo','fargodeep','jasper','jansen','deadmines','silverstream']);
const dryLocations=new Set(['orgrimmar']);
export function encounterGround({dungeon=false,area={},location={},environment={}}={}){
 if(dungeon)return area.ground||'cave';
 if(['swim','underwater','waterwalk'].includes(environment.mode))return 'water';
 if(area.ground)return area.ground;
 if(caveLocations.has(location.id))return 'cave';
 if(location.region==='西部荒野'||dryLocations.has(location.id))return 'dirt';
 return 'grass';
}
