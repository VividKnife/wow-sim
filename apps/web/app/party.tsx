"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Bar,Icon,Item,GameProps} from './game-ui';
import {RecoveryControls} from './dungeon';
import {classOptions} from './class-options.js';

const classes:Record<number,string>=Object.fromEntries(classOptions.map(option=>[option.id,option.name]));
function Portrait({id}:{id:number}){return <span className="class-portrait party-portrait class-mark" aria-hidden="true">{(classes[id]||'勇').slice(0,1)}</span>;}
function MemberResource({member,stats}:{member:any;stats:any}){if(member.classId===1)return <Bar label="怒气" value={(member.rage||0)/10} max={100} tone="rage"/>;if(member.classId===4)return <Bar label="能量" value={member.energy??100} max={100} tone="energy"/>;return stats.maxMana>0?<Bar label="法力" value={member.mana||0} max={stats.maxMana} tone="mana"/>:null;}

export default function Party({state:s,data:d,busy,send}:GameProps){
 const [recipient,setRecipient]=useState<Record<string,string>>({});
 const equipment=s.bag.filter((i:any)=>d.items[i.id]?.slot>0&&!d.items[i.id]?.bagSlots);
 return <div className="party-layout"><section className="panel"><div className="section-heading"><div><div className="eyebrow">一起冒险</div><h2>冒险小队</h2></div><strong>{s.party.length+1} / 5 人</strong></div>
 <p className="party-note">已招募的队友会一起参加野外与副本战斗，分享击杀经验，也会消耗小队食水。队友保留自己的等级、装备和经验；同账号主角与 NPC 队友可自由交换绑定装备，配发装备除外。</p>
 <div className="party-roster"><article className="party-member"><div className="party-member-heading"><Portrait id={s.classId}/><div><h3>{s.name} <small>Lv.{s.level}</small></h3><p>{d.className||classes[s.classId]} · 队长</p></div></div><Bar label="生命" value={s.hp} max={d.stats.maxHp}/>{d.resource?.max>0&&<Bar label={d.resource.name} value={d.resource.value} max={d.resource.max} tone={d.resource.name==='怒气'?'rage':d.resource.name==='能量'?'energy':'mana'}/>}</article>
 {d.party.map((c:any)=><article className="party-member" key={c.id}><div className="party-member-heading"><Portrait id={c.classId}/><div><h3>{c.name} <small>Lv.{c.level}</small></h3><p>{classes[c.classId]||`职业 ${c.classId}`} · {c.role}</p></div></div><Bar label="生命" value={c.hp} max={c.stats.maxHp}/><MemberResource member={c} stats={c.stats}/>
 <details><summary>技能与装备</summary><div className="companion-skills">{c.learned.map((id:number)=>{const skill=d.combatSkills.find((a:any)=>a.spellId===id);return <Icon key={id} src={skill?.icon} name={skill?.name||'技能'} size={28}/>})}</div>{Object.values(c.equipment).map((i:any)=><Item key={i.uid} item={d.items[i.id]} instance={i}/>)}</details></article>)}
 </div><RecoveryControls state={s} data={d} busy={busy} send={send}/></section>
 <section className="panel"><div className="section-heading"><h2>城镇招募</h2><small>招募不收取费用</small></div><p className="party-note">候选人与队长等级相同，初始装备按队长当前装备水平选择。招募装备不能转卖。</p><div className="recruit-list">{d.candidates.map((c:any)=><article className="recruit-row" key={c.id}><Portrait id={c.classId}/><div className="grow"><h3>{c.name} <small>Lv.{c.level}</small></h3><p>{classes[c.classId]||`职业 ${c.classId}`} · {c.role}</p><small>初始装备物品等级 ≤ {c.gearCap}</small></div><Button variant="outline" disabled={busy||!c.canRecruit||!!s.combat} onClick={()=>send({type:'recruit',id:c.id})}>{c.canRecruit?'招募':'需前往城镇'}</Button></article>)}{!d.candidates.length&&<p>小队已满员。</p>}</div></section>
 {s.party.length>0&&<section className="panel party-allocation"><h2>分配背包装备</h2><p className="party-note">选择实际穿戴者，装备会从背包移动到对应角色，替换下来的战利品装备返回背包。</p>{equipment.length?equipment.map((i:any)=>{const eligible=d.party.filter((c:any)=>c.equippable.includes(i.uid)),target=recipient[i.uid]||eligible[0]?.id;return <div className="allocation-row" key={i.uid}><Item item={d.items[i.id]} instance={i}/><div className="allocation-controls"><select aria-label={`分配 ${d.items[i.id].name} 给队友`} value={target||''} disabled={!eligible.length||busy||!!s.combat} onChange={e=>setRecipient({...recipient,[i.uid]:e.target.value})}>{!eligible.length&&<option value="">没有可装备的队友</option>}{eligible.map((c:any)=><option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}</select><Button variant="outline" disabled={busy||!!s.combat||!eligible.some((c:any)=>c.id===target)} onClick={()=>send({type:'equip',uid:i.uid,target})}>交给队友装备</Button></div></div>}):<p className="party-note">背包中没有可分配的装备。</p>}</section>}
 </div>
}
