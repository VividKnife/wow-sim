/** @type {Record<string,string>} */
export const partyRoleLabels={tank:'坦克',healer:'治疗',dps:'输出'};
export const partyRoleTarget={tank:1,healer:1,dps:3};
export const groupRole=role=>role==='tank'||role==='healer'?role:'dps';

// Use the authoritative combat role, including talent inference and explicit strategy overrides.
export function partyRecommendation(state,data,replaceId=''){
 const members=data.strategyMembers||[];
 const roleOf=actor=>groupRole(members.find(member=>member.id===actor.id)?.role||actor.strategyPolicy?.role);
 const playerRole=roleOf(state);
 const companionTarget={...partyRoleTarget};companionTarget[playerRole]--;
 const counts={tank:0,healer:0,dps:0};
 for(const actor of [state,...state.party.filter(member=>member.id!==state.id&&member.id!==replaceId)])counts[roleOf(actor)]++;
 const missing=Object.fromEntries(Object.entries(partyRoleTarget).map(([role,total])=>[role,Math.max(0,total-counts[role])]));
 const candidates=(data.candidates||[]).map(candidate=>{
  const recommendedRoles=candidate.roles.filter(role=>missing[groupRole(role)]>0);
  const preferredRole=recommendedRoles[0]||candidate.roles[0];
  return {...candidate,preferredRole,recommendedRoles};
 }).sort((a,b)=>Number(!!b.recommendedRoles.length)-Number(!!a.recommendedRoles.length));
 const trees=(data.talentTrees||[]).map(tree=>({...tree,points:tree.talents.reduce((sum,talent)=>sum+(state.talents?.[talent.id]||0),0)})).sort((a,b)=>b.points-a.points||a.id-b.id);
 const explicit=state.strategyPolicy?.role&&state.strategyPolicy.role!=='auto';
 return {playerRole,companionTarget,counts,missing,candidates,roleOf,
  basis:explicit?'已指定策略职责':trees[0]?.points?`${trees[0].name}天赋`:'当前职业默认职责',
  balanced:Object.values(missing).every(count=>count===0)&&Object.entries(counts).every(([role,count])=>count===partyRoleTarget[role])};
}
