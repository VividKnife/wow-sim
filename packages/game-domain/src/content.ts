import {enterGoldRaid} from './rules/gold-raid.js';
import {enterGuildRaid} from './rules/guild-raid.js';
import {dungeonDefinitions} from './rules/dungeon-registry.js';
import { enterDungeon } from './rules/dungeon.js';
import { startCombat } from './rules/combat.js';
import type { Rules } from './model.ts';
// Registered content invokes the existing combat and dungeon rule implementations.
// Larger capacities validate orchestration; they do not claim finished raid content.
export const instanceContents = Object.freeze({
    ...Object.fromEntries(Object.values(dungeonDefinitions).map(d => [d.id, {id:d.id,name:d.name,minimumLevel:d.minimumLevel,start(state:Rules){enterDungeon(state,d.id);}}])),
    'molten-core-gold': {id:'molten-core-gold',name:'熔火之心·金团',minimumLevel:60,start:enterGoldRaid},
    'molten-core': {id:'molten-core',name:'熔火之心',minimumLevel:60,start:enterGuildRaid},
    'onyxias-lair': {id:'onyxias-lair',name:'奥妮克希亚的巢穴',minimumLevel:60,start(state:Rules){enterGuildRaid(state,'onyxias-lair');}},
    'northshire-skirmish': { id: 'northshire-skirmish', name: '北郡遭遇', minimumLevel: 1, start(state: Rules) { startCombat(state, [6]); } },
});
export const mercenaryTemplates = Object.freeze({
    warrior: { id: 'warrior', name: '受雇战士', classId: 1, raceId: 1, cost: 100 },
    priest: { id: 'priest', name: '受雇牧师', classId: 5, raceId: 1, cost: 100 },
    mage: { id: 'mage', name: '受雇法师', classId: 8, raceId: 1, cost: 100 },
});
