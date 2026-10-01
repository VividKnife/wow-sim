// Conditions operate on an observable team view, never on encounter scripts or
// event queues. Compile once when a plan is prepared, not in each decision.
export function compileTeamCondition(condition){
 if(!condition||typeof condition!=='object'||Array.isArray(condition))throw new TypeError('Invalid team condition');
 const {kind}=condition;
 const keys={manual:['kind'],healthBelow:['kind','fraction'],resourceBelow:['kind','fraction'],effect:['kind','effect'],warning:['kind','mechanic','withinMs']}[kind];
 if(!keys||Object.keys(condition).some(k=>!keys.includes(k)))throw new TypeError('Invalid team condition fields');
 if(kind==='manual')return()=>false;
 if(kind==='healthBelow'||kind==='resourceBelow'){
  const fraction=condition.fraction;
  if(!Number.isFinite(fraction)||fraction<0||fraction>1)throw new TypeError('Invalid team condition threshold');
  return view=>{
   const target=view.target,pool=kind==='healthBelow'?target?.health:target?.resource;
   return !!target?.alive&&Number.isFinite(pool?.current)&&Number.isFinite(pool?.maximum)&&pool.maximum>0&&pool.current/pool.maximum<fraction;
  };
 }
 if(kind==='effect'){
  const effect=condition.effect;
  if(typeof effect!=='string'||!effect.length||effect.length>64)throw new TypeError('Invalid team effect');
  return view=>view.source?.alive===true&&view.source.effects?.includes(effect)===true;
 }
 const {mechanic,withinMs}=condition;
 if(typeof mechanic!=='string'||!mechanic.length||mechanic.length>64||!Number.isSafeInteger(withinMs)||withinMs<0||withinMs>60000)throw new TypeError('Invalid team warning condition');
 return view=>view.source?.alive===true&&(view.warnings||[]).some(w=>w.sourceId===view.source.id&&w.mechanic===mechanic&&Number.isSafeInteger(w.announcedAt)&&w.announcedAt<=view.clock&&Number.isSafeInteger(w.at)&&w.at>=view.clock&&w.at-view.clock<=withinMs);
}
