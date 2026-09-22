"use client";
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import ClassIcon from './class-icon';
import AdventureHall from './adventure-hall';
import PartyProfessions from './party-professions';
import {useState} from 'react';
import {Shield,Heart,Swords,Plus,ArrowRightLeft,UsersRound,Sparkles,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Bar,Icon,Item,GameProps} from './game-ui';
import {RecoveryControls} from './dungeon';
import AmmoControls from './ammo-controls';
import {classOptions} from './class-options.js';
import {partyRecommendation,partyRoleLabels,partyRoleTarget,groupRole} from '../lib/party-recommendation.js';
import styles from './party.module.css';

const classes:Record<number,string>=Object.fromEntries(classOptions.map(option=>[option.id,option.name]));
const roleNames:Record<string,string>={tank:'坦克',healer:'治疗',melee:'近战输出',ranged:'远程输出'};
const roleKeys=['tank','healer','dps'] as const;
function RoleIcon({role}:{role:string}){const Mark=role==='tank'?Shield:role==='healer'?Heart:Swords;return <Mark size={17} aria-hidden="true"/>;}
function Portrait({id}:{id:number}){return <span className={styles.portrait} data-class={id} aria-hidden="true"><ClassIcon classId={id}/></span>;}
function MemberResource({member,stats}:{member:any;stats:any}){if(member.classId===1)return <Bar label="怒气" value={(member.rage||0)/10} max={100} tone="rage"/>;if(member.classId===4)return <Bar label="能量" value={member.energy??100} max={100} tone="energy"/>;return stats.maxMana>0?<Bar label="法力" value={member.mana||0} max={stats.maxMana} tone="mana"/>:null;}

export default function Party(props:GameProps){
 const [mode,setMode]=useState('hall');
 return <div><nav className="party-mode-tabs" aria-label="队伍玩法"><button type="button" aria-pressed={mode==='hall'} onClick={()=>setMode('hall')}>副本组队 · 冒险者大厅</button><button type="button" aria-pressed={mode==='owned'} onClick={()=>setMode('owned')}>自有队友 · 培养与招募</button></nav>{mode==='hall'?<AdventureHall {...props}/>:<OwnedParty {...props}/>}</div>;
}
function OwnedParty({state:s,data:d,busy,send}:GameProps){
 const [recipient,setRecipient]=useState<Record<string,string>>({});
 const [choices,setChoices]=useState<Record<string,string>>({}),[replaceId,setReplaceId]=useState('');
 const [filter,setFilter]=useState('all');
 const [profession1,setProfession1]=useState('herbalism'),[profession2,setProfession2]=useState('alchemy');
 const replacement=d.party.find((c:any)=>c.id===replaceId&&c.growthPolicy==='companion');
 const replacing=replacement?.id||'';
 const plan=partyRecommendation(s,d,replacing);
 const ammoById=new Map<string,any>((d.ammo||[]).map((row:any)=>[row.id,row]));
 const equipment=s.bag.filter((i:any)=>d.items[i.id]?.slot>0&&!d.items[i.id]?.bagSlots);
 const canManage=s.growthPolicy!=='companion';
 const blocked=s.combat?'战斗结束后可招募':s.dungeon?'离开副本后可招募':!['idle','hunt'].includes(s.activity.type)?'结束当前活动后可招募':!replacing&&s.party.length>=4?'队伍已满，请选择更换队友':replacing&&s.money<100000?'更换需要10金币':profession1===profession2?'请选择两个不同的生活职业':'';
 const shown=plan.candidates.filter((c:any)=>filter==='all'||c.roles.some((role:string)=>groupRole(role)===filter));
 const chooseRole=(c:any)=>choices[c.id]||(filter!=='all'?c.roles.find((role:string)=>groupRole(role)===filter):null)||c.preferredRole;
 if(!d.partyUnlocked&&canManage)return <section className="panel"><h2>队友系统 · 18级解锁</h2><p>达到18级后自动开通，可随时招募或更换队友。</p></section>;
 return <div className={styles.page}>
  <section className={styles.overview} aria-label="阵容推荐">
   <div className={styles.heading}><div><span className={styles.eyebrow}>集结你的冒险小队</span><h2>可靠的伙伴，从合适的阵容开始</h2><p>经典五人阵容 · 1 坦克 / 1 治疗 / 3 输出</p></div><span className={styles.size}><UsersRound size={18}/>{s.party.length+1}<small>/ 5</small></span></div>
   <div className={styles.recommendation}><div className={styles.playerRole} data-role={plan.playerRole}><RoleIcon role={plan.playerRole}/><div><small>{plan.basis}</small><strong>你担任{partyRoleLabels[plan.playerRole]}</strong></div></div><div className={styles.suggestion}><span>推荐搭配的四名队友</span><strong>{roleKeys.filter(role=>plan.companionTarget[role]>0).map(role=>`${plan.companionTarget[role]} ${partyRoleLabels[role]}`).join(' / ')}</strong><small>按当前天赋与策略职责推荐，仍可自由选择职业。</small></div></div>
   <div className={styles.balance}>{roleKeys.map(role=><button type="button" key={role} className={styles.roleMeter} data-role={role} aria-pressed={filter===role} onClick={()=>{setFilter(filter===role?'all':role);setChoices({});}}><RoleIcon role={role}/><span>{partyRoleLabels[role]}<small>{plan.missing[role]>0?`还缺 ${plan.missing[role]} 位`:plan.counts[role]>partyRoleTarget[role]?'人数偏多':'已就位'}</small></span><b>{plan.counts[role]}<small> / {partyRoleTarget[role]}</small></b></button>)}</div>
   <p className={styles.hint} role="status">{replacing?`正在为 ${replacement.name} 寻找接替者，阵容缺口已按移除该队友计算。`:plan.balanced?'阵容齐备，可以出发了。':s.party.length>=4?'队伍已满，但职责尚未均衡。可选择一位队友进行更换。':'优先补齐坦克和治疗，再补足输出；点击职责可筛选候选人。'}</p>
  </section>
  <section className={styles.rosterSection} aria-label="当前队伍"><div className={styles.sectionHeading}><h2>同行伙伴</h2><span>同赴野外与地下城</span></div><div className={styles.roster}>
   {[{...s,stats:d.stats},...d.party.filter((c:any)=>c.id!==s.id)].map((c:any)=>{const leader=c.id===s.id,role=plan.roleOf(c);return <article key={c.id} className={styles.member} data-selected={c.id===replacing}>
    <div className={styles.memberTop}><Portrait id={c.classId}/><span className={styles.memberLevel}>Lv.{c.level}</span></div><h3>{c.name}</h3><p>{classes[c.classId]} <span>· {leader?'你':roleNames[c.strategyPolicy?.role]||c.role}</span></p><span className={styles.roleBadge} data-role={role}><RoleIcon role={role}/>{partyRoleLabels[role]}{leader?' · 队长':''}</span>
    <Bar label="生命" value={c.hp} max={c.stats.maxHp}/><MemberResource member={c} stats={c.stats}/>{ammoById.get(c.id)&&<small>弹药 {ammoById.get(c.id).count}</small>}
    {!leader&&<><details className={styles.memberDetails}><summary>技能与装备</summary><div className="companion-skills">{c.learned.map((id:number)=>{const skill=d.combatSkills.find((a:any)=>a.spellId===id);return <Icon key={id} src={skill?.icon} name={skill?.name||'技能'} size={28}/>;})}</div>{Object.values(c.equipment).map((i:any)=><Item key={i.uid} item={d.items[i.id]} instance={i}/>)}</details>{canManage&&c.growthPolicy==='companion'&&<button type="button" className={styles.replaceButton} aria-pressed={replacing===c.id} onClick={()=>{setReplaceId(replacing===c.id?'':c.id);setChoices({});}}><ArrowRightLeft size={13}/>{replacing===c.id?'取消更换':'更换队友'}</button>}</>}
   </article>;})}
   {Array.from({length:Math.max(0,4-s.party.length)},(_,index)=><div key={index} className={styles.emptySeat}><Plus size={24}/><strong>等待新伙伴</strong><small>在下方选择职业与职责</small></div>)}
  </div></section>
  {canManage&&<section className={styles.recruitSection} aria-label="招募与更换"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>寻找下一位同行者</span><h2>{replacing?`接替 ${replacement.name}`:'招募伙伴'}</h2></div><span>{replacing?'更换 · 10金币':'新增队友 · 免费'}</span></div>
   <div className={styles.toolbar}><div className={styles.filters} aria-label="筛选队友职责">{['all',...roleKeys].map(role=><button key={role} type="button" aria-pressed={filter===role} onClick={()=>{setFilter(role);setChoices({});}}>{role==='all'?'全部职业':<><RoleIcon role={role}/>{partyRoleLabels[role]}</>}</button>)}</div><label className={styles.mode}>招募方式<GameSelect aria-label="招募方式" value={replacing} onValueChange={nextValue=>{setReplaceId(nextValue);setChoices({});}}><GameSelectOption value="">新增队友（免费）</GameSelectOption>{d.party.filter((c:any)=>c.id!==s.id&&c.growthPolicy==='companion').map((c:any)=><GameSelectOption key={c.id} value={c.id}>更换 {c.name}（10金币）</GameSelectOption>)}</GameSelect></label></div>
   <details className={styles.options}><summary>入队配置 <span>同等级 · 绿装 · 职责天赋 · 双生活职业</span></summary><p>自动学习当前等级技能并配置职责天赋与策略，可免费洗点。更换时继承可穿戴装备，其余退回主角背包，空缺部位补发装备。</p><PartyProfessions professions={d.professions} values={[profession1,profession2]} disabled={busy} onChange={(index,value)=>(index===0?setProfession1:setProfession2)(value)}/></details>
   {blocked&&<p className={styles.blocked} role="status">{blocked}</p>}
   <div className={styles.candidates}>{shown.map((c:any)=>{const role=chooseRole(c),recommended=c.recommendedRoles.includes(role);return <article key={c.id} className={styles.candidate} data-recommended={recommended}>
    <div className={styles.candidateHeading}><Portrait id={c.classId}/><div><h3>{classes[c.classId]}</h3><p>{c.name} · Lv.{c.level}</p></div>{recommended&&<span className={styles.recommended}><Sparkles size={12}/>补足{partyRoleLabels[groupRole(role)]}</span>}</div>
    <div className={styles.roleChoices} aria-label={`${classes[c.classId]}职责`}>{c.roles.map((choice:string)=><button type="button" key={choice} aria-pressed={role===choice} onClick={()=>setChoices({...choices,[c.id]:choice})}><RoleIcon role={groupRole(choice)}/>{roleNames[choice]}</button>)}</div>
    <div className={styles.candidateFooter}><span>{recommended?<><Check size={13}/>契合当前阵容</>:'可自由搭配'}</span><Button variant={recommended?'default':'outline'} disabled={busy||!c.canRecruit||!!blocked} onClick={async()=>{if(await send({type:'recruit',id:c.id,role,professions:[profession1,profession2],...(replacing?{replaceId:replacing}:{})})){setReplaceId('');setChoices({});setFilter('all');}}}>{replacing?'确认更换':'招募'}{!replacing&&<Plus size={14}/>}</Button></div>
   </article>;})}</div>
  </section>}
  <details className={styles.utilities}><summary>小队补给与装备 <span>休整、弹药与战利品分配</span></summary><RecoveryControls state={s} data={d} busy={busy} send={send}/><AmmoControls state={s} data={d} busy={busy} send={send}/>

  </details>
 </div>;
}
