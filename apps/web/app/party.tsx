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
 const [choices,setChoices]=useState<Record<string,string>>({}),[replaceId,setReplaceId]=useState('');
 const [profession1,setProfession1]=useState('herbalism'),[profession2,setProfession2]=useState('alchemy');
 const roleNames:Record<string,string>={tank:'坦克',healer:'治疗',melee:'近战输出',ranged:'远程输出'};
 if(!d.partyUnlocked&&s.growthPolicy!=='companion')return <section className="panel"><h2>队伍系统 · 18级解锁</h2><p>{s.level<18?'达到18级后，将自动领取「同路人」任务。':'已领取「同路人」：前往暴风城贸易区，与旅店老板交谈完成任务。'}</p><p>解锁后可免费招募四名队友，自选职业、职责和两项生活职业。</p></section>;

 const equipment=s.bag.filter((i:any)=>d.items[i.id]?.slot>0&&!d.items[i.id]?.bagSlots);
 return <div className="party-layout"><section className="panel"><div className="section-heading"><div><div className="eyebrow">一起冒险</div><h2>冒险小队</h2></div><strong>{s.party.length+1} / 5 人</strong></div>
 <p className="party-note">已招募的队友会一起参加野外与副本战斗，分享击杀经验，也会消耗小队食水。队友保留自己的等级、装备和经验；同账号主角与 NPC 队友可自由交换绑定装备，配发装备除外。</p>
 <div className="party-roster"><article className="party-member"><div className="party-member-heading"><Portrait id={s.classId}/><div><h3>{s.name} <small>Lv.{s.level}</small></h3><p>{d.className||classes[s.classId]} · 队长</p></div></div><Bar label="生命" value={s.hp} max={d.stats.maxHp}/>{d.resource?.max>0&&<Bar label={d.resource.name} value={d.resource.value} max={d.resource.max} tone={d.resource.name==='怒气'?'rage':d.resource.name==='能量'?'energy':'mana'}/>}</article>
 {d.party.map((c:any)=><article className="party-member" key={c.id}><div className="party-member-heading"><Portrait id={c.classId}/><div><h3>{c.name} <small>Lv.{c.level}</small></h3><p>{classes[c.classId]||`职业 ${c.classId}`} · {c.role}</p></div></div><Bar label="生命" value={c.hp} max={c.stats.maxHp}/><MemberResource member={c} stats={c.stats}/>
 <details><summary>技能与装备</summary><div className="companion-skills">{c.learned.map((id:number)=>{const skill=d.combatSkills.find((a:any)=>a.spellId===id);return <Icon key={id} src={skill?.icon} name={skill?.name||'技能'} size={28}/>})}</div>{Object.values(c.equipment).map((i:any)=><Item key={i.uid} item={d.items[i.id]} instance={i}/>)}</details></article>)}
 </div><RecoveryControls state={s} data={d} busy={busy} send={send}/></section>
 {s.growthPolicy!=='companion'&&<section className="panel"><div className="section-heading"><h2>暴风城旅店 · 招募与更换</h2><small>首次招募免费 · 更换10金币</small></div><p className="party-note">队友与你同级，赠送全套18级任务绿装，自动学习当前等级技能并配置职责天赋与策略。领取后可免费洗点。两项生活职业初始75点，已掌握该阶段配方。更换时继承可穿戴装备，不适用的装备退回主角背包，缺少的部位补发初始绿装。</p><div className="filterbar"><label>招募方式<select aria-label="招募方式" value={replaceId} onChange={e=>setReplaceId(e.target.value)}><option value="">新增队友（免费）</option>{d.party.filter((c:any)=>c.id!==s.id).map((c:any)=><option key={c.id} value={c.id}>更换 {c.name}（10金币）</option>)}</select></label>{[profession1,profession2].map((value,index)=><label key={index}>生活职业 {index+1}<select aria-label={`队友生活职业${index+1}`} value={value} onChange={e=>(index===0?setProfession1:setProfession2)(e.target.value)}>{d.professions.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>)}</div><div className="recruit-list">{d.candidates.map((c:any)=><article className="recruit-row" key={c.id}><Portrait id={c.classId}/><div className="grow"><h3>{c.name} <small>Lv.{c.level}</small></h3><p>{classes[c.classId]}</p><select aria-label={`${classes[c.classId]}职责`} value={choices[c.id]||c.roles[0]} onChange={e=>setChoices({...choices,[c.id]:e.target.value})}>{c.roles.map((role:string)=><option key={role} value={role}>{roleNames[role]}</option>)}</select></div><Button variant="outline" disabled={busy||!c.canRecruit||!!s.combat||profession1===profession2||(!replaceId&&s.party.length>=4)||(!!replaceId&&s.money<100000)} onClick={()=>send({type:'recruit',id:c.id,role:choices[c.id]||c.roles[0],professions:[profession1,profession2],...(replaceId?{replaceId}:{})})}>{!c.canRecruit?'需前往暴风城':replaceId?'更换 · 10金币':'免费招募'}</Button></article>)}</div></section>}

 {s.party.length>0&&<section className="panel party-allocation"><h2>分配背包装备</h2><p className="party-note">选择实际穿戴者，装备会从背包移动到对应角色，替换下来的战利品装备返回背包。</p>{equipment.length?equipment.map((i:any)=>{const eligible=d.party.filter((c:any)=>c.equippable.includes(i.uid)),target=recipient[i.uid]||eligible[0]?.id;return <div className="allocation-row" key={i.uid}><Item item={d.items[i.id]} instance={i}/><div className="allocation-controls"><select aria-label={`分配 ${d.items[i.id].name} 给队友`} value={target||''} disabled={!eligible.length||busy||!!s.combat} onChange={e=>setRecipient({...recipient,[i.uid]:e.target.value})}>{!eligible.length&&<option value="">没有可装备的队友</option>}{eligible.map((c:any)=><option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}</select><Button variant="outline" disabled={busy||!!s.combat||!eligible.some((c:any)=>c.id===target)} onClick={()=>send({type:'equip',uid:i.uid,target})}>交给队友装备</Button></div></div>}):<p className="party-note">背包中没有可分配的装备。</p>}</section>}
 </div>
}
