import {enterGoldRaid,goldRaidContents} from './rules/gold-raid.js';
import {raidNameFor} from './rules/molten-core-content.js';
import {dungeonDefinitions} from './rules/dungeon-registry.js';
import { enterDungeon } from './rules/dungeon.js';
import { startCombat } from './rules/combat.js';
import type { Rules } from './model.ts';
// Registered content invokes the existing combat and dungeon rule implementations.
// Larger capacities validate orchestration; they do not claim finished raid content.
export const instanceContents = Object.freeze({
    ...Object.fromEntries(Object.values(dungeonDefinitions).map(d => [d.id, {id:d.id,name:d.name,minimumLevel:d.minimumLevel,start(state:Rules){enterDungeon(state,d.id);}}])),
    ...Object.fromEntries(Object.entries(goldRaidContents).map(([id,raidId])=>[id,{id,name:raidNameFor(raidId)+'·金团',minimumLevel:60,start(state:Rules){enterGoldRaid(state,raidId);}}])),
    'northshire-skirmish': { id: 'northshire-skirmish', name: '北郡遭遇', minimumLevel: 1, start(state: Rules) { startCombat(state, [6]); } },
});
