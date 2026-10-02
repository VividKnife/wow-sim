import {lazy,Suspense,useState} from 'react';
import {Button} from '@/components/ui/button';
import {GameSelect,GameSelectOption} from '@/components/ui/game-select';
import {GameProps,Icon,Bar,money} from './game-ui';
import CreaturePortrait from './creature-portrait';
import './hunter-pets.css';
const PetModel=lazy(()=>import('./pet-model'));
const commands=[['attack','攻击','ability_warrior_charge'],['follow','跟随','ability_tracking'],['stay','停留','spell_nature_timestop'],['aggressive','主动','ability_physical_taunt'],['defensive','防御','ability_defend'],['passive','被动','ability_hunter_beastsoothe']];

export default function HunterPets({stableService=false,...props}:GameProps&{stableService?:boolean}){
 const {state:s,data:d,busy,send}=props,stable=d.petStable,pet=s.pet,current=stable?.current,controls=d.petControls;
 const [book,setBook]=useState('learned'),[targetId,setTargetId]=useState('');
 if(s.classId!==3)return <p>兽栏只为猎人服务。</p>;
 const skills=controls?.skills||[],active=skills.filter((skill:any)=>skill.learned&&skill.currentRank&&!skill.passive).slice(0,4);
 const enemies=(s.combat?.enemies||[]).filter((enemy:any)=>enemy.hp>0&&!enemy.removed&&!enemy.controlledBy);
 const target=enemies.find((enemy:any)=>enemy.id===targetId)?.id||enemies.find((enemy:any)=>enemy.id===s.combat?.command?.focusId)?.id||enemies[0]?.id;
 const unavailable=busy||!pet||pet.hp<=0||s.hp<=0;
 const command=(command:string,extra={})=>send({type:'petCommand',command,...extra});
 const cast=(skill:any)=>command('cast',{spellId:skill.id,targetId:target});
 const toggle=(skill:any)=>command('autocast',{spellId:skill.id,enabled:!skill.autocast});
 const canCast=(skill:any)=>!unavailable&&!!s.combat&&(skill.selfTarget||!!target)&&(skill.cooldownUntil||0)<=s.clock&&(controls?.focus??100)>=skill.focusCost;
 const status=pet?(pet.hp>0?'正在出战':'已死亡'):current?'已解散':'未携带宠物';
 const commandSlot=(item:string[])=>{const [id,label,icon]=item;return <button type="button" key={id} className="pet-action" aria-label={label} aria-pressed={pet?.mode===id} title={id==='attack'?(target?`攻击 ${enemies.find((e:any)=>e.id===target)?.name}`:'需要战斗中的目标'):label} disabled={unavailable||(id==='attack'&&!target)} onClick={()=>command(id,id==='attack'?{targetId:target}:{})}><Icon src={`/icons/class-assets/${icon}.jpg`} name={label}/><span>{label}</span></button>;};
 return <section className="panel hunter-pets" aria-label={stableService?'兽栏管理员':'猎人宠物'}>
  <header className="pet-page-heading"><div><small>猎人 · 野兽伙伴</small><h3>{stableService?'兽栏管理员':'我的宠物'}</h3></div><span>{current?'随行 1 / 1':'随行 0 / 1'} · 兽栏 {stable?.slots.filter(Boolean).length||0} / {stable?.capacity||0}</span></header>
  {current?<div className="pet-overview">
   <div className="pet-current">
    <div className="pet-identity"><CreaturePortrait unit={{entry:current.entry,creatureType:1}}/><div><h4>{current.name}</h4><p>等级 {current.level} · {current.family||'野兽'}</p></div><span className={`pet-status ${pet?.hp>0?'is-active':''}`}>{status}</span></div>
    <Suspense fallback={<div className="pet-model" role="status">正在准备 3D 展示…</div>}><PetModel entry={current.entry} name={current.name}/></Suspense>
    {pet&&<div className="pet-resources"><Bar value={pet.hp} max={pet.maxHp} label="生命"/><Bar value={controls?.focus??100} max={100} label="集中值" tone="focus"/></div>}
    {current.nextXp>0&&<div className="pet-experience"><Bar value={current.xp} max={current.nextXp} label="经验" tone="xp"/></div>}
   </div>
   <aside className="pet-character-sheet"><h4>伙伴状态</h4><dl><div><dt>忠诚等级</dt><dd>{current.loyalty} / 6 · 忠实</dd></div><div><dt>快乐状态</dt><dd className="pet-happy">● 快乐</dd></div><div><dt>伤害加成</dt><dd>125%</dd></div><div><dt>训练点数</dt><dd>{current.trainingPoints}</dd></div>{pet&&<><div><dt>护甲</dt><dd>{pet.armor||0}</dd></div><div><dt>攻击速度</dt><dd>{((pet.swing||2000)/1000).toFixed(2)} 秒</dd></div></>}</dl><p className="pet-note">快乐与忠诚保持满值。训练点可在技能书中用于训练。</p>
    {pet?.hp<=0&&s.learned.includes(982)&&<Button disabled={busy||!d.skillUses?.[982]?.canUse} title={d.skillUses?.[982]?.reason||''} onClick={()=>send({type:'cast',id:982})}>复活宠物</Button>}
    {!pet&&s.learned.includes(883)&&<Button disabled={busy||!d.skillUses?.[883]?.canUse} title={d.skillUses?.[883]?.reason||''} onClick={()=>send({type:'cast',id:883})}>召唤宠物</Button>}
    {pet&&<details className="pet-care"><summary>喂养与管理</summary>{controls?.feedingUntil>s.clock?<p role="status">正在进食 · {Math.ceil((controls.feedingUntil-s.clock)/1000)} 秒</p>:s.learned.includes(6991)?controls?.food?.length?controls.food.map((food:any)=><Button key={food.id} variant="outline" disabled={unavailable||!!s.combat} onClick={()=>command('feed',{itemId:food.id})}>{food.name} ×{food.count}</Button>):<p>背包中没有合适的食物。</p>:<p>需要学习“喂养宠物”。</p>}<p>放弃后需要重新驯服。</p><Button variant="outline" disabled={busy||!!s.combat} onClick={()=>command('abandon')}>放弃宠物</Button></details>}
   </aside>
  </div>:<div className="pet-empty"><Icon src="/icons/class-assets/ability_hunter_beasttaming.jpg" name="驯服野兽" size={56}/><h4>你的冒险，等待一位伙伴</h4><p>驯服一只野兽，或在兽栏管理员处领出宠物。</p></div>}
  {pet&&<>
   <section className="pet-action-section" aria-label="宠物技能条"><div className="pet-section-heading"><h4>宠物技能条</h4>{enemies.length>0&&<label>攻击目标 <GameSelect value={target||''} onValueChange={setTargetId} aria-label="宠物攻击目标">{enemies.map((e:any)=><GameSelectOption key={e.id} value={e.id}>{e.name}</GameSelectOption>)}</GameSelect></label>}</div>
    <div className="pet-action-bar">{commands.slice(0,3).map(commandSlot)}{Array.from({length:4},(_,index)=>{const skill=active[index];return skill?<button type="button" className={`pet-action pet-spell ${skill.autocast?'is-autocast':''}`} key={skill.id} disabled={unavailable} aria-label={`${skill.name} ${skill.rank}，${skill.autocast?'自动施法开启':'自动施法关闭'}`} title={`${skill.name} ${skill.rank}\n${skill.focusCost} 集中值\n${skill.details?.effects?.join('\n')||''}\n左键施放 · 右键切换自动施法（技能书中也可切换）${!canCast(skill)?'\n当前无法施放：需要战斗、有效目标、足够集中值且冷却完毕':''}`} onClick={()=>canCast(skill)&&cast(skill)} onContextMenu={e=>{e.preventDefault();if(!unavailable)toggle(skill);}}><Icon src={skill.icon} name={skill.name}/><span>{skill.name}</span>{skill.cooldownUntil>s.clock&&<b className="pet-cooldown">{Math.ceil((skill.cooldownUntil-s.clock)/1000)}</b>}{skill.autocast&&<i aria-hidden="true">◆</i>}</button>:<div className="pet-action pet-slot-empty" key={`empty-${index}`} aria-label="空技能栏位"><span>空</span></div>;})}{commands.slice(3).map(commandSlot)}</div>
    <p className="pet-note">左键施放技能，右键切换自动施法；金色边框表示自动施法开启。</p>
   </section>
   <section className="pet-spellbook" aria-label="宝宝技能书"><header><div><small>野兽训练</small><h4>宝宝技能书</h4></div><strong>{pet.trainingPoints||0} <small>可用训练点</small></strong></header>
    <div className="pet-book-tabs" role="group" aria-label="技能分类">{[['learned','已掌握'],['training','可训练']].map(([id,label])=><button type="button" key={id} aria-pressed={book===id} onClick={()=>setBook(id)}>{label}</button>)}</div>
    <div className="pet-book-pages">{skills.filter((skill:any)=>book==='learned'?skill.learned&&skill.currentRank:!skill.learned).map((skill:any)=><article className="pet-book-skill" key={skill.id}><Icon src={skill.icon} name={skill.name} size={44}/><div><h5>{skill.name} <small>{skill.rank}</small></h5><p>{skill.passive?'被动技能':`${skill.focusCost} 集中值 · 主动技能`}</p><p>{skill.details?.effects?.join('；')||'宠物技能'}</p><small>{skill.details?.facts?.join(' · ')}</small>{book==='training'?<><p>需要宠物等级 {skill.level} · {skill.cost} 训练点</p>{skill.reason&&<p className="pet-training-reason">{skill.reason}</p>}<Button size="sm" variant="outline" disabled={busy||!!skill.reason} onClick={()=>command('train',{spellId:skill.id})}>训练</Button></>:!skill.passive&&<div className="pet-book-actions"><button type="button" disabled={unavailable} aria-pressed={skill.autocast} onClick={()=>toggle(skill)}>{skill.autocast?'◆ 自动施法：开':'◇ 自动施法：关'}</button><button type="button" disabled={!canCast(skill)} onClick={()=>cast(skill)}>施放</button></div>}</div></article>)}</div>
    {!skills.some((skill:any)=>book==='learned'?skill.learned&&skill.currentRank:!skill.learned)&&<p className="pet-book-empty">{book==='learned'?'这只宠物还没有掌握技能。':'暂无可训练技能。向宠物训练师学习，或通过驯服野兽掌握新技能。'}</p>}
   </section>
  </>}
  <section className="pet-stable" aria-label="兽栏"><div className="pet-section-heading"><h4>兽栏</h4><span>{stable?.capacity||0} / 2 个位置已解锁</span></div><p className="pet-note">存放、领出和交换宠物需要与兽栏管理员交谈。</p>
   <div className="pet-stable-grid">{stable?.slots.map((stored:any,index:number)=><article className={`pet-stable-card ${stored?'':'is-empty'}`} key={index}>{stored?<CreaturePortrait unit={{entry:stored.entry,creatureType:1}}/>:<div className="pet-stable-placeholder" aria-hidden="true">{stable.capacity>index?'＋':'◇'}</div>}<div className="grow"><small>兽栏位置 {index+1} · {stored?'休息中':stable.capacity>index?'空位':'未解锁'}</small><h5>{stored?.name||(stable.capacity>index?'等待新的伙伴':'扩充兽栏')}</h5>{stored&&<><p>等级 {stored.level} · {stored.family||'野兽'}</p><small>忠诚度 {stored.loyalty}/6 · 训练点 {stored.trainingPoints}</small></>}{stableService&&(stable.capacity<=index?<Button variant="outline" disabled={busy||!d.city?.canInteract||index!==stable.capacity||s.money<stable.prices[index]} onClick={()=>send({type:'petStable',operation:'buy',slot:index})}>解锁 · {money(stable.prices[index])}</Button>:stored?<Button variant="outline" disabled={busy||!d.city?.canInteract||pet?.hp<=0} onClick={()=>send({type:'petStable',operation:'withdraw',slot:index})}>{current?'交换宠物':'领出宠物'}</Button>:<Button variant="outline" disabled={busy||!d.city?.canInteract||!current||pet?.hp<=0} onClick={()=>send({type:'petStable',operation:'store',slot:index})}>存放当前宠物</Button>)}</div></article>)}</div>
   {!stableService&&<p className="pet-note">在“世界 → 附近人物 → 兽栏”找到兽栏管理员。</p>}
  </section>
 </section>;
}
