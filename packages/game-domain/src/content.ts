import {enterGoldRaid} from './rules/gold-raid.js';
import {dungeonDefinitions} from './rules/dungeon-registry.js';
import { enterDungeon } from './rules/dungeon.js';
import { startCombat } from './rules/combat.js';
import type { Rules } from './model.ts';
// Registered content invokes the existing combat and dungeon rule implementations.
// Larger capacities validate orchestration; they do not claim finished raid content.
export const instanceContents = Object.freeze({
    ...Object.fromEntries(Object.values(dungeonDefinitions).map(d => [d.id, {id:d.id,name:d.name,minimumLevel:d.minimumLevel,start(state:Rules){enterDungeon(state,d.id);}}])),
    'molten-core-gold': {id:'molten-core-gold',name:'熔火之心·金团',minimumLevel:60,start:enterGoldRaid},
    'onyxias-lair-gold': {id:'onyxias-lair-gold',name:'奥妮克希亚的巢穴·金团',minimumLevel:60,start(state:Rules){enterGoldRaid(state,'onyxias-lair');}},
    'northshire-skirmish': { id: 'northshire-skirmish', name: '北郡遭遇', minimumLevel: 1, start(state: Rules) { startCombat(state, [6]); } },
});
