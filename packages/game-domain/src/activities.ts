import { act, advance } from './rules/engine.js';
import { recipes } from './rules/profession-data.js';
import { items } from './rules/catalog.js';
import { recipeQuote, professionAction } from './rules/professions.js';
import { receive, consume } from './rules/inventory.js';
import { bagCapacity } from './rules/character.js';
import type { Transaction } from '../../persistence/src/store.ts';
import { requireThat } from './model.ts';
import type { Character, Activity, Rules, Item } from './model.ts';
import { owned, bump, context, persistCharacter, economicEvent, clone } from './context.ts';
import type { GameService } from './service.ts';
function returnTool(state: Rules, tool: Rules) { (state.bag.length < bagCapacity(state) ? state.bag : state.pending).push(clone(tool.data)); }
export async function startActivity(this: GameService, tx: Transaction, c: Character, cmd: Rules, now: number) {
    await this.ensureFree(tx, c.id);
    const type = cmd.type === 'craft' || cmd.activityType === 'craft' ? 'craft' : 'gather';
    let s = await context(tx, c, now, false);
    s = advance(s, now).state;
    s.party = [];
    s.rngState = this.seed();
    const action = cmd.type === 'startActivity' ? { type: type === 'craft' ? 'craft' : 'gatherResource', id: cmd.id, count: cmd.count || 1, buyMissing: cmd.buyMissing === true } : { ...cmd };
    const a: Activity = { id: this.id(), accountId: c.accountId, actorId: c.id, type, status: 'running', location: s.location, startedAt: now, settledUntil: now, nextEventAt: now + 3000, contentVersion: this.contentVersion, rngState: s.rngState, engineActivity: { type: 'idle' }, command: action, payerId: cmd.payerId || c.id, recipientId: cmd.recipientId || c.id };
    const payer = await owned(tx, c.accountId, a.payerId!), recipient = await owned(tx, c.accountId, a.recipientId!);
    if (payer.id !== c.id)
        await this.ensureFree(tx, payer.id);
    if (recipient.id !== c.id)
        await this.ensureFree(tx, recipient.id);
    if (type === 'gather') {
        requireThat(payer.id === c.id && recipient.id === c.id, 'GATHER_OWNER', '采集收益归执行角色');
        s = act(s, action, now);
        a.engineActivity = clone(s.activity);
        a.nextEventAt = now + (s.activity.endsAt - s.clock);
    }
    else {
        const recipe = recipes.find((r: Rules) => r.id === action.id);
        requireThat(recipe, 'RECIPE', '配方不存在', 400);
        requireThat(recipient.id === c.id || ![1, 4].includes(items[recipe.item]?.bonding), 'BOUND_OUTPUT', '绑定产物必须由制造角色接收');
        let payerState = await context(tx, payer, now, false);
        payerState = advance(payerState, now).state;
        let input = { ...clone(s), bag: clone(payerState.bag), bank: clone(payerState.bank), money: payerState.money };
        // Dry run uses the same authoritative engine validation as eventual settlement.
        act(input, { ...action, type: 'craft' }, now);
        if (action.buyMissing) {
            professionAction(input, { ...action, type: 'buyMaterials' });
            payerState.bag = input.bag;
            payerState.bank = input.bank;
            payerState.money = input.money;
            await persistCharacter(tx, payer, payerState, now, `purchase:${a.id}`, this.id);
        }
        const quote = recipeQuote(input, recipe, action.count);
        const reserved: Rules[] = [];
        for (const material of quote.materials) {
            consume(payerState, material.id, material.count);
            reserved.push({ id: material.id, count: material.count });
        }
        // Ask the rule engine whether each actual asset satisfies the tool requirement:
        // this includes superior enchanting rods without duplicating its rod hierarchy.
        // Keep the tool row and full stack identity while it is held by the reservation.
        for (const tool of quote.tools) {
            const candidates = [...payerState.bag, ...reserved.filter(m => m.tool).map(m => m.data)];
            const candidate = candidates.find((item: Rules) => recipeQuote({ ...input, bag: [item] }, recipe, action.count).tools.some((entry: Rules) => entry.id === tool.id && entry.have));
            requireThat(candidate, 'TOOL', '制造工具不可用');
            if (reserved.some(m => m.assetId === candidate.uid))
                continue;
            const row = await tx.get<Item>('items', candidate.uid);
            requireThat(row && row.ownerCharacterId === payer.id && row.container === 'bag', 'TOOL', '制造工具资产不可用');
            await tx.put('items', { ...row, container: 'reservation', reservationId: a.id });
            reserved.push({ id: candidate.id, count: candidate.count, tool: true, assetId: candidate.uid, data: clone(candidate) });
            payerState.bag = payerState.bag.filter((item: Rules) => item.uid !== candidate.uid);
        }
        a.reservationId = a.id;
        await tx.insert('reservations', { id: a.id, accountId: c.accountId, actorId: c.id, payerId: payer.id, recipientId: recipient.id, activityId: a.id, status: 'reserved', materials: reserved });
        await persistCharacter(tx, payer, payerState, now, `reserve:${a.id}`, this.id);
        a.engineActivity = { type: 'craft', recipeId: recipe.id, endsAt: s.clock + 3000 };
    }
    // Only the activity owns this RNG. Dispatching other actors cannot perturb it.
    const rootRng = c.rules.rngState;
    s.rngState = rootRng;
    await persistCharacter(tx, c, s, now, `dispatch:${a.id}`, this.id, type !== 'craft' || payer.id !== c.id);
    await tx.insert('activities', a);
    await this.lock(tx, c, 'activity', a.id);
    await economicEvent(tx, `dispatch:${a.id}`, c.accountId, 'activityStarted', { activityId: a.id });
}
export async function recall(this: GameService, tx: Transaction, accountId: string, id: string, now: number) {
    const a = await tx.get<Activity>('activities', id);
    requireThat(a && a.accountId === accountId, 'FORBIDDEN', '活动不属于此账号', 403);
    if (!['running', 'returning'].includes(a.status))
        return;
    if (a.status === 'returning')
        return;
    requireThat(a.type === 'craft' || a.type === 'gather', 'RECALL_TYPE', '召回只适用于采集和制造订单；个人活动请使用停止操作');
    if (a.nextEventAt <= now && a.type !== 'craft')
        await this.settleActivity(tx, a, now);
    if (a.status !== 'running')
        return;
    a.status = 'returning';
    a.settledUntil = now;
    a.nextEventAt = now + 3000;
    a.engineActivity = { type: 'returning', endsAt: (await owned(tx, accountId, a.actorId)).rules.clock + 3000 };
    await tx.put('activities', a);
}
export async function restoreReservation(this: GameService, tx: Transaction, a: Activity, now: number, key: string) { if (!a.reservationId)
    return; const reservation = await tx.get<Rules>('reservations', a.reservationId); if (!reservation || reservation.status !== 'reserved')
    return; const payer = await owned(tx, a.accountId, a.payerId!), s = await context(tx, payer, now, false); for (const material of reservation.materials) {
    if (material.tool)
        returnTool(s, material);
    else
        receive(s, material.id, material.count);
} await persistCharacter(tx, payer, s, s.wallAt, key, this.id); reservation.status = 'released'; await tx.put('reservations', { ...reservation, id: a.reservationId! }); }
export async function settleActivity(this: GameService, tx: Transaction, a: Activity, now: number) {
    // Bounded event catch-up: an automatic gather chain may contain several due
    // events, but completion never causes the remaining offline idle day to tick.
    for (let events = 0; events < 16 && ['running', 'returning'].includes(a.status) && a.nextEventAt <= now; events++) {
        const cursor = a.nextEventAt;
        await settleActivityEvent.call(this, tx, a, now);
        if (a.nextEventAt <= cursor && a.status === 'running')
            break;
        if (a.type === 'personal' && !Number.isFinite(a.engineActivity.endsAt))
            break;
    }
}
async function settleActivityEvent(this: GameService, tx: Transaction, a: Activity, now: number) {
    if (!['running', 'returning'].includes(a.status) || a.nextEventAt > now)
        return;
    requireThat(a.contentVersion === this.contentVersion, 'CONTENT_VERSION', '活动内容版本暂不可用');
    const key = `activity:${a.id}:${a.nextEventAt}`;
    if (await tx.get('settlements', key))
        return;
    if (a.status === 'returning') {
        await this.restoreReservation(tx, a, now, key);
        a.status = 'cancelled';
        a.settledUntil = now;
        await tx.put('activities', a);
        for (const id of a.participantIds || [a.actorId])
            await this.release(tx, id, a.id);
        await economicEvent(tx, key, a.accountId, 'activityRecalled', { activityId: a.id });
        await bump(tx, a.accountId);
        return;
    }
    const c = await owned(tx, a.accountId, a.actorId);
    let s = a.type === 'personal' ? await this.personalContext(tx, c, a.settledUntil) : await context(tx, c, a.settledUntil);
    s.rngState = a.rngState;
    if (a.type === 'craft') {
        const reservation = await tx.get<Rules>('reservations', a.reservationId!);
        requireThat(reservation?.status === 'reserved', 'RESERVATION', '材料预留不存在');
        const actorState = advance({ ...s, activity: { type: 'idle' } }, a.nextEventAt).state;
        s = { ...clone(actorState), bag: [], bank: [], pending: [], money: 0 };
        for (const material of reservation.materials) {
            if (material.tool)
                s.bag.push(clone(material.data));
            else
                receive(s, material.id, material.count);
        }
        s = act(s, { ...a.command, type: 'craft', buyMissing: false }, a.nextEventAt);
        const toolIds = new Set(reservation.materials.filter((m: Rules) => m.tool).map((m: Rules) => m.assetId));
        const output = [...s.bag, ...s.bank, ...s.pending].filter((item: Rules) => !toolIds.has(item.uid));
        actorState.professions = s.professions;
        actorState.professionCooldowns = s.professionCooldowns;
        actorState.logs = s.logs;
        actorState.logSequence = s.logSequence;
        actorState.rngState = c.rules.rngState;
        const recipient = await owned(tx, a.accountId, a.recipientId!), recipientState = recipient.id === c.id ? actorState : await context(tx, recipient, now, false);
        for (const item of output.filter((i: Rules) => i.count > 0))
            receive(recipientState, item.id, item.count);
        const payer = await owned(tx, a.accountId, a.payerId!), payerState = payer.id === recipient.id ? recipientState : payer.id === c.id ? actorState : await context(tx, payer, now, false);
        for (const tool of reservation.materials.filter((m: Rules) => m.tool))
            returnTool(payerState, tool);
        const states = new Map([[c.id, { character: c, state: actorState }], [recipient.id, { character: recipient, state: recipientState }], [payer.id, { character: payer, state: payerState }]]);
        for (const { character, state } of states.values())
            await persistCharacter(tx, character, state, state.wallAt, key, this.id);
        reservation.status = 'consumed';
        await tx.put('reservations', { ...reservation, id: a.reservationId! });
        a.status = 'completed';
        a.rngState = s.rngState;
    }
    else {
        const end = s.activity.endsAt;
        const due = Number.isFinite(end) ? s.wallAt + Math.max(0, end - s.clock) : now;
        const settled = advance(s, Math.min(now, due), { maxTicks: 20000 });
        s = settled.state;
        a.rngState = s.rngState;
        a.engineActivity = clone(s.activity);
        a.settledUntil = s.wallAt;
        a.nextEventAt = Number.isFinite(s.activity.endsAt) ? s.wallAt + Math.max(1, s.activity.endsAt - s.clock) : s.wallAt + 1000;
        if (a.type === 'gather')
            s.rngState = c.rules.rngState;
        await persistCharacter(tx, c, s, s.wallAt, key, this.id);
        for (const member of s.party)
            await this.persistMember(tx, member, s.wallAt, key, s);
        if (!s.combat && ['idle', 'dead'].includes(s.activity.type) && !s.rest)
            a.status = 'completed';
    }
    if (a.status === 'completed') {
        if (a.type === 'craft')
            a.settledUntil = a.nextEventAt;
        for (const id of a.participantIds || [c.id])
            await this.release(tx, id, a.id);
    }
    await tx.put('activities', a);
    await economicEvent(tx, key, a.accountId, 'activitySettled', { activityId: a.id, status: a.status });
    await bump(tx, a.accountId);
}
