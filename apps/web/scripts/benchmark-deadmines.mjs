// Combat fixtures only: grants level/spells, keeps starting gear. Not a normal 1–20 playthrough.
import {createGame,act,advance,stats} from '../../../packages/game-domain/src/rules/engine.js';
import {startCombat} from '../../../packages/game-domain/src/rules/combat.js';
import {abilities} from '../../../packages/game-domain/src/rules/catalog.js';
for(const entry of [644,1763,643,647,645,639]){
 let s=createGame('Benchmark',283,0);s.level=18;s.hp=stats(s).maxHp;s.mana=stats(s).maxMana;
 s.learned=[...new Set([...s.learned,...abilities.filter(a=>a.requiredLevel<=18).map(a=>a.spellId)])];
 for(const id of ['warrior','priest','rogue','mage'])s=act(s,{type:'recruit',id},0);
 startCombat(s,[entry],true);const casts=new Set();let next=1000;
 while(s.combat&&next<=180000){
  s=advance(s,next).state;
  for(const l of s.logs)if(l.at>next-1000&&l.at<=next&&l.kind==='cast'&&l.actorId?.startsWith('enemy-'))casts.add(l.spellId);
  next+=1000;
 }
 console.log(JSON.stringify({entry,time:s.clock,ended:!s.combat,alive:[s,...s.party].filter(c=>c.hp>0).length,health:[s,...s.party].map(c=>c.hp),enemySpells:[...casts],healing:s.lastCombat?.healing}));
}
