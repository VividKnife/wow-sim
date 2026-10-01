import {combatMembers} from './combat-members.js';
import {aliveEnemy} from './combat-space.js';
import {companionTarget} from './companion-combat.js';
import {strategyAllows} from './combat-strategy.js';

// Context lifetime is one decision. Lazy views are shared by its strategies,
// never across mutations, actors or simulation times. No future event access.
export class BotContext {
 constructor(state,actor,{regular=true,urgent=false}={}){
  this.state=state;this.actor=actor;this.regular=regular;this.urgent=urgent;
 }
 get actors(){return this._actors??=combatMembers(this.state);}
 get targets(){return this._targets??=this.state.combat.enemies.filter(aliveEnemy);}
 get target(){
  if(!this._targetRead){this._target=companionTarget(this.state,this.actor,this.targets);this._targetRead=true;}
  return this._target;
 }
 get readyAt(){
  const c=this.actor;
  return this._readyAt??=Math.max(this.state.clock,c.cast?.until||0,c.nextAction||0,c.globalCooldowns?.[133]||0);
 }
 // Only candidate readiness uses this view; it is never given to execution.
 get future(){return this._future??=this.readyAt>this.state.clock?{...this.state,clock:this.readyAt}:this.state;}
 get futureActor(){return this.actor===this.state?this.future:this.actor;}
 get attackIntent(){
  if(!this._attackRead){
   const c=this.actor,e=this.target;
   this._attack=strategyAllows(this.state,c,e,{SpellName:'Melee'})?(c.target!==e.id?{kind:'attack',targetId:e.id}:null):c.target?{kind:'stopAttack'}:null;
   this._attackRead=true;
  }
  return this._attack;
 }
}
