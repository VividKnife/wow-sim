import type {Rules} from '../../../../packages/game-domain/src/model.ts';
import {createGame,stats} from '../../../../packages/game-domain/src/rules/engine.js';
import {newCharacter} from '../../../../packages/game-domain/src/rules/character.js';
import {startCombat} from '../../../../packages/game-domain/src/rules/combat.js';

/** Isolated spatial test content, never persisted as a player save. */
export function positionScene(){
 const s:Rules=createGame('站位测试法师',281,0,{classId:8,raceId:1});s.id='position-mage';s.level=60;s.rules=[];
 s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 const ally:Rules=newCharacter('站位测试战士',1,60,1);ally.id='position-warrior';ally.hp=stats(ally).maxHp;ally.rules=[];s.party=[ally];
 startCombat(s,[636],true,null,{id:'position-room',shape:'rectangle',minX:-25,maxX:25,minY:-15,maxY:15,navigationRevision:0,obstacles:[{x:0,y:0,radius:3}]});delete s.combat.pull;
 for(const c of [s,ally])Object.assign(c,{position:-10,positionY:0,nextSwing:999999,nextAction:0,strategyPolicy:{waitForTank:false},raidSquad:0});
 for(const e of s.combat.enemies)Object.assign(e,{position:20,positionY:10,hp:100000,maxHp:100000,stunUntil:999999,nextSpell:999999,nextAttack:999999});
 return s;
}
