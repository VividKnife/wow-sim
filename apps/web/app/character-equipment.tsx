"use client";

import {useState} from 'react';
import {Backpack, Shirt, Shield, Sword, Gem, Footprints, Hand, Crown, Circle, WandSparkles} from 'lucide-react';
import {Bar, GameProps, Icon, money} from './game-ui';
import CharacterModel from './character-model';
import './economy.css';

type Instance={uid:string;id:number;count:number;durability?:number;bound?:boolean;locked?:boolean;enchant?:string};
type ItemData={class:number;subclass:number;name:string;icon?:string;quality:number;level:number;maxDurability:number;armor:number;slot:number;bagSlots:number;sell:number;description?:string|null;damage?:number[];speed:number;stats:{type:number;value:number}[]};
type Slot={id:number;name:string;glyph:typeof Shirt};
const leftSlots:Slot[]=[{id:1,name:'头部',glyph:Crown},{id:2,name:'颈部',glyph:Gem},{id:3,name:'肩部',glyph:Shield},{id:15,name:'背部',glyph:Shirt},{id:5,name:'胸部',glyph:Shirt},{id:4,name:'衬衣',glyph:Shirt},{id:19,name:'战袍',glyph:Shirt},{id:9,name:'手腕',glyph:Shield}];
const rightSlots:Slot[]=[{id:10,name:'手部',glyph:Hand},{id:6,name:'腰部',glyph:Shield},{id:7,name:'腿部',glyph:Shirt},{id:8,name:'脚部',glyph:Footprints},{id:11,name:'手指',glyph:Circle},{id:12,name:'手指',glyph:Circle},{id:13,name:'饰品',glyph:Gem},{id:14,name:'饰品',glyph:Gem}];
const weaponSlots:Slot[]=[{id:16,name:'主手',glyph:Sword},{id:17,name:'副手',glyph:Shield},{id:18,name:'远程',glyph:WandSparkles}];
const armorTypes:Record<number,string>={1:'布甲',2:'皮甲',3:'锁甲',4:'板甲',6:'盾牌',7:'圣契',8:'神像',9:'图腾'};
const statNames:Record<number,string>={3:'敏捷',4:'力量',5:'智力',6:'精神',7:'耐力'};
const enchantFits=(def:any,item:any,slot:number)=>!!(def&&item&&def.slots.includes(slot)&&(def.class<0||def.class===item.class)&&(!def.subclassMask||def.subclassMask<0||def.subclassMask&(1<<item.subclass))&&(!def.inventoryMask||def.inventoryMask&(1<<item.InventoryType)));

function ItemFacts({item,instance}:{item:ItemData;instance:Instance}){
 return <span className="armory-item-facts">
  <strong className={'item-name rarity-'+item.quality}>{item.name}</strong>
  {instance.bound&&<span>已绑定</span>}{instance.locked&&<span>🔒 已锁定</span>}{instance.enchant&&<span className="enchant-text">{item.description||`附魔 ${instance.enchant}`}</span>}
  {item.bagSlots>0&&<span>{item.bagSlots} 格容器</span>}
  {item.class===4&&armorTypes[item.subclass]&&<span>{armorTypes[item.subclass]}</span>}
  {item.armor>0&&<span>{item.armor} 点护甲</span>}
  {item.damage&&<span>{item.damage.join(' — ')} 伤害 <span className="item-speed">速度 {(item.speed/1000).toFixed(2)}</span></span>}
  {item.stats.map((stat,index)=><span className="item-stat" key={index}>+{stat.value} {statNames[stat.type]||'属性'}</span>)}
  {item.maxDurability>0&&instance.durability!==undefined&&<span>耐久度 {instance.durability} / {item.maxDurability}</span>}
  {instance.durability===0&&item.maxDurability>0&&<span className="item-broken">已损坏</span>}
  {item.level>0&&<span>需要等级 {item.level}</span>}
  {instance.count>1&&<span>数量：{instance.count}</span>}
 </span>;
}

function ItemSlot({instance,item,label,glyph:Glyph=Backpack,selected,onSelect,use,busy,onUse}:{instance?:Instance;item?:ItemData;label:string;glyph?:typeof Shirt;selected?:boolean;onSelect?:(uid:string)=>void;use?:{canUse:boolean;reason:string;label:string;description:string};busy?:boolean;onUse?:(uid:string)=>void}){
 if(!instance||!item)return <span className="armory-slot empty-slot" aria-label={label+' · 空'} title={label+' · 空'}><Glyph size={25} strokeWidth={1}/></span>;
 return <button type="button" className={'armory-slot rarity-border-'+item.quality+(selected?' selected':'')+(use?' usable-slot':'')} aria-disabled={use?busy||!use.canUse:undefined} aria-label={`${label}：${item.name}${instance.count>1?' ×'+instance.count:''}`} aria-pressed={!!selected} onClick={()=>{onSelect?.(instance.uid);if(use?.canUse&&!busy)onUse?.(instance.uid);}}>
  <Icon src={item.icon} name={item.name} size={46}/>
  {instance.count>1&&<span className="slot-count">{instance.count}</span>}
  {instance.durability===0&&item.maxDurability>0&&<span className="slot-broken" aria-label="已损坏">!</span>}
  <span className="armory-tooltip"><ItemFacts item={item} instance={instance}/><span className="tooltip-hint">{use?(use.reason||`点击${use.label} · ${use.description}`):'点击查看详情'}</span></span>
 </button>;
}

// A decorative class silhouette, not a live model of the equipped items.
function MageSilhouette({label}:{label:string}){
 return <svg className="mage-silhouette" viewBox="0 0 260 400" fill="none" role="img" aria-label={label}>
  <defs><linearGradient id="mage-robe" x1="70" y1="100" x2="190" y2="370" gradientUnits="userSpaceOnUse"><stop stopColor="#536075"/><stop offset=".45" stopColor="#28384e"/><stop offset="1" stopColor="#141e2b"/></linearGradient><linearGradient id="mage-trim" x1="90" y1="90" x2="150" y2="370"><stop stopColor="#b49a65"/><stop offset="1" stopColor="#66573f"/></linearGradient><radialGradient id="mage-light"><stop stopColor="#b0efff"/><stop offset=".25" stopColor="#6bb8eb"/><stop offset="1" stopColor="#4b91cf" stopOpacity="0"/></radialGradient></defs>
  <ellipse cx="129" cy="373" rx="92" ry="15" fill="#060809" opacity=".8"/>
  <path d="M107 322L99 369L123 370L130 326M143 323L143 370L170 370L156 323" fill="#17191f" stroke="#5f594a"/>
  <path d="M102 102L74 114L60 199L80 211L97 170L92 232L70 350Q124 373 184 350L163 231L161 164L179 203L198 194L182 118L150 103Z" fill="url(#mage-robe)" stroke="#73808b" strokeWidth="1.5"/>
  <path d="M100 105L122 153L107 351M151 105L134 153L153 355M94 229L163 229M75 341Q126 359 181 341" stroke="url(#mage-trim)" strokeWidth="7"/>
  <path d="M96 251L90 331M114 255L116 340M139 258L144 339M162 250L169 330" stroke="#6e7d8c" opacity=".24" strokeWidth="2"/>
  <path d="M73 115L100 105L106 131L72 143L62 134ZM153 105L183 116L193 135L162 143Z" fill="#3e4b60" stroke="#ad9563" strokeWidth="3"/>
  <path d="M111 82L109 109L128 126L148 109L146 81" fill="#94765e"/>
  <path d="M109 48Q127 29 149 50L151 83L140 102L121 102L108 82Z" fill="#b39779" stroke="#716354"/>
  <path d="M108 70L104 49L115 35L143 37L155 53L151 73L140 54L114 57Z" fill="#3f352e" stroke="#70614c"/>
  <path d="M118 76L124 76M139 75L145 75" stroke="#252a2a" strokeWidth="2"/>
  <path d="M129 77L126 87L132 88M123 93L138 93" stroke="#78614e"/>
  <path d="M108 107L126 129L115 148L98 113M148 107L130 129L143 146L158 113" fill="#343f54" stroke="#aa9261" strokeWidth="2"/>
  <path d="M89 222L165 222L163 235L90 235Z" fill="#594937" stroke="#a58b59"/><path d="M120 219L137 219L140 230L129 242L117 230Z" fill="#847047"/><path d="M129 223L135 230L129 237L122 230Z" fill="#7697ab"/>
  <path d="M62 193L79 201L77 219L66 224L60 215ZM181 194L195 188L204 204L197 215L186 214Z" fill="#a48c70" stroke="#615143"/>
  <path d="M197 361L209 74" stroke="#382c22" strokeWidth="9"/><path d="M198 361L210 74" stroke="#b09965" strokeWidth="3"/>
  <path d="M208 97L195 71L199 49L209 68L223 47L226 70L208 97Z" fill="#776446" stroke="#bda46e" strokeWidth="2"/>
  <circle cx="210" cy="56" r="35" fill="url(#mage-light)"/><path d="M209 38L219 55L209 72L201 55Z" fill="#9edafa" stroke="#d7f2ff"/>
 </svg>;
}

export default function CharacterEquipment({state:s,data:d,busy,send}:GameProps){
 const [selected,setSelected]=useState<string|null>(null),[scroll,setScroll]=useState('');
 const equipment=s.equipment as Record<number,Instance>;
 const bag=s.bag as Instance[],bags=s.bags as Instance[],pending=s.pending as Instance[];
 const chosen=[...Object.values(equipment),...bag,...pending].find(i=>i.uid===selected);
 const chosenItem:ItemData|undefined=chosen?d.items[chosen.id]:undefined;
 const inBag=chosen&&bag.some(i=>i.uid===chosen.uid);
 const equipAction=chosen?d.inventoryActions[chosen.uid]:undefined;
 const equipped=chosen&&Object.values(equipment).some(i=>i.uid===chosen.uid);
 const canAct=!busy&&!s.combat&&s.hp>0&&['idle','hunt'].includes(s.activity.type);
 const resource=d.resource||{name:'法力',value:s.mana||0,max:d.stats.maxMana||0};
 const resourceTone=resource.name==='怒气'?'rage':resource.name==='能量'?'energy':'mana';
 const renderEquipment=(slot:Slot)=>{const instance=equipment[slot.id],item=instance?d.items[instance.id]:undefined;return <div className="equipment-position" key={slot.id}><ItemSlot instance={instance} item={item} label={slot.name} glyph={slot.glyph} selected={selected===instance?.uid} onSelect={setSelected}/><span className={'equipment-label '+(item?'rarity-'+item.quality:'')}>{item?.name||slot.name}</span></div>};
 return <div className="armory-layout">
  <section className="classic-frame character-sheet" aria-label="角色装备">
   <header className="classic-title"><span className="classic-portrait identity-crest">{d.className?.slice(0,1)}</span><div><h2>{s.name}</h2><p>等级 {s.level} · {d.raceName}{d.className}</p></div><span className="armory-faction">{d.faction==='Horde'?'部落':'联盟'}</span></header>
   <div className="paper-doll">
    <div className="equipment-column equipment-left">{leftSlots.map(renderEquipment)}</div>
    <div className="character-stage"><div className="stage-arch"/><span className="stage-class">{d.className}</span>{s.raceId===1?<CharacterModel equipment={equipment} items={d.items} title={`人类${d.className} 3D 换装预览`} fallback={<MageSilhouette label={`人类${d.className}装备剪影`}/>} />:<div className="identity-paperdoll" role="img" aria-label={`${d.raceName}${d.className}身份卡`}><strong>{d.raceName}</strong><span>{d.className}</span><small>当前 3D 换装仅提供人类模型</small></div>}</div>
    <div className="equipment-column equipment-right">{rightSlots.map(renderEquipment)}</div>
    <div className="weapon-slots">{weaponSlots.map(renderEquipment)}</div>
   </div>
   <div className="armory-vitals"><Bar value={s.hp} max={d.stats.maxHp} label="生命"/>{resource.max>0&&<Bar value={resource.value} max={resource.max} label={resource.name} tone={resourceTone}/>}</div>
   <div className="armory-stat-columns"><section><h3>基本属性</h3><dl>{[['力量',d.stats.str],['敏捷',d.stats.agi],['耐力',d.stats.sta],['智力',d.stats.int],['精神',d.stats.spi]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section><h3>战斗属性</h3><dl>{[['护甲',d.stats.armor],['攻击强度',d.stats.attackPower],['法术强度',d.stats.spellPower],['法术暴击',(d.stats.spellCrit*100).toFixed(2)+'%'],['治疗加成',d.stats.healing]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
  </section>
  <div className="armory-inventory">
   <section className="classic-frame backpack-panel" aria-label="背包">
    <header className="classic-title"><Icon src="/icons/assets/inv_misc_bag_01.png" name="背包" size={36}/><div><h2>背包</h2><p>全部物品</p></div><span className={'bag-capacity '+(bag.length>=d.bagCapacity?'bag-full':'')}>{bag.length} / {d.bagCapacity} 格</span></header>
    <div className="bag-bar"><span className="bag-container default-backpack" title="行囊 · 16 格"><Backpack size={25}/><small>16</small></span>{Array.from({length:4},(_,index)=>{const instance=bags[index],item=instance?d.items[instance.id]:undefined;return <span key={index} className={'bag-container '+(!item?'empty-container':'')} title={item?`${item.name} · ${item.bagSlots} 格`:'背包栏位 '+(index+1)+' · 未装备'} aria-label={item?`${item.name} · ${item.bagSlots} 格`:'空背包栏位 '+(index+1)}>{item?<><Icon src={item.icon} name={item.name} size={36}/><small>{item.bagSlots}</small></>:<Backpack size={23} strokeWidth={1}/>}</span>})}<span className="bag-free">剩余 <b>{Math.max(0,d.bagCapacity-bag.length)}</b> 格</span></div>
    <div className="inventory-tools"><button className="classic-button secondary" disabled={!canAct} onClick={()=>send({type:'sortBag'})}>一键整理</button><button className="classic-button secondary" disabled={!canAct||!d.shop.length||!bag.some(i=>d.items[i.id]?.quality===0&&!d.inventoryActions?.[i.uid]?.protected)} onClick={()=>send({type:'sellJunk'})}>一键售卖灰色垃圾</button><button className="classic-button secondary" disabled={!canAct||!d.disenchantable?.length} onClick={()=>send({type:'disenchantAll'})}>一键分解（{d.disenchantable?.length||0}）</button></div><div className="bag-grid" aria-label="背包物品格">{Array.from({length:d.bagCapacity},(_,index)=>{const instance=bag[index];return <ItemSlot key={instance?.uid||'empty-'+index} instance={instance} item={instance?d.items[instance.id]:undefined} label={'背包第 '+(index+1)+' 格'} selected={selected===instance?.uid} onSelect={setSelected} use={d.itemUses?.[instance?.uid||'']} busy={busy} onUse={uid=>send({type:'useItem',uid})}/>})}</div>
    <div className="bag-footer"><span>点击消耗品使用 · 装备点击查看详情</span><span className="coin-wallet" aria-label={money(s.money)}>{[[Math.floor(s.money/10000),'gold'],[Math.floor(s.money%10000/100),'silver'],[s.money%100,'copper']].map(([count,tone])=><span key={tone}>{count}<i className={'coin '+tone}/></span>)}</span></div>
   </section>
   <section className={'classic-frame selected-item'+(chosen&&chosenItem?' has-selection':'')} aria-label="物品详情" aria-live="polite">
    {chosen&&chosenItem?<><div className="selected-item-heading"><Icon src={chosenItem.icon} name={chosenItem.name} size={44}/><span>{equipped?'已装备':inBag?'背包物品':'待拾取'}</span><button className="item-detail-close" aria-label="关闭物品详情" onClick={()=>setSelected(null)}>×</button></div><ItemFacts item={chosenItem} instance={chosen}/>{inBag&&chosenItem.slot>0&&!chosenItem.bagSlots&&equipAction?.equipBlockedReason&&<p className="item-broken">{equipAction.equipBlockedReason}</p>}{inBag&&d.itemUses?.[chosen.uid]&&<span className="item-use-note">{d.itemUses[chosen.uid].description}{d.itemUses[chosen.uid].reason?` · ${d.itemUses[chosen.uid].reason}`:''}</span>}{inBag&&<div className="item-actions">{d.itemUses?.[chosen.uid]&&<button className="classic-button" disabled={busy||!d.itemUses[chosen.uid].canUse} title={d.itemUses[chosen.uid].reason||undefined} onClick={()=>send({type:'useItem',uid:chosen.uid})}>{d.itemUses[chosen.uid].label}</button>}<button className="classic-button secondary" disabled={!canAct} onClick={()=>send({type:'lockItem',uid:chosen.uid})}>{chosen.locked?'解锁物品':'锁定物品'}</button>{d.inventoryActions?.[chosen.uid]?.tradable&&<button className="classic-button secondary" disabled={!canAct||!!s.dungeon} onClick={()=>send({type:'auctionSell',uid:chosen.uid})}>拍卖快捷上架 · 净得 {money(Math.floor(d.inventoryActions[chosen.uid].quote.sell*chosen.count*.95))}</button>}{d.disenchantable?.includes(chosen.uid)&&<button className="classic-button secondary" disabled={!canAct} onClick={()=>send({type:'disenchant',uid:chosen.uid})}>分解</button>}{!!d.bandages?.[chosen.id]&&<button className="classic-button secondary" disabled={!canAct||!!chosen.locked} onClick={()=>send({type:'useBandage',id:chosen.id})}>使用绷带</button>}{chosenItem.slot>0&&<button className="classic-button" disabled={!canAct||(!chosenItem.bagSlots&&!equipAction?.equippable)||(chosenItem.bagSlots>0&&bags.length>=4&&bags.every(i=>d.items[i.id].bagSlots>=chosenItem.bagSlots))} onClick={()=>send({type:chosenItem.bagSlots?'equipBag':'equip',uid:chosen.uid})}>{chosenItem.bagSlots?(bags.length>=4?'替换最小背包':'装备背包'):'装备'}</button>}{chosenItem.class===2&&[13,22].includes(chosenItem.slot)&&s.learned.includes(674)&&<button className="classic-button" disabled={!canAct||!equipAction?.equippable||d.items[equipment[16]?.id]?.slot===17} onClick={()=>send({type:'equip',uid:chosen.uid,slot:17})}>装备副手</button>}{d.itemUses?.[chosen.uid]?.label==='涂抹主手'&&s.equipment[17]&&<button className="classic-button" disabled={!canAct} onClick={()=>send({type:'useItem',uid:chosen.uid,slot:17})}>涂抹副手</button>}{d.shop.length>0&&chosenItem.sell>0&&<button className="classic-button secondary" disabled={!canAct||!!s.dungeon||d.inventoryActions?.[chosen.uid]?.protected} onClick={()=>send({type:'sell',uid:chosen.uid})}>出售{chosen.count>1?'整组':''} · {money(chosenItem.sell*chosen.count)}</button>}</div>}{(equipped||inBag)&&chosenItem.slot>0&&<div className="enchant-controls"><select aria-label="选择附魔羊皮纸" value={scroll} onChange={e=>setScroll(e.target.value)}><option value="">选择适用的附魔羊皮纸</option>{bag.filter(i=>!i.locked&&d.items[i.id]?.enchant&&enchantFits(d.enchants[d.items[i.id].enchant],{class:chosenItem.class,subclass:chosenItem.subclass,InventoryType:chosenItem.slot},({20:5,17:16,13:16,21:16,22:17,23:17,14:17,15:18,25:18,26:18,16:15} as Record<number,number>)[chosenItem.slot]||chosenItem.slot)).map(i=><option key={i.uid} value={i.id}>{d.items[i.id].name} ×{i.count}</option>)}</select><button className="classic-button secondary" disabled={!canAct||!scroll||!!chosen.locked} onClick={()=>send({type:'applyEnchant',id:Number(scroll),uid:chosen.uid})}>应用附魔（替换已有附魔）</button></div>}</>:<div className="item-selection-hint"><Sword size={27} strokeWidth={1}/><h3>装备与物品</h3><p>选择装备槽或背包中的物品，查看属性与可用操作。</p></div>}
   </section>
   {pending.length>0&&<section className="classic-frame pending-loot"><header className="classic-title"><h3>待拾取战利品</h3><span>{pending.length} 件</span></header><div className="bag-grid">{pending.map(instance=><ItemSlot key={instance.uid} instance={instance} item={d.items[instance.id]} label="待拾取" selected={selected===instance.uid} onSelect={setSelected}/>)}</div><div className="pending-actions"><p>腾出背包空间后领取，战利品不会被自动丢弃。</p><button className="classic-button" disabled={!canAct} onClick={()=>send({type:'loot'})}>拾取战利品</button></div></section>}
   <div className="armory-supplies" aria-label="补给操作">{s.classId===8&&<><button className="classic-button secondary" disabled={!canAct} onClick={()=>send({type:'conjure',water:true})}>制造饮水</button><button className="classic-button secondary" disabled={!canAct} onClick={()=>send({type:'conjure',water:false})}>制造食物</button></>}<button className="classic-button secondary" disabled={busy||!!s.combat||!['idle','dead','hunt'].includes(s.activity.type)} onClick={()=>send({type:'rest'})}>坐下恢复</button></div>
  </div>
 </div>;
}
