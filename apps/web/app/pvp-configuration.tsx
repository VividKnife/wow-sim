"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {MAX_STRATEGY_RULES,MAX_STRATEGY_EXTRA_CONDITIONS} from '../../../packages/sim-core/src/strategy-config.js';
import {StrategySkillPicker} from './strategy-skill-picker';
import {strategyConditionOptions} from './strategy';
import ClassIcon from './class-icon';
import {Icon} from './game-ui';
import type {GameProps} from './game-ui';

const roleNames:Record<string,string>={melee:'近战压制',ranged:'远程输出',healer:'治疗支援'};
const treeNames:Record<string,string>={Fire:'火焰',Frost:'冰霜',Arcane:'奥术'};
function legalTalents(nodes:any[],allocation:Record<string,number>,budget:number){
 if(Object.values(allocation).reduce((s,n)=>s+n,0)>budget)return false;
 return nodes.every(t=>!allocation[t.id]||allocation[t.id]<=t.maxRank&&t.supported&&
  nodes.filter(n=>n.tree===t.tree&&n.row<t.row).reduce((sum,n)=>sum+(allocation[n.id]||0),0)>=t.requiredTreePoints&&
  t.prerequisites.every((p:any)=>(allocation[p.talentId]||0)>=p.requiredRank));
}
export default function PvpConfiguration({data,busy,send}:GameProps){
 const config=data.pvp,[selected,setSelected]=useState('');
 if(!config?.members?.length)return <section className="panel">PvP 配置正在加载。</section>;
 const member=config.members.find((m:any)=>m.id===selected)||config.members[0];
 return <section className="pvp-configuration"><header className="section-heading"><div><span className="eyebrow">竞技场专用 · 自动应用</span><h2>PvP 天赋与技能</h2><p>每名成员独立保存。进入竞技场自动使用此方案，离场后继续使用冒险天赋与策略。</p></div></header>
  <nav className="pvp-member-tabs" aria-label="PvP 配置成员">{config.members.map((m:any)=><button type="button" key={m.id} aria-pressed={m.id===member.id} onClick={()=>setSelected(m.id)}><ClassIcon classId={m.classId} size={25}/><span>{m.name}<small>{m.level} 级 · {m.automatic?'自动推荐':m.profile.name}</small></span></button>)}</nav>
  {config.locked&&<p role="status" className="pvp-notice">本场配置已锁定。战斗结束后可修改下一场方案。</p>}
  <PvpEditor key={`${member.id}:${member.revision}`} member={member} locked={config.locked} busy={busy} send={send}/>
 </section>;
}
function PvpEditor({member,locked,busy,send}:{member:any;locked:boolean;busy:boolean;send:GameProps['send']}){
 const [profile,setProfile]=useState<any>(()=>structuredClone(member.profile)),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false),[treeId,setTreeId]=useState(()=>[...member.trees].sort((a:any,b:any)=>b.talents.reduce((n:number,t:any)=>n+(member.profile.talents[t.id]||0),0)-a.talents.reduce((n:number,t:any)=>n+(member.profile.talents[t.id]||0),0))[0].id);
 const nodes=member.trees.flatMap((tree:any)=>tree.talents.map((t:any)=>({...t,tree:tree.id}))),used=Object.values(profile.talents as Record<string,number>).reduce((sum,n)=>sum+n,0);
 const available=member.skills.filter((skill:any)=>!skill.talentId||profile.talents[skill.talentId]);
 const edit=(patch:any)=>{setProfile((p:any)=>({...p,...patch}));setDirty(true);setSaved(false);};
 const allocation=(id:number,delta:number)=>{const next={...profile.talents,[id]:(profile.talents[id]||0)+delta};if(next[id]<=0)delete next[id];return next;};
 const changeTalent=(id:number,delta:number)=>{const next=allocation(id,delta);edit({talents:next,rules:profile.rules.filter((r:any)=>{const sk=member.skills.find((s:any)=>s.spellId===r.spell);return sk&&(!sk.talentId||next[sk.talentId]);})});};
 const move=(index:number,offset:number)=>{const next=[...profile.rules];[next[index],next[index+offset]]=[next[index+offset],next[index]];edit({rules:next});};
 const changeRule=(index:number,patch:any)=>edit({rules:profile.rules.map((r:any,i:number)=>i===index?{...r,...patch}:r)});
 const save=async()=>{if(await send({type:'pvpConfigure',target:member.id,revision:member.revision,profile})){setDirty(false);setSaved(true);}};
 return <fieldset className="pvp-editor" disabled={locked||busy}>
  <div className="pvp-preset"><span className="eyebrow">60 级 PvP 推荐配置</span>{member.presets.map((preset:any)=><div key={preset.id}><h3>{preset.name}</h3><p>{preset.description}</p><Button variant="outline" onClick={()=>{setProfile(structuredClone(preset.profile));setDirty(true);setSaved(false);}}>载入推荐天赋与技能</Button></div>)}<small>51 点经典天赋模板；未满 60 级按当前等级分配。使用已学常规技能，天赋技能自动匹配当前等级，装备、姿态与资源限制仍生效。</small></div>
  <div className="pvp-save-row"><label>方案名称<input aria-label="PvP 方案名称" maxLength={40} value={profile.name} onChange={e=>edit({name:e.target.value})}/></label><label>竞技职责<GameSelect aria-label="PvP 战斗职责" value={profile.role} disabled={locked||busy} onValueChange={role=>edit({role})}>{Object.entries(roleNames).map(([id,name])=><GameSelectOption key={id} value={id}>{name}</GameSelectOption>)}</GameSelect></label><Button onClick={save} disabled={locked||busy||!profile.name.trim()}>保存 PvP 配置</Button><span role="status">{dirty?'有未保存修改':saved?'已保存':member.automatic?'进入竞技场自动使用推荐配置':'已保存，进入竞技场自动应用'}</span></div>
  <section className="pvp-talents"><div className="section-heading"><h3>PvP 天赋 · {used} / {member.budget} 点</h3><Button variant="outline" onClick={()=>edit({talents:{},rules:profile.rules.filter((r:any)=>!member.skills.find((s:any)=>s.spellId===r.spell)?.talentId)})}>清空 PvP 天赋</Button></div>
   <nav className="pvp-tree-tabs" aria-label="PvP 天赋树">{member.trees.map((tree:any)=><button type="button" key={tree.id} aria-pressed={treeId===tree.id} onClick={()=>setTreeId(tree.id)}>{treeNames[tree.name]||tree.name} · {tree.talents.reduce((sum:number,t:any)=>sum+(profile.talents[t.id]||0),0)}</button>)}</nav>
   <p>加减点需满足层级和前置要求。移除技能天赋时，相关技能规则也会移除；其他已学技能保持不变。</p>
   <div className="pvp-talent-grid">{nodes.filter((t:any)=>t.tree===treeId).map((t:any)=><article key={t.id} style={{gridRow:t.row+1,gridColumn:t.col+1}} className={profile.talents[t.id]?'allocated':''}><Icon src={t.icon} name={t.name} size={32}/><strong>{t.name}</strong><small>{profile.talents[t.id]||0} / {t.maxRank} · 需同系 {t.requiredTreePoints} 点</small><details><summary>天赋效果</summary><p>{t.descriptions[Math.max(0,(profile.talents[t.id]||1)-1)]||'效果取决于所选等级。'}</p>{t.prerequisites.map((p:any)=><small key={p.talentId}>前置：{nodes.find((n:any)=>n.id===p.talentId)?.name} {p.requiredRank} 点</small>)}</details><div><button type="button" aria-label={`减少${t.name}`} disabled={locked||busy||!profile.talents[t.id]||!legalTalents(nodes,allocation(t.id,-1),member.budget)} onClick={()=>changeTalent(t.id,-1)}>−</button><button type="button" aria-label={`增加${t.name}`} disabled={locked||busy||!legalTalents(nodes,allocation(t.id,1),member.budget)} onClick={()=>changeTalent(t.id,1)}>＋</button></div></article>)}</div>
  </section>
  <section className="pvp-skills"><h3>PvP 技能优先级 · {profile.rules.length} / {MAX_STRATEGY_RULES}</h3><p>普通技能按顺序检查；已启用的控制与打断技能由战前指挥协调目标和时机。禁用技能不会被指挥重新启用。</p>
   {profile.rules.map((r:any,i:number)=><div className="pvp-rule" key={i}><label><input type="checkbox" aria-label={`启用第 ${i+1} 条 PvP 技能`} checked={r.enabled} onChange={e=>changeRule(i,{enabled:e.target.checked})}/>{i+1}</label><StrategySkillPicker skills={available} value={r.spell} disabled={locked||busy} onChange={(spell:number)=>changeRule(i,{spell})} label={`第 ${i+1} 条 PvP 技能`}/>
    <GameSelect aria-label={`第 ${i+1} 条 PvP 条件`} disabled={locked||busy} value={r.condition} onValueChange={condition=>changeRule(i,{condition})}>{strategyConditionOptions.map(([id,name])=><GameSelectOption key={id} value={id}>{name}</GameSelectOption>)}</GameSelect><input type="number" min="0" max="100" aria-label={`第 ${i+1} 条 PvP 阈值`} value={r.value} onChange={e=>changeRule(i,{value:Number(e.target.value)})}/><div className="pvp-rule-actions"><button type="button" aria-label={`上移第 ${i+1} 条 PvP 技能`} disabled={locked||busy||i===0} onClick={()=>move(i,-1)}>↑</button><button type="button" aria-label={`下移第 ${i+1} 条 PvP 技能`} disabled={locked||busy||i===profile.rules.length-1} onClick={()=>move(i,1)}>↓</button><button type="button" onClick={()=>edit({rules:profile.rules.filter((_:any,n:number)=>n!==i)})}>移除</button></div>
    <details className="pvp-rule-extra"><summary>并且条件（{r.and?.length||0}）</summary>{(r.and||[]).map((clause:any,n:number)=><div key={n}><GameSelect disabled={locked||busy} aria-label={`第 ${i+1} 条 PvP 附加条件 ${n+1}`} value={clause.condition} onValueChange={condition=>changeRule(i,{and:r.and.map((x:any,j:number)=>j===n?{...x,condition}:x)})}>{strategyConditionOptions.map(([id,name])=><GameSelectOption key={id} value={id}>{name}</GameSelectOption>)}</GameSelect><input type="number" min="0" max="100" aria-label={`第 ${i+1} 条 PvP 附加阈值 ${n+1}`} value={clause.value} onChange={e=>changeRule(i,{and:r.and.map((x:any,j:number)=>j===n?{...x,value:Number(e.target.value)}:x)})}/><button type="button" onClick={()=>changeRule(i,{and:r.and.filter((_:any,j:number)=>j!==n)})}>移除条件</button></div>)}<Button variant="outline" disabled={locked||busy||(r.and?.length||0)>=MAX_STRATEGY_EXTRA_CONDITIONS} onClick={()=>changeRule(i,{and:[...(r.and||[]),{condition:'healthAbove',value:50}]})}>添加并且条件</Button></details>
   </div>)}
   <Button variant="outline" disabled={locked||busy||!available.length||profile.rules.length>=MAX_STRATEGY_RULES} onClick={()=>edit({rules:[...profile.rules,{spell:available[0].spellId,condition:'always',value:0,enabled:true}]})}>添加 PvP 技能</Button>
  </section><div className="pvp-save-bottom"><span>{dirty?'修改尚未保存':''}</span><Button disabled={locked||busy||!profile.name.trim()} onClick={save}>保存 PvP 配置</Button></div>
 </fieldset>;
}
