// Hand-placed locations on the full reference artwork, in percentages.
// These mark the game's adapted location nodes, not precise NPC coordinates.
export const mapRegions={
 '艾尔文':{name:'艾尔文森林 · 北郡',image:'/maps/elwynn-classic.jpg'},
 '暴风城':{name:'暴风城',image:'/maps/stormwind-classic.jpg'},
 '西部荒野':{name:'西部荒野',image:'/maps/westfall-classic.jpg'},
 '主城传送':{name:'主城传送 · 服务节点示意',image:null},
 '信使路线':{name:'信使路线',image:null},
};
export const mapRegion=region=>region==='北郡'?'艾尔文':region;
export const mapPoints={
 darnassus:[24,16],orgrimmar:[76,58],thunderbluff:[42,70],moonglade:[55,25],undercity:[50,30],northshire:[49,42],northwood:[48,34],echo:[48,25],vineyard:[55,49],
 goldshire:[42,65],fargodeep:[39,80],stonefield:[33,86],maclure:[48,87],
 mirror:[29,59],crystal:[54,65],jasper:[61,53],tower:[75,73],logging:[85,65],
 brackwell:[70,80],westbrook:[24,72],forestedge:[24,83],
 stormwind:[57,56],magetower:[35,69],bluerecluse:[43,80],oldtown:[68,37],
 furlbrow:[51,21],saldean:[54,32],jansen:[43,28],sentinel:[55,52],
 alexton:[39,51],moonbrook:[44,68],daggerhills:[56,76],coastnorth:[29,25],
 coast:[24,63],lighthouse:[30,88],deadmines:[42,83],
 lakeshire:[22,79],ironforge:[22,22],thelsamar:[57,45],algaz:[78,20],silverstream:[81,65],
};

export function playerMapPoint(journey,map){
 const from=map.find(n=>n.id===journey.from),to=map.find(n=>n.id===journey.to);
 if(!from||!to)return null;
 const a=mapPoints[from.id],b=mapPoints[to.id];if(!a||!b)return null;
 const region=mapRegion(from.region),crossing=region!==mapRegion(to.region);
 return {region,x:crossing?a[0]:a[0]+(b[0]-a[0])*journey.progress,y:crossing?a[1]:a[1]+(b[1]-a[1])*journey.progress,crossing};
}
