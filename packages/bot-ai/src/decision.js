/**
 * Compile a deterministic strategy list once, outside the decision loop.
 * Lower priority numbers run first; ties keep declaration order. Actions only
 * select intentions. The caller owns validation, scheduling and execution.
 *
 * A terminal strategy can deliberately select no action (for example conserving
 * mana). That must not fall through to a lower-priority damage strategy.
 */
export function compileStrategies(strategies) {
 const ids=new Set();
 const ordered=strategies.map((strategy,order)=>{
  if(!strategy.id||ids.has(strategy.id)||!Number.isSafeInteger(strategy.priority)||typeof strategy.trigger!=='function'||!Array.isArray(strategy.actions)||!strategy.actions.length)throw new TypeError('Invalid bot strategy');
  ids.add(strategy.id);
  const actions=strategy.actions.map(action=>{
   if(!action.id||typeof action.select!=='function')throw new TypeError('Invalid bot action');
   return Object.freeze({...action});
  });
  return Object.freeze({...strategy,actions:Object.freeze(actions),order});
 }).sort((a,b)=>a.priority-b.priority||a.order-b.order);
 return (context,trace)=>{
  for(const strategy of ordered){
   const active=strategy.trigger(context);
   if(active?.then)throw new TypeError('Bot triggers must be synchronous');
   if(!active){
    trace?.record(strategy.id,null,strategy.priority,'inactive');
    continue;
   }
   let intent=null;
   for(const action of strategy.actions){
    intent=action.select(context);
    if(intent?.then)throw new TypeError('Bot actions must be synchronous');
    trace?.record(strategy.id,action.id,strategy.priority,intent?'selected':'unavailable');
    if(intent)return intent;
   }
   if(strategy.terminal){
    trace?.record(strategy.id,null,strategy.priority,'stop');
    return intent;
   }
  }
  return null;
 };
}

/** Optional diagnostic sink. Never stored in rule state or sent automatically. */
export class DecisionTrace {
 constructor(limit=64){
  if(!Number.isSafeInteger(limit)||limit<1||limit>128)throw new RangeError('Invalid trace capacity');
  this.limit=limit;this.entries=[];this.truncated=false;
 }
 record(strategy,action,priority,status){
  if(this.entries.length===this.limit){this.truncated=true;return;}
  this.entries.push({strategy,action,priority,status});
 }
}
