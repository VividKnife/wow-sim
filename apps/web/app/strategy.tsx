"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon} from './game-ui';
import {classCombatMeta} from '@/lib/class-combat.js';
import type {PotionOption} from './economy-types';

const conditions=[['always','始终可用'],['targetCasting','敌人正在施法'],['enemyNear','敌人距离不超过（码）'],['healthBelow','自身生命低于（%）'],['manaAbove','自身主要资源不低于（%）'],['manaBelow','自身主要资源低于（%）'],['targetHealthBelow','目标生命低于（%）'],['enemyCountAtLeast','技能范围内可攻击敌人数至少']];
const nonCombat=['Conjure Food','Conjure Water','Frost Armor','Arcane Intellect','Power Word: Fortitude','Resurrection'];
export default function Strategy(props:GameProps){
 const {state:s,data:d}=props;
 const members=d.strategyMembers||[{id:s.id,name:s.name,classId:s.classId,rules:s.rules,policy:{protectCC:true,waitForTank:false},autoBuffs:{enabled:false,armor:true,int:true,sta:true,targets:'party',refreshSeconds:30},skills:d.skills}];
 const [memberId,setMemberId]=useState(s.id),member=members.find((c:any)=>c.id===memberId)||members[0];
 return <><label className="threshold">配置成员 <select aria-label="策略成员" value={member.id} onChange={e=>setMemberId(e.target.value)}>{members.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><MemberStrategy key={member.id} {...props} member={member}/></>;
}
function MemberStrategy({state:s,data:d,busy,send,member}:GameProps&{member:any}){
 const [rules,setRules]=useState<any[]>(member.rules),[policy,setPolicy]=useState(member.policy),[buffs,setBuffs]=useState(member.autoBuffs),[health,setHealth]=useState(s.settings.health),[mana,setMana]=useState(s.settings.mana),[saved,setSaved]=useState(false),[potions,setPotions]=useState(member.potions||{enabled:false,health:35,mana:20,healthItem:0,manaItem:0});
 const skills=member.skills.filter((a:any)=>!nonCombat.includes(a.nameEn));
 const usesMana=![1,4].includes(member.classId),potionKinds=usesMana?(['health','mana'] as const):(['health'] as const);
 const edit=(i:number,key:string,value:any)=>{setSaved(false);setRules(rules.map((r,n)=>n===i?{...r,[key]:value}:r));};
 const move=(i:number,delta:number)=>{const next=[...rules];[next[i],next[i+delta]]=[next[i+delta],next[i]];setRules(next);setSaved(false);};
 const editBuff=(key:string,value:any)=>{setBuffs({...buffs,[key]:value});setSaved(false);};
 return <div className="strategy-layout"><section className="panel">
  <div className="section-heading"><div><div className="eyebrow">{member.name} · 技能决策</div><h2>自动施法优先级</h2></div><Button disabled={busy||!rules.length} onClick={async()=>{setSaved(await send({type:'strategy',target:member.id,rules,policy,autoBuffs:buffs,potions}));}}>{saved?'已提交':'保存成员策略'}</Button></div>
  <p>按顺序检查条件、已学最高等级、距离、资源、姿态和冷却。人数按技能实际范围计算；默认群攻阈值为 3。</p>
  {member.classId===5&&<p>牧师优先救急和治疗，队友受伤时会停止惩击。遭到围攻时会使用已学会的真言术：盾自救；渐隐术能让敌人转向队友时才使用。法力充足时按以下规则输出，真言术：韧由战前增益设置维护。</p>}
  {member.classId===8&&<p>把变形术放在输出技能前，可先控制没有持续伤害的副目标。优先使用法力的敌人，同类目标中优先正在施法者。每位法师保持一个变形目标，再继续输出；控场不受等待坦克选项限制，目标会在变形期间快速回血。</p>}
  <p>{classCombatMeta[member.classId]?.hint}</p>
  {member.classId===1&&<p>坦克优先嘲讽正在攻击队友的敌人。20 级学会顺劈斩后，可按人数排队在下一次武器挥击时攻击最多两名近敌。</p>}
  <div className="rule-list">{rules.map((r:any,i:number)=>{const skill=member.skills.find((a:any)=>a.spellId===r.spell);return <div className="rule-editor" key={i}>
   <div className="rule-number">{i+1}</div><Icon src={skill?.icon} name={skill?.name||'法术'} size={36}/>
   <div className="rule-fields"><label>技能<select aria-label={`第 ${i+1} 条技能`} value={r.spell} onChange={e=>edit(i,'spell',Number(e.target.value))}>{skills.map((a:any)=><option key={a.spellId} value={a.spellId}>{a.name} {a.rank} {a.known?'':'（未学）'}</option>)}</select></label>
    <div className="rule-condition"><select aria-label={`第 ${i+1} 条条件`} value={r.condition} onChange={e=>{const condition=e.target.value;setRules(rules.map((v,n)=>n===i?{...v,condition,value:condition==='enemyCountAtLeast'?3:v.value}:v));setSaved(false);}}>{conditions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    {!['always','targetCasting'].includes(r.condition)&&<input type="number" aria-label={`第 ${i+1} 条阈值`} min={r.condition==='enemyCountAtLeast'?1:0} max={100} step={1} value={r.value} onChange={e=>edit(i,'value',Number(e.target.value))}/>}</div>
   </div><div className="rule-controls"><label><input type="checkbox" checked={r.enabled} onChange={e=>edit(i,'enabled',e.target.checked)}/>启用</label><div><Button variant="ghost" size="sm" aria-label={`上移第 ${i+1} 条`} disabled={i===0} onClick={()=>move(i,-1)}>↑</Button><Button variant="ghost" size="sm" aria-label={`下移第 ${i+1} 条`} disabled={i===rules.length-1} onClick={()=>move(i,1)}>↓</Button><Button variant="ghost" size="sm" aria-label={`删除第 ${i+1} 条`} disabled={rules.length===1} onClick={()=>{setRules(rules.filter((_,n)=>n!==i));setSaved(false);}}>×</Button></div></div>
  </div>;})}</div>
  <Button variant="outline" disabled={rules.length>=12||!skills.length} onClick={()=>{setRules([...rules,{spell:skills[0].spellId,condition:'always',value:0,enabled:true}]);setSaved(false);}}>＋ 添加规则</Button>
  <hr/><label className="threshold"><input type="checkbox" checked={policy.protectCC} onChange={e=>{setPolicy({...policy,protectCC:e.target.checked});setSaved(false);}}/> 避免打破变形等控场</label>
  <label className="threshold"><input type="checkbox" checked={policy.waitForTank} onChange={e=>{setPolicy({...policy,waitForTank:e.target.checked});setSaved(false);}}/> 等待坦克建立仇恨后输出</label><p>等待条件检查目标正在攻击坦克且已有坦克仇恨；不会保证后续永不转火。</p>
 </section><section className="panel"><h2>自动长期增益</h2><p>在已下令的野外拉怪或副本推进前补充增益，消耗真实法力与公共冷却。法力不足时按补给规则恢复。</p>
  <label className="threshold"><input type="checkbox" checked={buffs.enabled} onChange={e=>editBuff('enabled',e.target.checked)}/> 启用 {member.name} 的战前补增益</label>
  {member.classId===8&&<><label className="threshold"><input type="checkbox" checked={buffs.armor} onChange={e=>editBuff('armor',e.target.checked)}/> 霜甲术（自身）</label><label className="threshold"><input type="checkbox" checked={buffs.int} onChange={e=>editBuff('int',e.target.checked)}/> 奥术智慧（法力使用者）</label></>}
  {member.classId===5&&<label className="threshold"><input type="checkbox" checked={buffs.sta} onChange={e=>editBuff('sta',e.target.checked)}/> 真言术：韧</label>}
  {![5,8].includes(member.classId)&&<p>该成员当前没有可自动维护的长期增益。</p>}
  <label className="threshold">增益目标 <select aria-label="增益目标" value={buffs.targets} onChange={e=>editBuff('targets',e.target.value)}><option value="self">仅自身</option><option value="party">参与战斗的小队成员</option></select></label>
  <label className="threshold">剩余 <input aria-label="增益刷新提前秒数" type="number" min={0} max={300} step={1} value={buffs.refreshSeconds} onChange={e=>editBuff('refreshSeconds',Number(e.target.value))}/> 秒时刷新</label><p>以上设置与左侧「保存成员策略」一起保存。已存在更强增益时保留原效果。</p>
  <div className="potion-settings"><hr/><h2>炼金药水策略</h2><p>使用共享背包中的药水。每位成员的生命与法力药水共享 120 秒冷却，优先救急生命；未指定时选择可用的最强药水。</p><label className="threshold"><input type="checkbox" checked={potions.enabled} onChange={e=>{setPotions({...potions,enabled:e.target.checked});setSaved(false);}}/> 启用 {member.name} 的药水策略</label>{potionKinds.map(kind=><div key={kind}><label className="threshold">{kind==='health'?'生命':'法力'}低于 <input aria-label={kind==='health'?'药水生命阈值':'药水法力阈值'} type="number" min={1} max={100} value={potions[kind]} onChange={e=>{setPotions({...potions,[kind]:Number(e.target.value)});setSaved(false);}}/> % 时使用</label><label className="threshold">选择药水 <select aria-label={kind==='health'?'生命药水':'法力药水'} value={potions[kind+'Item']} onChange={e=>{setPotions({...potions,[kind+'Item']:Number(e.target.value)});setSaved(false);}}><option value={0}>自动选择可用的最强药水</option>{(d.potionOptions||[]).filter((p:PotionOption)=>p.kind===kind).map((p:PotionOption)=><option key={p.id} value={p.id}>{p.name} · 恢复 {p.min}—{p.max} · 等级 {p.level}</option>)}</select></label></div>)}<p>与「保存成员策略」一起保存；可在生活职业制造药水，或从拍卖行购买。</p></div><hr/><h2>全队补给阈值</h2><p>低于阈值时坐下吃喝，恢复后再次拉怪。补给用尽时停止，不自动购买。</p>
  <label className="threshold">生命低于 <input aria-label="生命恢复阈值" type="number" min={1} max={100} value={health} onChange={e=>setHealth(Number(e.target.value))}/> %</label>
  {usesMana&&<label className="threshold">法力低于 <input aria-label="法力恢复阈值" type="number" min={1} max={100} value={mana} onChange={e=>setMana(Number(e.target.value))}/> %</label>}
  <Button variant="outline" disabled={busy} onClick={()=>send({type:'settings',health,mana})}>保存补给设置</Button><hr/><h3>离线也遵守同一套规则</h3><p>离线期间不自动接交任务、不替你选择装备。背包满、补给不足或死亡时都会停下。</p>
 </section></div>;
}
