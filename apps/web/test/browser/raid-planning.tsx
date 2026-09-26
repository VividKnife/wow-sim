import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createCooperativePreviewRaid, createPreviewRaid, inspectRaidPlan, makePreviewSquad, raidOrderNames, raidRoleNames, rehearsalEncounters, squadTemplates} from '../../../../packages/game-domain/src/raid-planning.ts';
import type {RaidOrder, RaidSize, RehearsalId, SquadTemplateId} from '../../../../packages/game-domain/src/raid-planning.ts';
import './raid-planning.css';

function RaidPlanning() {
  const [plan, setPlan] = useState(() => createPreviewRaid());
  const [encounterId, setEncounter] = useState<RehearsalId>('gate');
  const [report, setReport] = useState(false);
  const analysis = inspectRaidPlan(plan, encounterId);
  const changeSquad = (index: number, templateId: SquadTemplateId) => {
    setPlan(current => ({...current, squads: current.squads.map((squad, i) => {
      if (i !== index) return squad;
      const next = makePreviewSquad(squad.id, templateId, squad.controller, squad.order);
      if (squad.controller.kind === 'account') next.name = squad.name;
      return next;
    })}));
    setReport(false);
  };
  const changeOrder = (index: number, order: RaidOrder) => {
    setPlan(current => ({...current, squads: current.squads.map((squad, i) => i === index ? {...squad, order} : squad)}));
    setReport(false);
  };
  return <main>
    <header><div className="eyebrow">WOW SIM / LEVEL 60 DESIGN LAB</div><h1>NPC作战桌</h1><p className="lede">五位老朋友，一支远征团。你来决定这场战斗怎样打。</p>
      <p className="sandbox-note">独立设计原型 · 示例阵容 · 不读取存档、不发放奖励。好友席位仅用于方案预览。</p>
    </header>
    <section className="briefing" aria-label="团本准备">
      <div><span className="eyebrow">熔火远征 / {plan.size}人编队</span><h2>让战术成为门槛，让人数不再是门槛。</h2><p>保留五人核心队的深度养成，NPC队按整队管理。好友加入时替换一支NPC队。</p><div className="size-controls"><label>团队规模<GameSelect aria-label="团队规模" value={plan.size} onValueChange={nextValue=> {setPlan(createPreviewRaid(1, Number(nextValue) as RaidSize)); setReport(false);}}><GameSelectOption value="25">25人 · 首版推荐</GameSelectOption><GameSelectOption value="40">40人 · 对照方案</GameSelectOption></GameSelect></label><button onClick={() => {setPlan(createCooperativePreviewRaid()); setEncounter('gate'); setReport(false);}}>载入五人合作分工示例</button></div></div>
      <label className="human-control">模拟真人小队数 <strong>{analysis.humanCount} <small>/ {plan.size / 5}</small></strong><input aria-label="模拟真人小队数" type="range" min="1" max={plan.size / 5} value={analysis.humanCount} onChange={e => {setPlan(createPreviewRaid(Number(e.target.value), plan.size)); setReport(false);}}/><span>1名真人 = 主角＋4名队友<br/>改变人数会重建示例阵容</span></label>
    </section>
    <div className="roster-summary"><span><b>{analysis.members}</b> / {plan.size} 席位</span><span><b>{analysis.humanCount}</b> 核心小队</span><span><b>{analysis.npcCount}</b> NPC小队</span><span className="role-summary">{Object.entries(analysis.roles).map(([role, count]) => <span key={role} className={`role-${role}`}>{raidRoleNames[role as keyof typeof raidRoleNames]} {count}</span>)}</span></div>
    <div className="workbench"><section aria-labelledby="roster-heading"><div className="section-heading"><h2 id="roster-heading">团队编成</h2><span>{plan.size / 5}队 × 5人</span></div>
      <div className="squads">{plan.squads.map((squad, index) => <article className={`squad ${squad.controller.kind === 'account' ? 'core' : ''}`} key={squad.id}>
        <div className="squad-title"><span className="squad-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{squad.name}</h3><small>{squad.controller.kind === 'account' ? '核心队 · 逐人配装与天赋' : 'NPC队 · 整队训练与补给'}</small></div></div>
        <div className="members" aria-label={`${squad.name}职责`}>{squad.members.map(member => <span key={member.id} className={`member role-${member.role}`} title={`${raidRoleNames[member.role]}${member.dispel ? ' · 具备驱散能力' : ''}`}>{raidRoleNames[member.role]}<small>{member.dispel ? '净' : '60'}</small></span>)}</div>
        <label>{squad.controller.kind === 'account' ? '示例团本配置' : '招募编队'}<GameSelect aria-label={`第${index + 1}队配置`} value={squad.templateId} onValueChange={nextValue=> changeSquad(index, nextValue as SquadTemplateId)}>{Object.entries(squadTemplates).map(([id, spec]) => <GameSelectOption key={id} value={id}>{spec.name}</GameSelectOption>)}</GameSelect></label>
        <label>首要任务<GameSelect aria-label={`第${index + 1}队任务`} value={squad.order} onValueChange={nextValue=> changeOrder(index, nextValue as RaidOrder)}>{Object.entries(raidOrderNames).map(([id, name]) => <GameSelectOption key={id} value={id}>{name}</GameSelectOption>)}</GameSelect></label>
      </article>)}</div>
      <p className="footnote">核心队配置切换仅演示职责变化；正式游戏按实际职业、天赋和装备验证。全团共享一个战场，跨队治疗与支援；首要任务不禁止其他职责执行。</p>
    </section>
    <aside><section className="encounter"><span className="eyebrow">战术沙盘 / 本作机制示例</span><h2>战前推演</h2><label>选择遭遇<GameSelect aria-label="选择遭遇" value={encounterId} onValueChange={nextValue=> {setEncounter(nextValue as RehearsalId); setReport(false);}}>{rehearsalEncounters.map(row => <GameSelectOption key={row.id} value={row.id}>{row.name} · {row.subtitle}</GameSelectOption>)}</GameSelect></label><p>{analysis.encounter.description}</p>
      <div className="arena" aria-label="抽象战场示意"><span className="enemy adds">增援</span><span className="enemy boss">首领</span><div className="formation">{plan.squads.map((squad, i) => <span key={squad.id} title={raidOrderNames[squad.order]} className={`order-${squad.order}`}>{i + 1}</span>)}</div><small>编号对应小队，颜色对应首要任务</small></div>
      <div className="legend">{Object.entries(raidOrderNames).map(([id, name]) => <span className={`order-${id}`} key={id}>{name}</span>)}</div>
      <button className="rehearse" onClick={() => setReport(true)}>检查战术覆盖</button><p className="footnote">检查人数与职责分工，不模拟伤害、走位、施法或胜率。</p>
    </section>
    <section className="report" aria-live="polite"><h2>{report ? analysis.ready ? '分工已覆盖，可以进入实战验证' : '有未覆盖的机制' : '开战前，先分好工'}</h2>
      {report ? <><ul>{analysis.checks.map(check => <li key={check.id} className={check.met ? 'met' : 'missing'}><div><span>{check.met ? '✓' : '!'} {check.label}</span><b>{check.actual} / {check.required}</b></div>{!check.met && <p>{check.advice}</p>}</li>)}</ul>{analysis.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>)}<p className="footnote">达标不等于能击杀：装备、法力、技能时序和执行能力还需要真实战斗验证。</p></> : <p>把坦克放在正确目标上，给驱散留人，安排团队治疗。数值够用，也可能因为分工错误而失败。</p>}
    </section></aside></div>
    <footer><strong>25人基线：2坦克＋5治疗＋18输出。特殊首领按机制调整。</strong><span>正式路线：单人首领闭环 → NPC养成 → 2–5人自愿合作。40人保留为规模对照。</span></footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<RaidPlanning/>);
