// Mount spell -> creature -> ModelId1 from the current Classic catalog.
export const worldMountDisplays={2414:2409,5655:2405,5656:2404,18776:14582,18777:14583,18778:14338,900020:2404,13819:8469,23214:14584,5784:2346,23161:14554};
// Choose the local flight service, never restrict access by the rider's race.
export function worldFlightMount(state,data){
 const origin=data.map?.find(node=>node.id===(state.activity?.from||state.location))||data.location;
 if(origin?.faction==='Horde')return {displayId:295,name:'双足飞龙'};
 if(origin?.map===1)return {displayId:3210,name:'角鹰兽'};
 return {displayId:1149,name:'狮鹫'};
}
export function worldSceneState(state,data){
 const activity=state.activity||{},combat=!!state.combat,dead=state.hp<=0;
 const moving=!combat&&!dead&&['travel','escortMove','revive'].includes(activity.type);
 const flying=moving&&!!activity.flight;
 const flightMount=flying?worldFlightMount(state,data):null;
 const mountDisplayId=!combat&&!dead?(flightMount?.displayId||worldMountDisplays[state.mounted]||0):0;
 const flightProgress=flying?Math.min(1,Math.max(0,(state.clock-activity.startedAt)/Math.max(1,activity.endsAt-activity.startedAt))):0;
 return {combat,moving,flying,mountDisplayId,flightProgress,animation:dead?'Death':flying?'Fly':moving?'Run':'Stand',label:combat?'战斗中':dead?'已倒下':flying?flightMount.name+'飞行':moving?(mountDisplayId?'骑乘赶路':'奔跑赶路'):mountDisplayId?'骑乘待命':activity.type==='mount'?'召唤坐骑':state.rest?'休息恢复':'驻足休息',destination:activity.to?data.map?.find(node=>node.id===activity.to)?.name:null};
}
export function worldScenery(location){
 const region=location?.region||'';
 if(/铁炉堡|丹莫罗|冬泉|奥特兰克/.test(region))return 'snow';
 if(/杜隆塔尔|奥格瑞玛|贫瘠|千针|塔纳利斯|荒芜|灼热|燃烧|希利苏斯|西部荒野/.test(region))return 'arid';
 if(/暮色|提瑞斯法|幽暗|银松|瘟疫|费伍德/.test(region))return 'dusk';
 return 'forest';
}
