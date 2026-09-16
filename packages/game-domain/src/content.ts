import { enterDungeon } from './rules/dungeon.js';
import { startCombat } from './rules/combat.js';
import type { Rules } from './model.ts';
// Registered content invokes the existing combat and dungeon rule implementations.
// Larger capacities validate orchestration; they do not claim finished raid content.
export const instanceContents = Object.freeze({
    deadmines: { id: 'deadmines', name: '死亡矿井', minimumLevel: 10, start(state: Rules) { enterDungeon(state); } },
    'northshire-skirmish': { id: 'northshire-skirmish', name: '北郡遭遇', minimumLevel: 1, start(state: Rules) { startCombat(state, [6]); } },
});
export const mercenaryTemplates = Object.freeze({
    warrior: { id: 'warrior', name: '受雇战士', classId: 1, raceId: 1, cost: 100 },
    priest: { id: 'priest', name: '受雇牧师', classId: 5, raceId: 1, cost: 100 },
    mage: { id: 'mage', name: '受雇法师', classId: 8, raceId: 1, cost: 100 },
});
