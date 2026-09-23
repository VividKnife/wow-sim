import {raidNextMechanics} from './rules/molten-core-mechanics.js';
import {grantRaidReadyAttunements} from './rules/raid-attunement.js';
import {beginMoltenCoreBattle} from './rules/molten-core-battle.js';
import {createGame,advance} from './rules/engine.js';
import {recruit} from './rules/party.js';
import {items,spells,nameOf} from './rules/catalog.js';
import {canEquip,slotOf,stats,clone} from './rules/character.js';
import {abandonCombat} from './rules/combat.js';
import {combatRole} from './rules/combat-roles.js';
import {moltenCoreBosses,defaultRaidTactics} from './rules/molten-core-encounter.js';
import {meterRows} from '../../sim-core/src/combat-meter.js';
import type {Rules} from './model.ts';

export {moltenCoreBosses,defaultRaidTactics};
import {createRoster,guildSquadNames} from './molten-core-roster.ts';
export {guildSquadNames};
export type RaidTactics = typeof defaultRaidTactics;
export interface MoltenCoreDemo {
 version:2; seed:number; revision:number; tactics:RaidTactics;
 cleared:string[]; rewards:{bossId:string;name:string}[];
 attempts:{bossId:string;number:number;won:boolean;duration:number;deaths:number;failures:Rules;support:Rules}[];
 status:'camp'|'combat'|'victory'|'defeat'|'complete'; activeBoss:string|null;
 state:Rules; attemptNumber:number;
}
function freshState(seed:number):Rules {
 const members=createRoster(),hero=members.shift()!;
 const s:Rules={...createGame('远征团长',seed,0),...hero,party:members};
 s.settings.autoLoot=false;s.logs=[];s.logSequence=0;s.bag=[];s.pending=[];s.rngState=seed;s.clock=0;s.wallAt=0;
 grantRaidReadyAttunements(s);
 return s;
}
export function createMoltenCoreDemo(seed=60325):MoltenCoreDemo {
 if(!Number.isInteger(seed)||seed<=0||seed>4294967295)throw new Error('无效随机种子。');
 return {version:2,seed,revision:0,tactics:{...defaultRaidTactics},cleared:[],rewards:[],attempts:[],status:'camp',activeBoss:null,state:freshState(seed),attemptNumber:0};
}
export function configureMoltenCore(input:MoltenCoreDemo,patch:Partial<RaidTactics>):MoltenCoreDemo {
 if(input.status==='combat')throw new Error('战斗中不能修改整团战术，请先撤退。');
 if(!patch||Object.entries(patch).some(([key,value])=>!Object.hasOwn(defaultRaidTactics,key)||typeof value!=='boolean'))throw new Error('无效战术。');
 return {...input,tactics:{...input.tactics,...patch},revision:input.revision+1};
}
export function startMoltenCoreBoss(input:MoltenCoreDemo,bossId:string):MoltenCoreDemo {
 if(input.status==='combat')throw new Error('已有战斗进行中。');
 const index=moltenCoreBosses.findIndex(b=>b.id===bossId),def=moltenCoreBosses[index];
 if(!def||input.cleared.includes(bossId)||index>0&&!input.cleared.includes(moltenCoreBosses[index-1].id))throw new Error('首领尚未解锁或已经击败。');
 const next={...input,revision:input.revision+1,attemptNumber:input.attemptNumber+1,activeBoss:bossId,status:'combat' as const,state:freshState(input.seed)};
 beginMoltenCoreBattle(next.state,bossId,input.tactics);
 return next;
}
function settleDemo(next:MoltenCoreDemo) {
 if(next.status!=='combat'||next.state.combat)return;
 const battle=next.state.lastCombat,won=battle&&!battle.abandoned&&battle.enemies.every((e:Rules)=>e.hp<=0);
 const raid=battle?.raidEncounter;
 next.attempts=[...next.attempts,{bossId:next.activeBoss!,number:next.attemptNumber,won:!!won,duration:battle?.endedAt||next.state.clock,deaths:[next.state,...next.state.party].filter(c=>c.hp<=0).length,failures:{...raid?.failures},support:{...raid?.support}}].slice(-20);
 next.status=won?'victory':'defeat';
 if(won&&!next.cleared.includes(next.activeBoss!)){
  const index=moltenCoreBosses.findIndex(b=>b.id===next.activeBoss);
  next.cleared=[...next.cleared,next.activeBoss!];
  next.rewards=[...next.rewards,{bossId:next.activeBoss!,name:moltenCoreBosses[index].reward}];
  if(next.cleared.length===moltenCoreBosses.length)next.status='complete';
 }
}
export function advanceMoltenCore(input:MoltenCoreDemo,milliseconds:number):MoltenCoreDemo {
 if(!Number.isSafeInteger(milliseconds)||milliseconds<0||milliseconds>10000)throw new Error('推进步长必须为0—10000毫秒。');
 if(input.status!=='combat'||milliseconds===0)return input;
 const result=advance(input.state,input.state.wallAt+milliseconds,{stopWhen:(s:Rules)=>!s.combat});
 const next={...input,state:result.state,revision:input.revision+1};settleDemo(next);return next;
}
export function retreatMoltenCore(input:MoltenCoreDemo):MoltenCoreDemo {
 if(input.status!=='combat')throw new Error('当前没有战斗。');
 const next={...input,state:clone(input.state),revision:input.revision+1};
 abandonCombat(next.state,next.state.combat.id);settleDemo(next);return next;
}
export function moltenCoreView(run:MoltenCoreDemo) {
 const s=run.state,battle=s.combat||s.lastCombat,raid=battle?.raidEncounter;
 const members=[s,...s.party].map(c=>{const st=stats(c);return {id:c.id,name:c.name,classId:c.classId,role:combatRole(c),squad:c.raidSquad,level:c.level,hp:c.hp,maxHp:st.maxHp,mana:c.mana,maxMana:st.maxMana,position:c.position||0,positionY:c.positionY||0,target:c.target,
  cast:c.cast?{name:nameOf('spells',c.cast.spell),until:c.cast.until,startedAt:c.cast.startedAt}:null,
  auras:(c.auras||[]).filter((a:Rules)=>a.until>s.clock).map((a:Rules)=>({name:a.raidDoom?'末日':a.raidCurse?'诅咒':a.type===7?'恐惧':a.spell===6346?'防恐':'增益',until:a.until})),
  equipment:Object.values(c.equipment).map((e:any)=>({id:e.id,name:nameOf('items',e.id)}))};});
 return {revision:run.revision,status:run.status,activeBoss:run.activeBoss,clock:s.clock,tactics:run.tactics,cleared:run.cleared,rewards:run.rewards,attempts:run.attempts,members,
  enemies:(battle?.enemies||[]).map((e:Rules)=>({id:e.id,name:e.name,hp:e.hp,maxHp:e.maxHp,position:e.position,positionY:e.positionY,enraged:e.enraged,target:e.target})),
  fires:raid?.fires||[],events:raid?.events||[],support:raid?.support||{},failures:raid?.failures||{},meter:meterRows(battle,s.clock),
  logs:s.logs.slice(-12).map((l:Rules)=>({id:l.id,text:l.text,kind:l.kind,at:l.at})),
  nextMechanics:raidNextMechanics(s.combat?.raidEncounter)};
}
