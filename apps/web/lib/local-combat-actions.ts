// Only simulation commands belong here. Asset transfers, roster changes and
// account operations still cross the persisted checkpoint boundary.
const actions = new Set(['cast', 'petCommand', 'combatCommand', 'raidOrder',
  'battlegroundOrder', 'abandonCombat', 'arenaSurrender', 'battlegroundSurrender']);

export function isLocalCombatAction(command: {type?: string; order?: string}) {
  return actions.has(command.type || '') && !(command.type === 'combatCommand' && command.order === 'prepare');
}
