/** Isolated design sandbox. Capability checks are not combat or victory predictions. */
export type RaidRole = 'tank' | 'healer' | 'melee' | 'ranged';
export type RaidOrder = 'boss' | 'adds' | 'dispel' | 'recovery';
export type SquadTemplateId = 'core' | 'sentinels' | 'triage' | 'assault' | 'bulwark' | 'restoration' | 'purification' | 'vanguard' | 'marksmen' | 'arcanists' | 'skirmish';
export type RaidSize = 25 | 40;
export interface RaidMember { id: string; level: number; role: RaidRole; dispel: boolean }
export interface RaidSquad {
  id: string;
  name: string;
  controller: { kind: 'account'; accountId: string } | { kind: 'npc' };
  templateId: SquadTemplateId;
  order: RaidOrder;
  members: RaidMember[];
}
export interface RaidPlan { size: RaidSize; commanderAccountId: string; squads: RaidSquad[] }
export interface ReadinessCheck { id: string; label: string; actual: number; required: number; met: boolean; advice: string }

const template = (name: string, roles: RaidRole[], dispellers: number[]) => ({ name, roles, dispellers });
// Prototype loadouts, not real characters, class spells or Classic balance data.
export const squadTemplates: Record<SquadTemplateId, ReturnType<typeof template>> = {
  core: template('核心小队', ['tank', 'healer', 'melee', 'ranged', 'ranged'], [1]),
  sentinels: template('护卫支援队', ['tank', 'healer', 'melee', 'ranged', 'ranged'], [1]),
  triage: template('战地医护队', ['healer', 'healer', 'healer', 'ranged', 'ranged'], [0, 1]),
  assault: template('进攻配置 · 一疗四输出', ['healer', 'melee', 'melee', 'ranged', 'ranged'], [0, 3]),
  bulwark: template('磐石卫队', ['tank', 'tank', 'healer', 'melee', 'melee'], []),
  restoration: template('晨光医护队', ['healer', 'healer', 'healer', 'healer', 'ranged'], [0, 1]),
  purification: template('净化法师团', ['healer', 'healer', 'ranged', 'ranged', 'ranged'], [2, 3, 4]),
  vanguard: template('锋刃突击队', ['melee', 'melee', 'melee', 'melee', 'ranged'], []),
  marksmen: template('鹰眼游侠队', ['melee', 'ranged', 'ranged', 'ranged', 'ranged'], []),
  arcanists: template('秘法研究团', ['ranged', 'ranged', 'ranged', 'ranged', 'ranged'], [0, 1]),
  skirmish: template('灰烬支援队', ['melee', 'melee', 'ranged', 'ranged', 'ranged'], [2]),
};
export const raidOrderNames: Record<RaidOrder, string> = {
  boss: '压制首领', adds: '拦截增援', dispel: '优先驱散', recovery: '团队恢复',
};
export const raidRoleNames: Record<RaidRole, string> = { tank: '坦', healer: '疗', melee: '近', ranged: '远' };
export const rehearsalEncounters = [
  { id: 'gate', name: '守门战', subtitle: '双目标 · 诅咒压力', description: '主力牵制首领，副坦拦截护卫，法师组优先驱散。', tanks: 2, addTanks: 1 },
  { id: 'pack', name: '兽群战', subtitle: '三坦特例 · 治疗分工', description: '首领加两路增援需要三名坦克。临时让输出切副坦，同时减少一名治疗以保持输出席位。', tanks: 3, addTanks: 2 },
  { id: 'lava', name: '熔岩战', subtitle: '远程覆盖 · 驱散压力', description: '调整近远程比例，并给驱散和团队恢复留出执行人手。', tanks: 2, addTanks: 1 },
] as const;
export type RehearsalId = typeof rehearsalEncounters[number]['id'];

export function makePreviewSquad(id: string, templateId: SquadTemplateId, controller: RaidSquad['controller'], order: RaidOrder): RaidSquad {
  if (!Object.hasOwn(squadTemplates, templateId)) throw new Error('未知的小队模板。');
  const spec = squadTemplates[templateId];
  return { id, name: spec.name, controller: structuredClone(controller), templateId, order,
    members: spec.roles.map((role, i) => ({ id: `${id}:member:${i + 1}`, level: 60, role, dispel: spec.dispellers.includes(i) })) };
}

/** Human count is illustrative: this does not create accounts or network sessions. */
export function createPreviewRaid(humanCount = 1, size: RaidSize = 25): RaidPlan {
  if (size !== 25 && size !== 40) throw new Error('预演规模必须为25或40人。');
  const squadCount = size / 5;
  if (!Number.isInteger(humanCount) || humanCount < 1 || humanCount > squadCount) throw new Error(`真人小队数必须为1至${squadCount}。`);
  const templates: SquadTemplateId[] = size === 25 ? ['core', 'sentinels', 'triage', 'arcanists', 'vanguard'] : ['core', 'bulwark', 'restoration', 'purification', 'vanguard', 'marksmen', 'arcanists', 'skirmish'];
  const orders: RaidOrder[] = ['boss', 'adds', 'recovery', 'dispel', 'boss', 'boss', 'boss', 'boss'];
  return { size, commanderAccountId: 'preview-account-1', squads: templates.map((id, i) => {
    const human = i === 0 || i > squadCount - humanCount;
    const squad = makePreviewSquad(`squad-${i + 1}`, human ? 'core' : id,
      human ? { kind: 'account', accountId: `preview-account-${i + 1}` } : { kind: 'npc' }, orders[i]);
    if (human) squad.name = i === 0 ? '我的核心小队' : `好友核心小队 ${i + 1}`;
    return squad;
  }) };
}

export function createCooperativePreviewRaid(): RaidPlan {
  const plan = createPreviewRaid(5, 25);
  plan.squads = plan.squads.map((squad, index) => ({
    ...makePreviewSquad(squad.id, index < 2 ? 'core' : 'assault', squad.controller,
      (['boss', 'adds', 'recovery', 'dispel', 'recovery'] as RaidOrder[])[index]), name: squad.name,
  }));
  return plan;
}

export function validateRaidPlan(plan: RaidPlan): string[] {
  const errors: string[] = [], squadIds = new Set<string>(), memberIds = new Set<string>(), accounts = new Set<string>();
  if (plan.size !== 25 && plan.size !== 40) errors.push('预演规模必须为25或40人。');
  if (plan.squads.length !== plan.size / 5) errors.push(`团队必须由${plan.size / 5}支小队组成。`);
  for (const squad of plan.squads) {
    if (!squad.id || squadIds.has(squad.id)) errors.push('小队标识不能为空或重复。');
    squadIds.add(squad.id);
    if (!Object.hasOwn(squadTemplates, squad.templateId)) errors.push('未知的小队模板。');
    if (!Object.hasOwn(raidOrderNames, squad.order)) errors.push('未知的战术任务。');
    if (squad.controller.kind === 'account') {
      if (!squad.controller.accountId || accounts.has(squad.controller.accountId)) errors.push('一个账号只能派出一支核心小队。');
      accounts.add(squad.controller.accountId);
    } else if (squad.controller.kind !== 'npc') errors.push('未知的小队控制方。');
    if (squad.members.length !== 5) errors.push(`${squad.name}需要5名成员。`);
    for (const member of squad.members) {
      if (!member.id || memberIds.has(member.id)) errors.push('角色不可重复占用团队席位。');
      memberIds.add(member.id);
      if (!Number.isInteger(member.level) || member.level !== 60) errors.push('本预演要求所有成员为60级。');
      if (!Object.hasOwn(raidRoleNames, member.role) || typeof member.dispel !== 'boolean') errors.push('成员职责或驱散能力无效。');
    }
  }
  if (!accounts.has(plan.commanderAccountId)) errors.push('团长必须有核心小队在团内。');
  return [...new Set(errors)];
}

export function inspectRaidPlan(plan: RaidPlan, encounterId: RehearsalId) {
  const encounter = rehearsalEncounters.find(row => row.id === encounterId);
  if (!encounter) throw new Error('未知的预演遭遇。');
  const errors = validateRaidPlan(plan);
  if (errors.length) throw new Error(errors.join(' '));
  const members = plan.squads.flatMap(squad => squad.members);
  const assigned = (order: RaidOrder) => plan.squads.filter(squad => squad.order === order).flatMap(squad => squad.members);
  const count = (rows: RaidMember[], role: RaidRole) => rows.filter(member => member.role === role).length;
  const roles = { tank: count(members, 'tank'), healer: count(members, 'healer'), melee: count(members, 'melee'), ranged: count(members, 'ranged') };
  const compact = plan.size === 25;
  const requirements = {
    healers: compact ? encounterId === 'pack' ? 4 : 5 : 8,
    damage: compact ? 18 : 20,
    dispellers: encounterId === 'pack' ? 0 : compact ? 2 : encounterId === 'lava' ? 3 : 2,
    recovery: compact ? 2 : 4,
    ranged: encounterId === 'lava' ? compact ? 10 : 18 : 0,
  };
  const checks: ReadinessCheck[] = [];
  const check = (id: string, label: string, actual: number, required: number, advice: string) => {
    if (required > 0) checks.push({ id, label, actual, required, met: actual >= required, advice });
  };
  check('tanks', '坦克人数', roles.tank, encounter.tanks, '补充坦克职责；核心队不要求固定一坦一奶。');
  check('healers', '治疗人数', roles.healer, requirements.healers, '将一支输出队替换为医护队，或让核心队切换治疗配置。');
  check('damage', '输出人数', roles.melee + roles.ranged, requirements.damage, '减少多余坦克与治疗，给输出留出席位。');
  check('bossTank', '首领承伤分工', count(assigned('boss'), 'tank'), 1, '至少给一支包含坦克的小队安排「压制首领」。');
  check('addTanks', '增援承伤分工', count(assigned('adds'), 'tank'), encounter.addTanks, '给含有足够坦克的小队安排「拦截增援」。');
  check('dispellers', '优先驱散人手', assigned('dispel').filter(member => member.dispel).length, requirements.dispellers, '让净化法师团等具备驱散能力的小队承担「优先驱散」。');
  check('recovery', '团队恢复人手', count(assigned('recovery'), 'healer'), requirements.recovery, '给医护队安排「团队恢复」，避免所有治疗都只照顾前排。');
  check('ranged', '远程覆盖', roles.ranged, requirements.ranged, '换入秘法研究团或鹰眼游侠队。');
  const warnings = roles.tank > (compact ? 3 : 5) ? ['坦克偏多：五人副本配置直接拼团会挤占输出，请给部分坦克切换团本输出配置。'] : [];
  return { encounter, roles, humanCount: plan.squads.filter(squad => squad.controller.kind === 'account').length,
    npcCount: plan.squads.filter(squad => squad.controller.kind === 'npc').length, members: members.length,
    checks, warnings, ready: checks.every(row => row.met) };
}
