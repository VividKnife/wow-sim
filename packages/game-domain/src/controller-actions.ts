import type {Rules} from './model.ts';
import type {Controller, SimulationCommand} from '../../protocol/src/simulation.ts';
import type {RuleAction} from '../../protocol/src/rule-action.ts';
import {personalBuildActions} from './rules/character-action-state.js';
import {personalInventoryActions} from './rules/inventory.js';
import {dungeonControlActions} from './rules/party-control.js';

const personalActions = new Set([...personalInventoryActions, ...personalBuildActions, 'cast', 'petCommand', 'strategy', 'settings', 'groupLoot', 'loot', 'rest', 'resurrect', 'revive']);
const memberOrders = new Set(['cast', 'stopCast', 'mode', 'control', 'kite']);
const clockOrders = new Set(['prepare', 'takeover', 'pause', 'resume']);

/** Authorization depends on the current owner state, after earlier inputs have
 * applied. Targets of spells are recipients, not controller identities.
 * This function produces an intention; only the rule kernel may apply it. */
export function controllerAction(state: Rules, controllers: readonly Controller[], controller: Controller, command: SimulationCommand): RuleAction {
  let action: RuleAction;
  switch (command.kind) {
    case 'action': action = {...command.action}; break;
    case 'cast': action = {type: 'combatCommand', order: 'cast', encounterId: command.encounterId,
      memberId: controller.actorId, spellId: command.spellId, targetId: command.targetId}; break;
    case 'pause': case 'resume': action = {type: 'combatCommand', order: command.kind, encounterId: command.encounterId}; break;
    case 'hunt': action = {type: 'hunt', id: command.monsterId}; break;
    case 'stop': case 'rest': action = {type: command.kind}; break;
    case 'loot': action = {type: 'loot', uids: command.itemIds}; break;
    case 'travel': action = {type: 'travel', to: command.destination}; break;
    case 'questAccept': action = {type: 'accept', id: command.questId}; break;
    case 'questAbandon': action = {type: 'abandon', id: command.questId}; break;
    case 'questTurnIn': action = {type: 'turnin', id: command.questId, choice: command.choiceId}; break;
    default: throw new Error('Unsupported command');
  }
  const leader = controller.actorId === (state.sharedParty?.leaderId ?? state.id);
  const shared = controllers.some(c => c.accountId !== controller.accountId)||
    state.dungeonRoster?.members.some((m:{id:string;npc:boolean})=>!m.npc&&m.id!==controller.actorId);
  const canControl = (id: unknown) => {
    if (typeof id !== 'string' || ![state, ...state.party].some(c => c.id === id)) return false;
    if (id === controller.actorId) return true;
    if (!leader) return false;
    const owner = controllers.find(c => c.actorId === id);
    // Unassigned party actors are bots. A human seat retains its own controller.
    return !owner || owner.accountId === controller.accountId;
  };
  if (action.type === 'combatCommand') {
    const order = String(action.order);
    if (clockOrders.has(order)) {
      if (!leader || !controller.canPause || shared) throw new Error('Pause not permitted');
    } else if (order === 'moveTo' || order === 'cancelMove') {
      if (!Array.isArray(action.memberIds) || !action.memberIds.length || !action.memberIds.every(canControl))
        throw new Error('Member control not permitted');
    } else if (memberOrders.has(order) && (order !== 'mode' || action.memberId)) {
      if (!canControl(action.memberId)) throw new Error('Member control not permitted');
    } else {
      if (!leader) throw new Error('Team control not permitted');
      // Existing global orders cancel casts and change every actor's policy.
      // Do not apply those to another human until per-controller team consent
      // and scoped order effects exist. Marks only annotate enemies.
      if (shared && order !== 'mark') throw new Error('Shared team control not permitted');
    }
    return action;
  }
  if (!leader && !personalActions.has(action.type)) throw new Error('Activity control not permitted');
  if (['strategy', 'equip', 'talent'].includes(action.type)) {
    const target = action.target || controller.actorId;
    if (!canControl(target)) throw new Error('Member control not permitted');
    if (action.type === 'strategy') action.target = target;
  }
  // Shared room assets/lifecycle are not routed through the leader's personal
  // aggregate. Enable each operation only with its participant-aware boundary.
  if (shared && !personalActions.has(action.type) && !dungeonControlActions.has(action.type)) throw new Error('Shared activity control not permitted');
  return action;
}
