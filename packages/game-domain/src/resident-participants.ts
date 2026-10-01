import type {Rules} from './model.ts';
import {requireThat} from './model.ts';

export type ResidentParticipant = {characterId: string; accountId: string};

/** Every human seat carries its complete character state. Combat-only NPC
 * records must never be silently promoted to humans by a controller entry. */
export function participantState(room: Rules, characterId: string): Rules {
  const matches = [room, ...room.party].filter(c => c.id === characterId);
  requireThat(matches.length === 1, 'SIMULATION_STATE', '实例角色身份重复或缺失');
  const actor = matches[0];
  requireThat(actor.npcPlayer !== true &&
    ['bag', 'bags', 'bank', 'pending', 'auctions', 'party', 'logs', 'visited'].every(k => Array.isArray(actor[k])) &&
    ['equipment', 'quests', 'completed', 'settings'].every(k => actor[k] && typeof actor[k] === 'object' && !Array.isArray(actor[k])) &&
    Number.isSafeInteger(actor.money) && actor.money >= 0 &&
    Number.isSafeInteger(actor.itemSequence) && actor.itemSequence >= 0 &&
    (actor === room || actor.party.length === 0),
    'SIMULATION_STATE', '真人角色必须保留独立完整状态');
  return actor;
}

/** A detached boundary record for a single permanent character. Party members
 * remain owned by the room; only that character's own NPCs are synchronized.
 * This does not re-read or merge a database inventory into live simulation. */
export function participantCheckpointState(room: Rules, characterId: string): Rules {
  const actor = participantState(room, characterId);
  if (actor === room) return structuredClone(room);
  const ownNpcIds = new Set((actor.npcWorld?.residents ?? []).map((npc: Rules) => npc.id));
  const state: Rules = structuredClone({...actor, clock: room.clock, wallAt: room.wallAt,
    nextTick: room.nextTick, nextRegen: room.nextRegen, location: room.location,
    party: room.party.filter((c: Rules) => c.npcPlayer === true && ownNpcIds.has(c.id))});
  if (!state.visited.includes(state.location)) state.visited.push(state.location);
  return state;
}

const publicLogKinds = new Set(['damage', 'hit', 'heal', 'cast', 'miss', 'death', 'interrupt', 'cancel', 'command']);

/** Read-only composition: character-private fields come from the requested
 * actor; encounter clocks and visible units come from the room. Never use the
 * leader as a default source for a missing private character field. */
export function participantPresentationState(room: Rules, characterId: string): Rules {
  const actor = participantState(room, characterId);
  if (actor === room) return room;
  const encounter = room.combat ?? room.lastCombat;
  const logs = encounter ? room.logs.filter((row: Rules) => row.encounterId === encounter.id && publicLogKinds.has(row.kind)) : actor.logs;
  return {...actor, clock: room.clock, wallAt: room.wallAt, location: room.location,
    party: [room, ...room.party].filter(c => c.id !== characterId),
    combat: room.combat, lastCombat: room.lastCombat, dungeon: room.dungeon,
    dungeonRoster: room.dungeonRoster, sharedParty: room.sharedParty,
    activity: room.activity, groundEffects: room.groundEffects, groupLoot: room.groupLoot, logs,
    logSequence: encounter ? room.logSequence : actor.logSequence};
}

export function validateParticipants(participants: ResidentParticipant[], leaderId: string) {
  requireThat(Array.isArray(participants) && participants.length >= 1 && participants.length <= 40 &&
    new Set(participants.map(p => p.characterId)).size === participants.length &&
    participants.some(p => p.characterId === leaderId) && participants.every(p =>
      typeof p.characterId === 'string' && !!p.characterId && p.characterId.length <= 200 &&
      typeof p.accountId === 'string' && !!p.accountId && p.accountId.length <= 200),
    'SIMULATION_STATE', '实例参与角色名册无效');
}
