import {createGame,act,view,stats} from '../../../../packages/game-domain/src/rules/engine.js';
import {companionSkills,recruit} from '../../../../packages/game-domain/src/rules/party.js';
import {projectClientSnapshot} from '../../../../packages/game-domain/src/rules/client-snapshot.ts';

export function createJourneyState(){
 let state=createGame('林间旅人',283,0,{classId:8,raceId:1,gender:'female'});
 state.level=20;state.money=128450;state.riding={horse:true};state.mounts=[900020];
 state.learned=companionSkills(state);state.hp=stats(state).maxHp;state.mana=stats(state).maxMana;
 state=act(state,{type:'accept',id:783},state.wallAt);
 state=act(state,{type:'turnin',id:783},state.wallAt);
 state=act(state,{type:'settings',autoLoot:true},state.wallAt);
 for(const [id,role] of [['warrior','tank'],['priest','healer'],['rogue','melee'],['warlock','ranged']])recruit(state,id,{role});
 return state;
}
export function journeySnapshot(state){
 const current=view(state);
 const snapshot=projectClientSnapshot(state,current);
 // Only current/local quests and the verified sample belong in this preview.
 snapshot.view.quests=current.quests.filter(q=>q.active||q.canAccept||q.id===7);
 return snapshot;
}
