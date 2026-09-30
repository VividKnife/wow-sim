import {Tooltip} from 'radix-ui';
import {SpellTooltipContent} from './classic-action-tooltip';
import {TrainerNavigation} from './trainer-navigation';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import ClassIcon from './class-icon';
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameProps,Icon,money} from './game-ui';
import ClassCompanion from './class-companion';
import CharacterEquipment from './character-equipment';
import AmmoControls from './ammo-controls';
import Professions from './professions';
import Mounts from './mounts';
import Strategy from './strategy';
import {Bank,Auction} from './storage-market';
import {spellbookSkills} from '@/lib/spell-ranks.js';
import {spellbookSkillLines} from './spellbook-skill-lines';
import './character.css';
import TalentTree from './talent-tree';

function SpellDetails({details}: {details?: {facts:string[];effects:string[];restrictions:string[]}}){
 if(!details)return null;
 return <div className="spell-details">
  <div className="spell-facts">{details.facts.map(text=><span key={text}>{text}</span>)}</div>
  {details.effects.length>0&&<ul className="spell-effects" aria-label="技能效果">{details.effects.map(text=><li key={text}>{text}</li>)}</ul>}
  {details.restrictions.length>0&&<div className="spell-restrictions"><b>使用限制</b><ul>{details.restrictions.map(text=><li key={text}>{text}</li>)}</ul></div>}
 </div>;
}

const spellRank=(rank:any)=>String(rank||'').replace(/^Rank\s*/,'等级 ').replace('Racial Passive','种族被动').replace('Passive','被动').replace('Racial','种族技能');

function Spellbook({state:s,data:d,busy,send}:GameProps){
 const [bookSection,setBookSection]=useState(0),[skillFilter,setSkillFilter]=useState('已学习'),[skillSearch,setSkillSearch]=useState(''),[targetId,setTargetId]=useState(s.id);
 useEffect(()=>setTargetId(s.id),[s.id]);
 const skills=spellbookSkills(d.skills||[],skillFilter),resource=d.resource||{name:'法力'},uses={...d.skillUses,...(d.skillUsesByTarget?.[targetId]||{})};
 const tabs=spellbookSkillLines(s.classId,skills);
 const activeTab=tabs.some(tab=>tab.id===bookSection)?bookSection:tabs[0]?.id;
 const visible=(tabs.find(tab=>tab.id===activeTab)?.skills||[])
  .filter((a:any)=>!skillSearch||(a.name+' '+a.nameEn).toLowerCase().includes(skillSearch.toLowerCase()));
 return <><ClassCompanion state={s} data={d} busy={busy} send={send}/><section className="spellbook-shell" aria-label={`${d.className}法术书`}>
  <nav className="spellbook-tabs" aria-label="法术书技能系">{tabs.map(tab=>{const sample=tab.skills[0];return <button type="button" key={tab.id} className={activeTab===tab.id?'active':''} aria-pressed={activeTab===tab.id} onClick={()=>setBookSection(tab.id)} title={`${tab.label} · ${tab.skills.length}`}><span className="spellbook-tab-icon">{sample?.icon?<Icon src={sample.icon} name={tab.label} size={34}/>:<ClassIcon classId={s.classId} size={34}/>}</span><span>{tab.label}<small>{tab.skills.length}</small></span></button>;})}</nav>
  <div className="spellbook-frame">
   <header className="spellbook-title"><div><span>法术书与技能</span><h2>{tabs.find(tab=>tab.id===activeTab)?.label||d.className}</h2></div><small>{visible.length} 项</small></header>
   <div className="spellbook-toolbar"><input aria-label="搜索职业技能" placeholder="搜索法术与技能" value={skillSearch} onChange={e=>setSkillSearch(e.target.value)}/><div className="spellbook-filters" aria-label="学习状态筛选">{['全部','可学习','已学习','未学习'].map(value=><button type="button" className={value===skillFilter?'active':''} aria-pressed={value===skillFilter} key={value} onClick={()=>setSkillFilter(value)}>{value}</button>)}</div><label>目标<GameSelect aria-label="技能目标" value={targetId} onValueChange={nextValue=>setTargetId(nextValue)}>{[s,...s.party,...(s.pet?[s.pet]:[])].map((c:any)=><GameSelectOption key={c.id} value={c.id}>{c.name}{c.hp<=0?'（已死亡）':''}</GameSelectOption>)}{(s.combat?.enemies||[]).filter((e:any)=>e.hp>0).map((e:any)=><GameSelectOption key={e.id} value={e.id}>{e.name}</GameSelectOption>)}{!s.combat&&d.monsters.map((e:any)=><GameSelectOption key={e.id} value={'npc:'+e.id}>{e.name}</GameSelectOption>)}{s.groundEffects?.filter((e:any)=>e.trap&&e.until>s.clock).map((e:any)=><GameSelectOption key={e.id} value={e.id}>陷阱 · {e.name||e.id}</GameSelectOption>)}{d.lockTargets?.map((i:any)=><GameSelectOption key={i.id} value={i.id}>{i.name}</GameSelectOption>)}</GameSelect></label></div>
   <TrainerNavigation state={s} data={d} busy={busy} send={send} kind="class"/><div className="spellbook-guidance"><p>{d.canTrain?'在世界页面点击训练师，查看并学习新技能。':'前往有本职业训练师的城镇学习新技能。'}</p><small>技能数值为基础效果，实际效果受装备、天赋和目标影响。</small></div>
   {activeTab===0&&d.raceTraits?.length>0&&<div className="spellbook-racial-summary" aria-label={`${d.raceName}种族特长`}>{d.raceTraits.map((trait:any,index:number)=><div key={trait.id||trait.name||index}><strong>{trait.name}</strong><small>{trait.description}</small></div>)}</div>}
   <Tooltip.Provider delayDuration={150} skipDelayDuration={100}><div className="spell-list">{visible.map((a:any)=><div key={a.spellId} className={'spell-row '+(!a.known?'unlearned':'')+(a.supported===false?' unsupported':'')}><Tooltip.Root><Tooltip.Trigger asChild><button type="button" className="spellbook-icon" aria-label={`${a.name} · 技能说明`}><Icon src={a.icon} name={a.name} showTitle={false}/></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="cu-action-tooltip" side="top" align="start" sideOffset={10} collisionPadding={12}>
    <SpellTooltipContent spell={a} data={d}/>
    <p className="cu-tooltip-note">需要等级 {a.requiredLevel}{a.acquisitionLabel?` · ${a.acquisitionLabel}`:''} · {a.known?'已学习':'未学习'}</p>
    {a.supported===false&&<p className="cu-tooltip-note">参考数据已收录，当前战斗系统尚未实现。</p>}
    {!a.known&&a.blockedReason&&<p className="cu-tooltip-error">{a.blockedReason}</p>}
    {a.known&&uses[a.spellId]?.description&&<p className="cu-tooltip-description">{uses[a.spellId].description}</p>}
    {a.known&&uses[a.spellId]?.reason&&<p className="cu-tooltip-error">{uses[a.spellId].reason}</p>}
   </Tooltip.Content></Tooltip.Portal></Tooltip.Root><div className="grow"><strong>{a.name} {a.rank&&<small>{spellRank(a.rank)}</small>}</strong><small>需要等级 {a.requiredLevel}{a.acquisitionLabel?` · ${a.acquisitionLabel}`:''}{(a.powerCost??a.manaCost)>0?` · ${a.powerCost??a.manaCost} ${a.powerName||resource.name}`:''}{a.channelMs?` · ${a.channelMs/1000} 秒引导`:a.cast?` · ${a.cast/1000} 秒施法`:' · 瞬发'}</small><SpellDetails details={a.details}/>{a.supported===false&&<small className="support-note">参考数据已收录，当前战斗系统尚未实现。</small>}{!a.known&&a.blockedReason&&<small className="blocked-reason">{a.blockedReason}</small>}</div>{a.known?(uses?.[a.spellId]?<div className="spell-use"><Button variant="outline" disabled={busy||!uses[a.spellId].canUse} title={uses[a.spellId].reason||uses[a.spellId].description} onClick={()=>send({type:'cast',id:a.spellId,target:targetId})}>{s.activity.spell===a.spellId&&s.activity.endsAt?'施法中…':uses[a.spellId].label}</Button><small>{uses[a.spellId].reason||uses[a.spellId].description}</small></div>:<span className="learned">已学习</span>):<span className="learned">与训练师交谈学习</span>}</div>)}</div></Tooltip.Provider>
   {!visible.length&&<p className="spellbook-empty">当前分类下没有符合条件的技能。</p>}
  </div>
 </section></>;
}

export default function Character({state:s,data:d,busy,send,roster,section:controlledSection,onSectionChange}:GameProps&{section?:string;onSectionChange?:(section:string)=>void}){
 const [localSection,setLocalSection]=useState('装备与背包');
 const section=controlledSection??localSection,setSection=onSectionChange??setLocalSection;
 const used=Object.values(s.talents||{}).reduce((n:any,v:any)=>n+Number(v||0),0) as number;
 return <section className="armory-page"><div className="section-heading armory-page-heading"><div><h1>{s.name}</h1><small>{s.level} 级 {d.raceName} · {d.className}</small></div><nav className="filterbar character-sections" aria-label="角色功能">{['装备与背包','法术书','天赋','策略','坐骑','生活职业','银行','拍卖行'].map(t=><button type="button" aria-pressed={section===t} className={section===t?'active':''} onClick={()=>setSection(t)} key={t}>{t}{t==='天赋'&&Math.max(0,Math.min(60,s.level)-9-used)>0&&<span className="section-count" aria-label={`${Math.max(0,Math.min(60,s.level)-9-used)} 点可用天赋`}>{Math.max(0,Math.min(60,s.level)-9-used)}</span>}</button>)}</nav></div>
 {section==='策略'&&<Strategy state={s} data={d} busy={busy} send={send} currentCharacterOnly/>}
 {section==='坐骑'&&<Mounts state={s} data={d} busy={busy} send={send}/>}
 {section==='装备与背包'&&<><CharacterEquipment roster={roster} state={s} data={d} busy={busy} send={send}/><AmmoControls state={s} data={d} busy={busy} send={send}/></>}
 {section==='生活职业'&&<Professions state={s} data={d} busy={busy} send={send}/>}
 {section==='银行'&&<Bank state={s} data={d} busy={busy} send={send}/>}
 {section==='拍卖行'&&<Auction state={s} data={d} busy={busy} send={send}/>}
 {section==='法术书'&&<Spellbook state={s} data={d} busy={busy} send={send}/>}
 {section==='天赋'&&<TalentTree key={s.id} title={`${d.className}天赋`} trees={d.talentTrees||[]} nodes={d.talents||[]} available={Math.max(0,Math.min(60,s.level)-9-used)} busy={busy} onLearn={id=>send({type:'talent',id})} actions={<><Button variant="outline" disabled={busy||!d.canResetTalents} onClick={()=>send({type:'resetTalents'})}>{d.talentResetCost===0?'免费重置天赋':'重置天赋'}{d.talentResetCost>0?` · ${money(d.talentResetCost)}`:''}</Button><small>{d.talentResetBlockedReason||'重置后返还全部已投入的天赋点。'}</small></>}/>}

 </section>;
}
