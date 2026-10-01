import {validateRuleAction,type RuleAction} from './rule-action.ts';
/** Gateway supplies authenticated accountId separately; no state, damage,
 * rewards, RNG or client-selected effective time is accepted here. */
export type SimulationCommand =
  | {kind: 'action'; action: RuleAction}
  | {kind: 'cast'; encounterId: string; spellId: number; targetId: string}
  | {kind: 'pause' | 'resume'; encounterId: string}
  | {kind: 'hunt'; monsterId: number}
  | {kind: 'stop' | 'rest'}
  | {kind: 'loot'; itemIds: string[]}
  | {kind: 'travel'; destination: string}
  | {kind: 'questAccept' | 'questAbandon'; questId: number}
  | {kind: 'questTurnIn'; questId: number; choiceId: number | null};
export type SimulationInput = {
  instanceId: string; actorId: string; controllerGeneration: number;
  clientSequence: number; requestId: string; command: SimulationCommand;
};
/** Types do not validate JSON received at an API boundary. Reject extra fields
 * as well as oversized identifiers so journal entries remain bounded. */
export function validateSimulationInput(value: SimulationInput) {
  const fields = (object: unknown, keys: string[]) => {
    if (!object || typeof object !== 'object' || Array.isArray(object) ||
      Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) throw new Error('Invalid input fields');
  };
  const id = (text: unknown, maximum = 120) => { if (typeof text !== 'string' || !text || text.length > maximum) throw new Error('Invalid input identifier'); };
  const counter = (number: number) => { if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid input counter'); };
  fields(value, ['instanceId', 'actorId', 'controllerGeneration', 'clientSequence', 'requestId', 'command']);
  id(value.instanceId); id(value.actorId); id(value.requestId, 100);
  counter(value.controllerGeneration); counter(value.clientSequence);
  const command = value.command;
  if(command?.kind==='action'){fields(command,['kind','action']);validateRuleAction(command.action);}
  else if (command?.kind === 'cast') {
    fields(command, ['kind', 'encounterId', 'spellId', 'targetId']); counter(command.spellId); id(command.targetId); id(command.encounterId);
  } else if (command?.kind === 'pause' || command?.kind === 'resume') { fields(command, ['kind', 'encounterId']); id(command.encounterId); }
  else if (command?.kind === 'hunt') { fields(command, ['kind', 'monsterId']); counter(command.monsterId); }
  else if (command?.kind === 'stop' || command?.kind === 'rest') fields(command, ['kind']);
  else if (command?.kind === 'travel') { fields(command, ['kind', 'destination']); id(command.destination); }
  else if (command?.kind === 'questAccept' || command?.kind === 'questAbandon') { fields(command, ['kind', 'questId']); counter(command.questId); }
  else if (command?.kind === 'questTurnIn') {
    fields(command, ['kind', 'questId', 'choiceId']); counter(command.questId); if(command.choiceId !== null) counter(command.choiceId);
  } else if (command?.kind === 'loot') {
    fields(command, ['kind', 'itemIds']);
    if(!Array.isArray(command.itemIds) || command.itemIds.length > 128 || new Set(command.itemIds).size !== command.itemIds.length) throw new Error('Invalid loot selection');
    for(const itemId of command.itemIds) id(itemId, 700);
  }
  else throw new Error('Unsupported command');
}
export type Controller = {actorId: string; accountId: string; generation: number; canPause: boolean};
export type InputReceipt = {
  requestId: string; inputSequence: number; effectiveWallAt: number; simTime: number | null;
  status: 'queued' | 'applied' | 'rejected'; reason?: string;
};
export type PublicUnit = {id: string; hp: number; mana: number; rage: number; energy: number;
  x: number; y: number; dead: boolean; cast: {spellId: number | null; name: string | null; endsAt: number} | null};
export type PublicFrame = {instanceId: string; ownerEpoch: number; streamSequence: number; baselineSequence: number;
  serverTime: number; simTime: number; full: boolean; changes: PublicUnit[]; removed: string[]};

/** Epoch and sequence checks apply before touching the displayed state. A gap
 * requires a fresh baseline; the gateway must separately fence owner epochs. */
export class PublicReplica {
  private instanceId: string;
  private epoch = 0;
  private sequence = 0;
  private baseline = 0;
  units = new Map<string, PublicUnit>();
  constructor(instanceId: string) { this.instanceId = instanceId; }
  apply(frame: PublicFrame): boolean {
    if (frame.instanceId !== this.instanceId || frame.ownerEpoch < this.epoch ||
      frame.ownerEpoch === this.epoch && frame.streamSequence <= this.sequence) return false;
    if (frame.full) {
      if (frame.baselineSequence !== frame.streamSequence) return false;
      this.units = new Map(frame.changes.map(unit => [unit.id, structuredClone(unit)]));
      this.baseline = frame.baselineSequence;
    } else {
      if (frame.ownerEpoch !== this.epoch || frame.baselineSequence !== this.baseline || frame.streamSequence !== this.sequence + 1) return false;
      for (const id of frame.removed) this.units.delete(id);
      for (const unit of frame.changes) this.units.set(unit.id, structuredClone(unit));
    }
    this.epoch = frame.ownerEpoch; this.sequence = frame.streamSequence;
    return true;
  }
}

export type InputConfirmation = 'applied' | 'durable';
const transientCombatOrders = new Set(['moveTo','cancelMove','holdFire','cast','stopCast','clearAll','mode','mark','clear','focus','control','kite']);
/** A server-selected business boundary, never a client preference. Combat
 * intentions are acknowledged from memory and included in the periodic save.
 * Asset, progression and lifecycle commands retain durable confirmation. */
export function inputConfirmation(command: SimulationCommand): InputConfirmation {
  if (command.kind === 'cast') return 'applied';
  if (command.kind === 'action') {
    if (command.action.type === 'cast' || command.action.type === 'raidOrder') return 'applied';
    if (command.action.type === 'combatCommand' && transientCombatOrders.has(String(command.action.order))) return 'applied';
  }
  return 'durable';
}
export type PublishedInputReceipt = InputReceipt & {durable: boolean; confirmation: InputConfirmation};
export function isPublishedInputReceipt(value: unknown): value is PublishedInputReceipt {
  const receipt = value as PublishedInputReceipt;
  return isInputReceipt(value) && typeof receipt.durable === 'boolean' && ['applied','durable'].includes(receipt.confirmation);
}
export function isInputReceipt(value: unknown): value is InputReceipt {
  const r=value as InputReceipt;
  return !!r && typeof r==='object' && typeof r.requestId==='string' && r.requestId.length>0 && r.requestId.length<=100 &&
    Number.isSafeInteger(r.inputSequence) && r.inputSequence>0 && Number.isSafeInteger(r.effectiveWallAt) && r.effectiveWallAt>=0 &&
    ['queued','applied','rejected'].includes(r.status) && (r.status==='queued'?r.simTime===null:Number.isSafeInteger(r.simTime)&&Number(r.simTime)>=0) &&
    (r.reason===undefined || typeof r.reason==='string');
}
