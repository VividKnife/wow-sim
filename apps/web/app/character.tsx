"use client";
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
import {spellbookSkillLines} from './spellbook-skill-lines';
import './character.css';

const talentName=(talent:any)=>talent.nameZhCN||talent.name||talent.nameEn||'未知天赋';
const treeId=(tree:any)=>Number(tree.id??tree.tree??tree.tabId);
const treeLabels:Record<string,string>={Arms:'武器',Fury:'狂怒',Protection:'防护',Holy:'神圣',Retribution:'惩戒','Beast Mastery':'野兽掌握',Marksmanship:'射击',Survival:'生存',Assassination:'刺杀',Combat:'战斗',Subtlety:'敏锐',Discipline:'戒律',Shadow:'暗影',Elemental:'元素',Enhancement:'增强',Restoration:'恢复',Arcane:'奥术',Fire:'火焰',Frost:'冰霜',Affliction:'痛苦',Demonology:'恶魔学识',Destruction:'毁灭',Balance:'平衡','Feral Combat':'野性战斗'};
const treeName=(tree:any)=>tree.nameZhCN||treeLabels[tree.name||tree.nameEn]||tree.name||tree.nameEn||`天赋系 ${treeId(tree)}`;
const effectText=(talent:any)=>{
 const effects=talent.rankEffects||talent.effects||[];
 const effect=effects[Math.min(Math.max(0,(talent.rank||1)-1),Math.max(0,effects.length-1))];
 return effect?.descriptionZhCN||effect?.descriptionEn||effect?.description||talent.description||'效果说明暂未收录。';
};

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
 const [bookSection,setBookSection]=useState(0),[skillFilter,setSkillFilter]=useState('全部'),[skillSearch,setSkillSearch]=useState(''),[targetId,setTargetId]=useState(s.id);
 useEffect(()=>setTargetId(s.id),[s.id]);
 const skills=d.skills||[],resource=d.resource||{name:'法力'},uses={...d.skillUses,...(d.skillUsesByTarget?.[targetId]||{})};
 const tabs=spellbookSkillLines(s.classId,skills);
 const activeTab=tabs.some(tab=>tab.id===bookSection)?bookSection:tabs[0]?.id;
 const visible=(tabs.find(tab=>tab.id===activeTab)?.skills||[])
  .filter((a:any)=>(!skillSearch||(a.name+' '+a.nameEn).toLowerCase().includes(skillSearch.toLowerCase()))&&(skillFilter==='全部'||skillFilter==='已学习'&&a.known||skillFilter==='可学习'&&a.canTrain||skillFilter==='未学习'&&!a.known));
 return <><ClassCompanion state={s} data={d} busy={busy} send={send}/><section className="spellbook-shell" aria-label={`${d.className}法术书`}>
  <nav className="spellbook-tabs" aria-label="法术书技能系">{tabs.map(tab=>{const sample=tab.skills[0];return <button type="button" key={tab.id} className={activeTab===tab.id?'active':''} aria-pressed={activeTab===tab.id} onClick={()=>setBookSection(tab.id)} title={`${tab.label} · ${tab.skills.length}`}><span className="spellbook-tab-icon">{sample?.icon?<Icon src={sample.icon} name={tab.label} size={34}/>:<ClassIcon classId={s.classId} size={34}/>}</span><span>{tab.label}<small>{tab.skills.length}</small></span></button>;})}</nav>
  <div className="spellbook-frame">
   <header className="spellbook-title"><div><span>法术书与技能</span><h2>{tabs.find(tab=>tab.id===activeTab)?.label||d.className}</h2></div><small>{visible.length} 项</small></header>
   <div className="spellbook-toolbar"><input aria-label="搜索职业技能" placeholder="搜索法术与技能" value={skillSearch} onChange={e=>setSkillSearch(e.target.value)}/><div className="spellbook-filters" aria-label="学习状态筛选">{['全部','可学习','已学习','未学习'].map(value=><button type="button" className={value===skillFilter?'active':''} aria-pressed={value===skillFilter} key={value} onClick={()=>setSkillFilter(value)}>{value}</button>)}</div><label>目标<GameSelect aria-label="技能目标" value={targetId} onValueChange={nextValue=>setTargetId(nextValue)}>{[s,...s.party,...(s.pet?[s.pet]:[])].map((c:any)=><GameSelectOption key={c.id} value={c.id}>{c.name}{c.hp<=0?'（已死亡）':''}</GameSelectOption>)}{(s.combat?.enemies||[]).filter((e:any)=>e.hp>0).map((e:any)=><GameSelectOption key={e.id} value={e.id}>{e.name}</GameSelectOption>)}{!s.combat&&d.monsters.map((e:any)=><GameSelectOption key={e.id} value={'npc:'+e.id}>{e.name}</GameSelectOption>)}{s.groundEffects?.filter((e:any)=>e.trap&&e.until>s.clock).map((e:any)=><GameSelectOption key={e.id} value={e.id}>陷阱 · {e.name||e.id}</GameSelectOption>)}{d.lockTargets?.map((i:any)=><GameSelectOption key={i.id} value={i.id}>{i.name}</GameSelectOption>)}</GameSelect></label></div>
   <div className="spellbook-guidance"><p>{d.canTrain?'在世界页面点击训练师，查看并学习新技能。':'前往有本职业训练师的城镇学习新技能。'}</p><small>技能数值为基础效果，实际效果受装备、天赋和目标影响。</small></div>
   {activeTab===0&&d.raceTraits?.length>0&&<div className="spellbook-racial-summary" aria-label={`${d.raceName}种族特长`}>{d.raceTraits.map((trait:any,index:number)=><div key={trait.id||trait.name||index}><strong>{trait.name}</strong><small>{trait.description}</small></div>)}</div>}
   <div className="spell-list">{visible.map((a:any)=><div key={a.spellId} className={'spell-row '+(!a.known?'unlearned':'')+(a.supported===false?' unsupported':'')}><Icon src={a.icon} name={a.name}/><div className="grow"><strong>{a.name} {a.rank&&<small>{spellRank(a.rank)}</small>}</strong><small>需要等级 {a.requiredLevel}{a.acquisitionLabel?` · ${a.acquisitionLabel}`:''}{(a.powerCost??a.manaCost)>0?` · ${a.powerCost??a.manaCost} ${a.powerName||resource.name}`:''}{a.channelMs?` · ${a.channelMs/1000} 秒引导`:a.cast?` · ${a.cast/1000} 秒施法`:' · 瞬发'}</small><SpellDetails details={a.details}/>{a.supported===false&&<small className="support-note">参考数据已收录，当前战斗系统尚未实现。</small>}{!a.known&&a.blockedReason&&<small className="blocked-reason">{a.blockedReason}</small>}</div>{a.known?(uses?.[a.spellId]?<div className="spell-use"><Button variant="outline" disabled={busy||!uses[a.spellId].canUse} title={uses[a.spellId].reason||uses[a.spellId].description} onClick={()=>send({type:'cast',id:a.spellId,target:targetId})}>{s.activity.spell===a.spellId&&s.activity.endsAt?'施法中…':uses[a.spellId].label}</Button><small>{uses[a.spellId].reason||uses[a.spellId].description}</small></div>:<span className="learned">已学习</span>):<span className="learned">与训练师交谈学习</span>}</div>)}</div>
   {!visible.length&&<p className="spellbook-empty">当前分类下没有符合条件的技能。</p>}
  </div>
 </section></>;
}

export default function Character({state:s,data:d,busy,send,roster,section:controlledSection,onSectionChange}:GameProps&{section?:string;onSectionChange?:(section:string)=>void}){
 const [localSection,setLocalSection]=useState('装备与背包'),[tree,setTree]=useState<number>(0);
 const section=controlledSection??localSection,setSection=onSectionChange??setLocalSection;
 const used=Object.values(s.talents||{}).reduce((n:any,v:any)=>n+Number(v||0),0) as number;
 const trees=d.talentTrees||[],selectedTree=trees.some((item:any)=>treeId(item)===tree)?tree:treeId(trees[0]||{});
 const talents=d.talents||[];
 return <section className="armory-page"><div className="section-heading armory-page-heading"><div><h1>{s.name}</h1><small>{s.level} 级 {d.raceName} · {d.className}</small></div><nav className="filterbar character-sections" aria-label="角色功能">{['装备与背包','法术书','天赋','策略','坐骑','生活职业','银行','拍卖行'].map(t=><button type="button" aria-pressed={section===t} className={section===t?'active':''} onClick={()=>setSection(t)} key={t}>{t}{t==='天赋'&&Math.max(0,Math.min(60,s.level)-9-used)>0&&<span className="section-count" aria-label={`${Math.max(0,Math.min(60,s.level)-9-used)} 点可用天赋`}>{Math.max(0,Math.min(60,s.level)-9-used)}</span>}</button>)}</nav></div>
 {section==='策略'&&<Strategy state={s} data={d} busy={busy} send={send} currentCharacterOnly/>}
 {section==='坐骑'&&<Mounts state={s} data={d} busy={busy} send={send}/>}
 {section==='装备与背包'&&<><CharacterEquipment roster={roster} state={s} data={d} busy={busy} send={send}/><AmmoControls state={s} data={d} busy={busy} send={send}/></>}
 {section==='生活职业'&&<Professions state={s} data={d} busy={busy} send={send}/>}
 {section==='银行'&&<Bank state={s} data={d} busy={busy} send={send}/>}
 {section==='拍卖行'&&<Auction state={s} data={d} busy={busy} send={send}/>}
 {section==='法术书'&&<Spellbook state={s} data={d} busy={busy} send={send}/>}
 {section==='天赋'&&<section className="panel talent-panel"><div className="section-heading"><div><h2>{d.className}天赋 <small>可用 {Math.max(0,Math.min(60,s.level)-9-used)} 点 · 已投入 {used} 点</small></h2><small>10 级起每级获得 1 点；深入一层前需要在同系投入足够点数。</small></div><div className="talent-actions"><div className="filterbar">{trees.map((item:any)=><button key={treeId(item)} onClick={()=>setTree(treeId(item))} className={selectedTree===treeId(item)?'active':''}>{treeName(item)}</button>)}</div><Button variant="outline" disabled={busy||!d.canResetTalents} title={!d.canResetTalents?(d.talentResetBlockedReason||'需在训练地点拥有已投入的天赋点，并备足重置费用。'):undefined} onClick={()=>send({type:'resetTalents'})}>{d.talentResetCost===0?'免费重置天赋':'重置天赋'}{d.talentResetCost>0?` · ${money(d.talentResetCost)}`:''}</Button></div></div><div className="talent-grid">{talents.filter((t:any)=>Number(t.tree??t.treeId??t.tabId)===selectedTree).map((t:any)=><details style={{gridRow:Number(t.row??0)+1,gridColumn:Number(t.col??0)+1}} className={'talent '+(!t.canLearn&&t.rank<t.maxRank?'locked':'')+(t.supported===false?' unsupported':'')} key={t.id}><summary><Icon src={t.icon} name={talentName(t)} size={48}/><strong>{talentName(t)}</strong><span>{t.rank} / {t.maxRank}</span></summary><div className="talent-detail"><h3>{talentName(t)}</h3><p>{effectText(t)}</p><small>需要同系 {t.requiredTreePoints||0} 点</small>{t.supported===false&&<small className="support-note">参考节点；当前战斗系统尚未实现此效果。</small>}{t.blockedReason&&<small className="blocked-reason">{t.blockedReason}</small>}<Button disabled={busy||!t.canLearn} title={t.blockedReason||undefined} onClick={()=>send({type:'talent',id:t.id})}>投入 1 点</Button></div></details>)}{!talents.some((t:any)=>Number(t.tree??t.treeId??t.tabId)===selectedTree)&&<div className="talent-tree-empty">这个天赋系暂无可用节点。</div>}</div></section>}
 </section>;
}
