import type {Rules} from '../../../packages/game-domain/src/model.ts';

export const DEFAULT_IDLE_RETIRE_MS = 60_000;
export function idleRetireDelay(value: number) {
  if (!Number.isSafeInteger(value) || value < 100 || value > 3_600_000) throw new Error('Invalid idle retirement delay');
  return value;
}

/** Eligibility for offloading an unobserved room, NOT permission to skip rule
 * time. Timed auras, regeneration and NPC progress replay on the same kernel
 * when it returns; activity deadlines and asset decisions stay resident. */
export function inactiveRoom(state: Rules): boolean {
  if (state.combat || state.rest || state.activity.endsAt != null) return false;
  if (!['idle','dead'].includes(state.activity.type) && !(state.activity.type === 'hunt' && state.activity.paused)) return false;
  if (['countdown','combat'].includes(state.arena?.phase) || ['countdown','combat'].includes(state.battleground?.phase)) return false;
  if (state.dungeon?.autoAdvance || state.goldRaid?.auctions?.length || state.groupLoot?.pending?.length) return false;
  if (state.escort || state.stockadesQuestEvent) return false;
  return [state,...state.party].every(actor => !actor.cast && !actor.rest && !actor.auctions?.length &&
    !Object.values(actor.quests ?? {}).some((quest:any) => quest.expiresAt));
}
