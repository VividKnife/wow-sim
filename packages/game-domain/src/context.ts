import {applyGmBuffs} from './gm-buffs.ts';
import { createGame } from './rules/engine.js';
import {syncNpcWorld} from './rules/npc-world.js';
import type { ReadView, Transaction } from '../../persistence/src/store.ts';
import { DomainError, requireThat } from './model.ts';
import type { Account, AccountPresence, Character, Item, Wallet, Rules, Activity } from './model.ts';
const separated = ['serverBuffs', 'id', 'money', 'bag', 'bags', 'bank', 'equipment', 'pending', 'auctions', 'party', 'activity', 'dungeon', 'receipts', 'npcGuests', 'npcWorld', 'npcFriendIds'];
export const clone = <T>(value: T): T => structuredClone(value);
import {rebaseSimulation} from './simulation-clock.ts';
export {rebaseSimulation} from './simulation-clock.ts';
export function characterRules(state: Rules): Rules { syncNpcWorld(state); const rules = clone(state); for (const key of separated)
    delete rules[key];
    return rules; }
export async function owned(tx: ReadView, accountId: string, id: string): Promise<Character> { const c = await tx.get<Character>('characters', id); requireThat(c && c.accountId === accountId, 'FORBIDDEN', '角色不属于此账号', 403); return c; }
export function validAccountPresence(row: AccountPresence | null): boolean {
    return !!row && Number.isSafeInteger(row.lastSeenAt) && row.lastSeenAt >= 0;
}
export async function account(tx: ReadView, id: string): Promise<Account> {
    const row = await tx.get<Account>('accounts', id);
    requireThat(row, 'NOT_FOUND', '请先创建角色', 404);

    return row;
}
export async function presence(tx: ReadView, id: string): Promise<AccountPresence> {
    const row = await tx.get<AccountPresence>('account_presence', id);
    requireThat(validAccountPresence(row), 'ACCOUNT_STATE', '账号在线状态无效，请重新创建开发存档；点击创建将清除旧角色及进度，并结束关联副本');
    return row!;
}
export async function bump(tx: Transaction, id: string) { const row = await account(tx, id); row.revision++; await tx.put('accounts', row); }
export function newState(name: string, classId: number, raceId: number, seed: number, now: number, id: string, gender: 'male' | 'female' = 'male'): Rules { try {
    const s = createGame(name, seed, now, { classId, raceId, gender, characterId: id });
    return rebaseSimulation(s, now);
}
catch (error) {
    throw new DomainError('INVALID_CHARACTER', (error as Error).message, 400);
} }
export async function context(tx: ReadView, character: Character, now: number, withActivity = true): Promise<Rules> {
    const rows = await tx.list<Item>('items', { ownerCharacterId: character.id });
    const s: Rules = { ...clone(character.rules), id: character.id, money: (await tx.get<Wallet>('wallets', character.id))?.balance || 0, bag: [], bags: [], bank: [], equipment: {}, pending: [], auctions: [], party: [], activity: { type: 'idle' }, receipts: [] };
    for (const row of rows.sort((a, b) => a.position - b.position)) {
        if (row.container === 'reservation')
            continue;
        const item: Rules = { ...clone(row.data), uid: row.id };
        if (row.container === 'equipment')
            s.equipment[row.slot!] = item;
        else if (row.container === 'auctions')
            s.auctions.push({ ...item, item: { ...item.item, uid: row.id } });
        else if (Array.isArray(s[row.container]))
            s[row.container].push(item);
    }
    s.professionCooldowns = Object.fromEntries(Object.entries(character.professionReadyAt).map(([key, value]) => [key, s.clock + Math.max(0, value - s.wallAt)]));
    s.resourceCooldowns = Object.fromEntries(Object.entries(character.resourceReadyAt).map(([key, value]) => [key, s.clock + Math.max(0, value - s.wallAt)]));
    if (withActivity) {
        const activities = await tx.list<Activity>('activities', { actorId: character.id });
        const active = activities.find(a => a.status === 'running' || a.status === 'returning');
        if (active) {
            s.activity = clone(active.engineActivity);
            s.rngState = active.rngState;
        }
    }
    await applyGmBuffs(tx,s,character.accountId);
    return s;
}
export async function persistAssets(tx: Transaction, character: {id:string; accountId:string|null; rules:Rules}, s: Rules, key: string,
    recordTable: 'characters' | 'npc_characters' = 'characters') {
    requireThat(s.id === character.id, 'ASSET_OWNER', '资产状态与角色身份不一致');
    const previous = await tx.list<Item>('items', { ownerCharacterId: character.id });
    const previousById = new Map(previous.map(item => [item.id, item]));
    const seen = new Set<string>();
    requireThat(Number.isSafeInteger(s.itemSequence) && s.itemSequence >= 0, 'ITEM_SEQUENCE', '物品序号无效');
    // Asset-only operations also issue items (quest rewards, gifts, transfers).
    // Persist their allocator cursor with the assets so a reload cannot reuse IDs.
    if (s.itemSequence > (character.rules.itemSequence ?? 0)) {
        character.rules.itemSequence = s.itemSequence;
        await tx.put(recordTable, character);
    }
    const entries: {
        container: string;
        slot?: string;
        position: number;
        data: Rules;
    }[] = [];
    for (const container of ['bag', 'bags', 'bank', 'pending', 'auctions', 'raidCollection', 'raidPendingEquipment'])
        for (const [position, data] of (s[container] || []).entries())
            entries.push({ container, position, data });
    for (const [slot, data] of Object.entries(s.equipment || {}))
        entries.push({ container: 'equipment', slot, position: Number(slot), data: data as Rules });
    for (const entry of entries) {
        const data = clone(entry.data);
        const id = entry.container === 'auctions' ? data.item.uid : data.uid;
        requireThat(typeof id === 'string' && id.length > 0 && id.length <= 700, 'ITEM_ID', '物品身份无效');
        const existing = previousById.get(id);
        if (!existing) {
            const other = await tx.get<Item>('items', id);
            if (other)
                throw new DomainError('ASSET_OWNER', '物品不能跨角色写入');
        }
        requireThat(!seen.has(id), 'DUPLICATE_ITEM', '同一物品不能占据两个位置');
        delete data.uid;
        if (entry.container === 'auctions')
            data.item.uid = id;
        seen.add(id);
        const item = entry.container === 'auctions' ? data.item : data, oldItem = existing?.container === 'auctions' ? existing.data.item : existing?.data;
        requireThat(!oldItem || oldItem.id === item.id, 'ITEM_TEMPLATE', '同一物品身份不能替换物品类型');
        const count = item.count;
        requireThat(Number.isSafeInteger(count) && count > 0, 'ITEM_COUNT', '物品数量无效');
        const row = { id, accountId: character.accountId, ownerCharacterId: character.id, ...entry, data, itemId: item.id, count, source: existing?.source || key };
        if (!existing || existing.container !== entry.container || existing.slot !== entry.slot || existing.position !== entry.position || JSON.stringify(existing.data) !== JSON.stringify(data))
            await tx.put('items', row);
        if (!existing || oldItem.count !== count || existing.container !== entry.container || existing.slot !== entry.slot)
            await tx.insert('ledger', { id: `${key}:item:${id}`, businessKey: key, accountId: character.accountId, characterId: character.id, kind: 'item', itemId: item.id, itemInstanceId: id, amount: count - (oldItem?.count || 0), container: entry.container });
    }
    for (const old of previous)
        if (old.container !== 'reservation' && !seen.has(old.id)) {
            await tx.delete('items', old.id);
            const item = old.container === 'auctions' ? old.data.item : old.data;
            await tx.insert('ledger', { id: `${key}:item:${old.id}`, businessKey: key, accountId: character.accountId, characterId: character.id, kind: 'item', itemId: item.id, itemInstanceId: old.id, amount: -item.count, container: old.container });
        }
    requireThat(Number.isSafeInteger(s.money) && s.money >= 0, 'BALANCE', '资金余额无效');
    const wallet = await tx.get<Wallet>('wallets', character.id);
    const delta = s.money - (wallet?.balance || 0);
    if (!wallet || delta) await tx.put('wallets', { id: character.id, characterId: character.id, accountId: character.accountId, balance: s.money });
    if (delta)
        await tx.insert('ledger', { id: `${key}:money:${character.id}`, businessKey: key, accountId: character.accountId, characterId: character.id, amount: delta, balance: s.money });
}
export async function persistCharacter(tx: Transaction, c: Character, s: Rules, now: number, key: string, saveAssets = true) {
    c.rules = characterRules(s);
    c.professionReadyAt = Object.fromEntries(Object.entries(s.professionCooldowns || {}).map(([key, value]) => [key, s.wallAt + Math.max(0, Number(value) - s.clock)]));
    c.resourceReadyAt = Object.fromEntries(Object.entries(s.resourceCooldowns || {}).map(([key, value]) => [key, s.wallAt + Math.max(0, Number(value) - s.clock)]));
    await tx.put('characters', c);
    if (saveAssets)
        await persistAssets(tx, c, s, key);
}
export async function economicEvent(tx: Transaction, key: string, accountId: string, kind: string, payload: Rules = {}) { if (await tx.get('settlements', key))
    return false; await tx.insert('settlements', { id: key, businessKey: key, accountId, kind, ...payload }); await tx.insert('outbox', { id: key, businessKey: key, accountId, type: kind, payload, delivered: false }); return true; }
