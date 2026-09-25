// Travel times come from the authoritative map, including mid-route redirection.
export function trainerNavigation(state, map, kind) {
 const field=kind==='profession'?'canTrainProfession':'canTrain';
 const target=(map||[]).filter(node=>node[field]&&Number.isFinite(node.travel)&&node.travel>=0).sort((a,b)=>a.travel-b.travel)[0]||null;
 const moving=state.activity.type==='travel';
 const here=!!target&&!moving&&target.id===state.location;
 const enRoute=!!target&&moving&&target.id===state.activity.to;
 const reason=state.hp<=0?'请先复活':state.combat?'战斗结束后可导航':state.dungeon?'请先离开副本':state.escort?'请先结束护送':moving&&state.activity.flight?'飞行结束后可导航':!['idle','hunt','travel'].includes(state.activity.type)?'请先结束当前活动':!target?'暂无可到达的训练师':here?'已在训练师所在地':enRoute?'正在前往训练师':'';
 return {target,reason,here,enRoute};
}
