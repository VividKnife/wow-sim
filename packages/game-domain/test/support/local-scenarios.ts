import {act,createGame} from '../../src/rules/engine.js';
import {createNpcMember,companionSkills} from '../../src/rules/party.js';
import {stats} from '../../src/rules/character.js';
import {startCombat} from '../../src/rules/combat.js';
import {createMoltenCoreDemo,startMoltenCoreBoss} from '../../src/molten-core-demo.ts';
import type {Rules} from '../../src/model.ts';

export function localScenarios():Record<string,Rules> {
 const player=(level:number)=>{const s:Rules=createGame('本地性能测试',283,0);s.level=level;s.learned=companionSkills(s);s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;return s;};
 const solo=player(20);startCombat(solo,[299]);
 const dungeon=player(20);
 for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])createNpcMember(dungeon,id,{role});
 startCombat(dungeon,[636,636,1729],true);
 let arena=player(60);
 for(const [id,role] of [['rogue','melee'],['priest','healer'],['warrior','melee'],['hunter','ranged']])createNpcMember(arena,id,{role});
 arena=act(arena,{type:'arenaPrepare',size:5,mapId:'courtyard',opponentId:'rmp',memberIds:[arena.id,...arena.party.map((c:Rules)=>c.id)]},0);
 arena=act(arena,{type:'arenaStart',matchId:arena.arena.id,revision:0,plan:arena.arena.teams[0].plan},0);
 let battleground=act(player(60),{type:'battlegroundPrepare'},0);
 battleground=act(battleground,{type:'battlegroundStart',matchId:battleground.battleground.id,revision:0},0);
 return {solo,dungeon,raid:startMoltenCoreBoss(createMoltenCoreDemo(),'lucifron').state,arena,battleground};
}
