import {isDeepStrictEqual} from 'node:util';
import {participantState, participantPresentationState} from '../../../packages/game-domain/src/resident-participants.ts';
import {controllerAction} from '../../../packages/game-domain/src/controller-actions.ts';
import {validateDungeonOccupants} from '../../../packages/game-domain/src/dungeon-roster.ts';
import {act, advanceOwned, dormantRules, nextAdvanceWallAt} from '../../../packages/game-domain/src/rules/engine.js';
import {combatMembers} from '../../../packages/game-domain/src/rules/combat-members.js';
import type {Rules} from '../../../packages/game-domain/src/model.ts';
import {integer} from '../../../packages/combat-core/scheduling/event-queue.ts';
import type {Controller, SimulationInput, InputReceipt, PublicFrame, PublicUnit} from '../../../packages/protocol/src/simulation.ts';
import {validateSimulationInput,isInputReceipt,inputConfirmation} from '../../../packages/protocol/src/simulation.ts';
import {runtimeVersion} from './version.ts';
import {buildGameResponse} from '../../../packages/game-domain/src/rules/server-response.js';
import type {GameResponse} from '../../../packages/contracts/src/game.ts';

import {PresenceClock, type PresenceState} from './presence.ts';

type Accepted = {accountId: string; input: SimulationInput; receipt: InputReceipt};
export type InstanceCheckpoint = {
  version: 1; instanceId: string; ownerEpoch: number; rulesetVersion: string; contentHash: string;
  state: Rules; presence: PresenceState | null; inputSequence: number; appliedInputSequence: number; controllers: Controller[];
  cursors: [string, number][]; recentInputs: Accepted[];
};
export type Admission = {instanceId: string; ownerEpoch: number; state: Rules; controllers: Controller[]; presence?: PresenceState | null};

/** Resident adapter during event migration. Projectile deadlines use the shared
 * heap; other systems still run in the 100ms rule pass. The outer tick is not
 * wrapped in a queue and advertised as a fully event-driven combat kernel. */
export class ResidentInstance {
  readonly instanceId: string;
  readonly ownerEpoch: number;
  private state: Rules;
  private presenceClock?: PresenceClock;
  private controllers: Controller[];
  private cursors = new Map<string, number>();
  private recentInputs: Accepted[] = [];
  private inputSequence = 0;
  private appliedInputSequence = 0;
  private durableAccepted = 0;
  private durableApplied = 0;
  private pendingInputs: Accepted[] = [];
  private streamSequence = 0;
  private baselineSequence = 0;
  private previous = new Map<string, PublicUnit>();
  private failed = false;
  private presentationSequence = 0;
  private presentationCache?: {key:string;response:GameResponse};

  constructor(admission: Admission) {
    if (!admission.instanceId || admission.instanceId.length > 120) throw new Error('Invalid instance ID');
    integer(admission.ownerEpoch, 'ownerEpoch', 1);
    this.instanceId = admission.instanceId; this.ownerEpoch = admission.ownerEpoch;
    this.state = structuredClone(admission.state);
    integer(this.state.wallAt, 'wallAt'); integer(this.state.clock, 'clock');
    integer(this.state.nextTick, 'nextTick', this.state.clock + 1);
    integer(this.state.rngState, 'rngState', 1);
    if (this.state.rngState > 0xffffffff || !Array.isArray(this.state.party) || !this.state.activity) throw new Error('Invalid initial state');
    const actors = new Set([this.state, ...this.state.party].map(actor => actor.id));
    const assigned = new Set<string>();
    for (const controller of admission.controllers) {
      integer(controller.generation, 'controller generation', 1);
      if (!actors.has(controller.actorId) || assigned.has(controller.actorId) ||
        typeof controller.accountId !== 'string' || !controller.accountId || controller.accountId.length > 200 ||
        typeof controller.canPause !== 'boolean') throw new Error('Invalid controller');
      participantState(this.state, controller.actorId);
      assigned.add(controller.actorId);
    }
    this.controllers = structuredClone(admission.controllers);
    if(this.state.dungeonRoster){
      validateDungeonOccupants(this.state);
      const humans=[this.state,...this.state.party].filter(actor=>!actor.npcPlayer);
      if(humans.length!==assigned.size||humans.some(actor=>!assigned.has(actor.id)))throw new Error('Dungeon controller presence mismatch');
    }
    if (admission.presence) {
      this.presenceClock = new PresenceClock(admission.presence, this.controllers.map(c => c.accountId));
      if (this.wallAt > this.offlineDeadline) throw new Error('State exceeds offline allowance');
    }
  }
  get wallAt(): number { return this.state.wallAt; }
  get simTime(): number { return this.state.clock; }
  get offlineDeadline(): number { return this.presenceClock?.deadline ?? Infinity; }
  get hasPresencePolicy(): boolean { return !!this.presenceClock; }
  get pendingInputCount() { return this.pendingInputs.length; }
  get hasReadyInput() { return !!this.pendingInputs[0] && this.pendingInputs[0].receipt.effectiveWallAt <= this.wallAt; }
  get nextWakeWallAt(): number {
    if (this.hasReadyInput) return this.wallAt;
    if (this.wallAt >= this.offlineDeadline) return Infinity;
    return Math.min(this.offlineDeadline, this.pendingInputs[0]?.receipt.effectiveWallAt ?? Infinity, nextAdvanceWallAt(this.state));
  }
  /** A sleeping clock is lazy. Reads may materialize only proven dormant time;
   * active combat and queued inputs always remain the scheduler's work. */
  private refreshDormantClock(until?: number) {
    if (until !== undefined && Math.min(until, this.offlineDeadline) > this.wallAt &&
      !this.pendingInputs.length && dormantRules(this.state)) this.advance(until);
  }
  confirmCheckpoint(accepted: number, applied: number) {
    integer(accepted, 'durable accepted cursor'); integer(applied, 'durable applied cursor');
    if (accepted > this.inputSequence || applied > this.appliedInputSequence || applied > accepted) throw new Error('Durable input cursor ahead of state');
    this.durableAccepted = Math.max(this.durableAccepted, accepted); this.durableApplied = Math.max(this.durableApplied, applied);
    this.presentationCache = undefined;
  }
  recordPresence(accountId: string, actorId: string, at: number, generation?: number) {
    this.assertHealthy();
    const controller = this.controllers.find(c => c.actorId === actorId && c.accountId === accountId);
    if (!controller || generation !== undefined && controller.generation !== generation) throw new Error('Controller fenced');
    const shifted = this.presenceClock?.record(accountId, at) ?? 0;
    integer(this.state.wallAt + shifted, 'resumed wall time');
    this.state.wallAt += shifted;
    for (const row of this.pendingInputs) row.receipt.effectiveWallAt += shifted;
    if (shifted) this.presentationCache = undefined;
    return shifted;
  }
  advance(until: number, maxTicks = 10) {
    this.assertHealthy(); integer(maxTicks, 'maxTicks', 1); integer(until, 'until', this.wallAt);
    try {
      const target = Math.max(this.wallAt, Math.min(until, this.offlineDeadline));
      const pending = this.pendingInputs[0];
      const boundary = pending ? Math.min(target, pending.receipt.effectiveWallAt) : target;
      const result = advanceOwned(this.state, boundary, {maxTicks});
      // At most one command per turn, after its exact accepted time. Returning
      // incomplete keeps same-time inputs ordered without an unbounded burst.
      if (result.complete && this.hasReadyInput) this.applyInput(this.pendingInputs.shift()!);
      return {complete: result.complete && this.wallAt >= target && !this.hasReadyInput, wallAt: this.wallAt, simTime: this.simTime};
    } catch (error) { this.failed = true; throw error; }
  }
  /** Accept at an owner-assigned time without waiting for historical combat.
   * Pending commands are bounded and part of every consistent checkpoint. */
  input(accountId: string, input: SimulationInput, effectiveWallAt = this.wallAt): InputReceipt {
    this.assertHealthy(); validateSimulationInput(input);
    if (input.instanceId !== this.instanceId || typeof input.requestId !== 'string' || !input.requestId || input.requestId.length > 100) throw new Error('Invalid input identity');
    const controller = this.controllers.find(row => row.actorId === input.actorId);
    if (!controller || controller.accountId !== accountId || controller.generation !== input.controllerGeneration) throw new Error('Controller fenced');
    const previous = this.recentInputs.find(row => row.accountId === accountId && row.input.requestId === input.requestId);
    if (previous) {
      if (!isDeepStrictEqual(input, previous.input)) throw new Error('Request ID reused');
      return {...previous.receipt};
    }
    integer(effectiveWallAt, 'effectiveWallAt', this.wallAt);
    if (this.pendingInputs.length >= 64) throw new Error('Instance input queue full');
    integer(input.clientSequence, 'clientSequence', 1);
    if (input.clientSequence <= (this.cursors.get(input.actorId) ?? 0)) throw new Error('Stale client sequence');
    if (this.inputSequence >= Number.MAX_SAFE_INTEGER) throw new Error('Input sequence exhausted');
    const receipt: InputReceipt = {requestId: input.requestId, inputSequence: ++this.inputSequence,
      effectiveWallAt: Math.max(effectiveWallAt, this.pendingInputs.at(-1)?.receipt.effectiveWallAt ?? this.wallAt), simTime: null, status: 'queued'};
    const row = {accountId, input: structuredClone(input), receipt};
    this.cursors.set(input.actorId, input.clientSequence);
    this.recentInputs.push(row); this.pendingInputs.push(row);
    if (this.recentInputs.length > 256) this.recentInputs.shift();
    this.presentationCache = undefined;
    if (this.pendingInputs[0] === row && this.hasReadyInput) this.applyInput(this.pendingInputs.shift()!);
    return {...receipt};
  }
  private applyInput(row: Accepted) {
    const {accountId,input,receipt} = row;
    receipt.status = 'applied'; receipt.effectiveWallAt = this.wallAt; receipt.simTime = this.simTime;
    try {
      const controller = this.controllers.find(c => c.actorId === input.actorId && c.accountId === accountId && c.generation === input.controllerGeneration);
      if (!controller) throw new Error('Controller fenced');
      const action = controllerAction(this.state, this.controllers, controller, input.command);
      // act owns its boundary copy, so a rejected command cannot corrupt state.
      this.state = act(this.state, action, this.wallAt, {actorId: input.actorId});
    } catch (error) { receipt.status = 'rejected'; receipt.reason = (error as Error).message; }
    this.appliedInputSequence = receipt.inputSequence;
    this.presentationCache = undefined;
  }
  presentation(accountId:string,actorId:string,scope:'full'|'combat'='full',liveUntil?:number):GameResponse {
    this.assertHealthy();
    const controller=this.controllers.find(row=>row.actorId===actorId&&row.accountId===accountId);
    if(!controller)throw new Error('Presentation access denied');
    this.refreshDormantClock(liveUntil);
    const offlinePaused=this.wallAt>=this.offlineDeadline;
    const interval=scope==='combat'?100:1000;
    const key=`${JSON.stringify([accountId,actorId])}:${scope}:${Math.floor(this.wallAt/interval)}:${this.inputSequence}:${offlinePaused}`;
    if(this.presentationCache?.key===key)return this.presentationCache.response;
    if(this.presentationSequence>=Number.MAX_SAFE_INTEGER)throw new Error('Presentation sequence exhausted');
    const streamSequence=++this.presentationSequence;
    const response:GameResponse={...buildGameResponse(participantPresentationState(this.state,actorId),streamSequence,{scope,instanceState:this.state,combatMode:'realtime',playback:null}) as GameResponse,
      execution:{instanceId:this.instanceId,ownerEpoch:this.ownerEpoch,streamSequence,actorId,
        controllerGeneration:controller.generation,clientSequence:this.cursors.get(actorId)??0,
        pendingInputs:this.pendingInputs.filter(row=>row.input.actorId===actorId).length,
        receipts:this.recentInputs.filter(row=>row.input.actorId===actorId).slice(-80).map(row=>({...row.receipt,
          confirmation:inputConfirmation(row.input.command),
          durable:row.receipt.inputSequence<=(row.receipt.status==='queued'?this.durableAccepted:this.durableApplied)}))}};
    if(response.snapshot)response.snapshot.player.presence={paused:offlinePaused,
      reason:offlinePaused?'有角色已达到离线上限，实例暂停，等待该角色重新上线。':null};
    const strategies = (response.snapshot?.view as Rules | undefined)?.strategyMembers;
    if (Array.isArray(strategies)) {
      const owned = new Set(this.controllers.filter(c => c.accountId === accountId).map(c => c.actorId));
      (response.snapshot!.view as Rules).strategyMembers = strategies.filter((c: Rules) => owned.has(c.id));
    }
    this.presentationCache={key,response};return response;
  }
  checkpoint(): InstanceCheckpoint {
    this.assertHealthy();
    return structuredClone({version: 1, instanceId: this.instanceId, ownerEpoch: this.ownerEpoch, ...runtimeVersion,
      state: this.state, presence: this.presenceClock?.snapshot() ?? null, inputSequence: this.inputSequence, appliedInputSequence: this.appliedInputSequence, controllers: this.controllers,
      cursors: [...this.cursors], recentInputs: this.recentInputs});
  }
  static restore(checkpoint: InstanceCheckpoint, ownerEpoch: number) {
    if (!Object.hasOwn(checkpoint, 'presence') || checkpoint.version !== 1 || checkpoint.rulesetVersion !== runtimeVersion.rulesetVersion || checkpoint.contentHash !== runtimeVersion.contentHash) throw new Error('Runtime version mismatch');
    integer(checkpoint.ownerEpoch, 'checkpoint epoch', 1);
    integer(ownerEpoch, 'ownerEpoch', checkpoint.ownerEpoch);
    integer(checkpoint.inputSequence, 'inputSequence');
    integer(checkpoint.appliedInputSequence, 'appliedInputSequence');
    if (checkpoint.appliedInputSequence > checkpoint.inputSequence) throw new Error('Invalid applied input cursor');
    if (!Array.isArray(checkpoint.recentInputs) || checkpoint.recentInputs.length > 256 || !Array.isArray(checkpoint.cursors)) throw new Error('Invalid input checkpoint');
    const runtime = new ResidentInstance({...checkpoint, ownerEpoch});
    const actors = new Set(runtime.controllers.map(row => row.actorId));
    for (const [actorId, sequence] of checkpoint.cursors) {
      if (!actors.has(actorId) || runtime.cursors.has(actorId)) throw new Error('Invalid input cursor');
      integer(sequence, 'client cursor', 1); runtime.cursors.set(actorId, sequence);
    }
    const requests = new Set<string>(), inputs = new Set<number>();
    for (const row of checkpoint.recentInputs) {
      validateSimulationInput(row.input);
      const controller = runtime.controllers.find(c => c.actorId === row.input?.actorId);
      const requestKey = JSON.stringify([row.accountId, row.input?.requestId]);
      if (!controller || controller.accountId !== row.accountId || row.input.instanceId !== runtime.instanceId ||
        row.input.controllerGeneration !== controller.generation || row.receipt.requestId !== row.input.requestId ||
        row.receipt.inputSequence > checkpoint.inputSequence || inputs.has(row.receipt.inputSequence) || requests.has(requestKey) ||
        !isInputReceipt(row.receipt)) throw new Error('Invalid input receipt');
      integer(row.receipt.inputSequence, 'input receipt sequence', 1);
      integer(row.receipt.effectiveWallAt, 'input wall time');
      if (row.receipt.status === 'queued') {
        if (row.receipt.simTime !== null || row.receipt.inputSequence <= checkpoint.appliedInputSequence || row.receipt.effectiveWallAt < runtime.wallAt) throw new Error('Invalid pending input');
      } else if (row.receipt.inputSequence > checkpoint.appliedInputSequence) throw new Error('Applied input cursor behind receipt');
      integer(row.input.clientSequence, 'input client sequence', 1);
      if (row.receipt.status !== 'queued' && (row.receipt.effectiveWallAt > runtime.wallAt || Number(row.receipt.simTime) > runtime.simTime) ||
        row.input.clientSequence > (runtime.cursors.get(row.input.actorId) ?? 0)) throw new Error('Input cursor ahead of state');
      requests.add(requestKey); inputs.add(row.receipt.inputSequence);
    }
    runtime.inputSequence = checkpoint.inputSequence;
    runtime.recentInputs = structuredClone(checkpoint.recentInputs);
    runtime.pendingInputs = runtime.recentInputs.filter(row=>row.receipt.status==='queued');
    if (runtime.pendingInputs.length > 64 || runtime.pendingInputs.length !== checkpoint.inputSequence - checkpoint.appliedInputSequence) throw new Error('Invalid pending input count');
    let last = 0, lastTime = runtime.wallAt;
    for (const row of runtime.recentInputs) {
      if (row.receipt.inputSequence <= last) throw new Error('Input receipt order invalid');
      last = row.receipt.inputSequence;
      if (row.receipt.status === 'queued') {
        if (row.receipt.effectiveWallAt < lastTime) throw new Error('Input time order invalid');
        lastTime = row.receipt.effectiveWallAt;
      }
    }
    if (last !== checkpoint.inputSequence) throw new Error('Input receipt tail missing');
    runtime.appliedInputSequence = checkpoint.appliedInputSequence;
    runtime.confirmCheckpoint(checkpoint.inputSequence, checkpoint.appliedInputSequence);
    return runtime;
  }
  /** Explicit public allowlist. No inventory, tactics, future events or RNG. */
  project(serverTime: number, full = false, liveUntil?: number): PublicFrame {
    this.assertHealthy(); integer(serverTime, 'serverTime');
    this.refreshDormantClock(liveUntil);
    const current = new Map<string, PublicUnit>();
    const battleground = this.state.battleground;
    const inBattleground = battleground && ['countdown', 'combat', 'finished'].includes(battleground.phase);
    const units = inBattleground ? battleground.teams.flatMap((team: Rules) => team.members)
      : [...combatMembers(this.state), ...(this.state.combat?.enemies ?? [])];
    for (const actor of units) {
      current.set(actor.id, {id: actor.id, hp: actor.hp ?? 0, mana: actor.mana ?? 0,
        rage: actor.rage ?? 0, energy: actor.energy ?? 0, x: inBattleground ? actor.x : actor.position ?? 0, y: inBattleground ? actor.y : actor.positionY ?? 0,
        dead: actor.hp <= 0, cast: actor.cast ? {spellId: actor.cast.spell ?? null, name: actor.cast.name ?? null,
          endsAt: actor.cast.until + (inBattleground ? this.simTime - battleground.clock : 0)} : null});
    }
    full ||= this.streamSequence === 0;
    if (this.streamSequence >= Number.MAX_SAFE_INTEGER) throw new Error('Stream sequence exhausted');
    this.streamSequence++;
    if (full) this.baselineSequence = this.streamSequence;
    const changes = [...current.values()].filter(unit => full || !isDeepStrictEqual(this.previous.get(unit.id), unit));
    const removed = full ? [] : [...this.previous.keys()].filter(id => !current.has(id));
    this.previous = current;
    return {instanceId: this.instanceId, ownerEpoch: this.ownerEpoch, streamSequence: this.streamSequence,
      baselineSequence: this.baselineSequence, serverTime, simTime: this.simTime, full, changes, removed};
  }
  private assertHealthy() { if (this.failed) throw new Error('Instance is quarantined'); }
}
