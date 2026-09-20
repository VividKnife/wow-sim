'use client';
import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {classOptions,classesForRace,raceOptions} from './class-options.js';
import styles from './saves.module.css';
import CreationModel from './creation-model';
import CharacterSelection from './character-selection';
import {racialTraits} from '../../../packages/game-data/racial-traits.js';

type Save={id:string;name:string;classId:number;raceId:number;level:number;location:string;lastSeenAt:number};
type Position=[number,number];

const racePortraits:Record<number,Position>={1:[0,0],2:[3,1],3:[1,0],4:[3,0],5:[1,1],6:[0,1],7:[2,0],8:[2,1]};
const classPortraits:Record<number,Position>={1:[0,0],8:[1,0],4:[2,0],11:[3,0],3:[0,1],7:[1,1],5:[2,1],9:[3,1],2:[0,2]};
const raceDetails:Record<number,{zone:string;background:string;summary:string}>={
 1:{zone:'艾尔文森林',background:'/maps/elwynn-classic.jpg',summary:'坚韧而多才的人类在暴风城旗帜下重建家园。'},
 2:{zone:'杜隆塔尔',background:'/maps/durotar-classic.jpg',summary:'兽人以力量与荣耀为誓，在严酷荒原中建立新的部落。'},
 3:{zone:'丹莫罗',background:'/maps/dun-morogh-classic.jpg',summary:'铁炉堡的矮人坚毅勇猛，热衷探索世界深处的秘密。'},
 4:{zone:'泰达希尔',background:'/maps/teldrassil-classic.jpg',summary:'古老的暗夜精灵守护自然，在月神恩泽下重返战场。'},
 5:{zone:'提瑞斯法林地',background:'/maps/tirisfal-glades-classic.jpg',summary:'被遗忘者挣脱巫妖王的控制，为自由与复仇而战。'},
 6:{zone:'莫高雷',background:'/maps/mulgore-classic.jpg',summary:'崇敬大地母亲的牛头人，是兼具力量与智慧的守护者。'},
 7:{zone:'丹莫罗',background:'/maps/dun-morogh-classic.jpg',summary:'聪慧大胆的侏儒以发明与奥术弥补身形上的不足。'},
 8:{zone:'杜隆塔尔',background:'/maps/durotar-classic.jpg',summary:'暗矛巨魔敏捷而坚韧，与部落盟友一同寻找新的命运。'},
};
const classDetails:Record<number,{role:string;summary:string}>={
 1:{role:'坦克 · 近战伤害',summary:'精通各类武器与护甲，以怒气发动猛烈攻击。'},
 2:{role:'坦克 · 治疗 · 近战伤害',summary:'圣光的勇士，能保护盟友并惩戒邪恶。'},
 3:{role:'远程伤害',summary:'荒野追踪者，以远程武器和野兽伙伴狩猎敌人。'},
 4:{role:'近战伤害',summary:'潜伏于阴影之中，以连击点和毒药终结目标。'},
 5:{role:'治疗 · 远程伤害',summary:'运用神圣与暗影之力治疗盟友或摧毁敌人。'},
 7:{role:'治疗 · 近战/远程伤害',summary:'召唤元素之力，以图腾支援整个队伍。'},
 8:{role:'远程伤害',summary:'操纵奥术、火焰与冰霜，拥有强大的爆发能力。'},
 9:{role:'远程伤害',summary:'驾驭暗影魔法，召唤恶魔并持续削弱敌人。'},
 11:{role:'坦克 · 治疗 · 伤害',summary:'自然的守护者，可变换形态适应不同战斗职责。'},
};

function AtlasIcon({position,kind}: {position:Position;kind:'race'|'class'}){
 const style={'--atlas-x':`${-position[0]*64}px`,'--atlas-y':`${-position[1]*64}px`} as CSSProperties;
 return <span aria-hidden="true" className={`${styles.atlasIcon} ${kind==='race'?styles.raceIcon:styles.classIcon}`} style={style}/>;
}

export default function Saves(){
 const [saves,setSaves]=useState<Save[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [name,setName]=useState(''),[classId,setClassId]=useState(8),[raceId,setRaceId]=useState(1),[boost,setBoost]=useState(false);
 const [requestId,setRequestId]=useState(''),[showSelection,setShowSelection]=useState(true),[reload,setReload]=useState(0);
 const selectedRace=raceOptions.find(r=>r.id===raceId)!,selectedClass=classOptions.find(c=>c.id===classId)!;
 const availableClasses=useMemo(()=>classesForRace(raceId),[raceId]);
 useEffect(()=>{let active=true;fetch('/api/saves').then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取角色');if(active)setSaves(data.saves);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'连接失败，请重试');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[reload]);
 const chooseRace=(id:number)=>{setRaceId(id);if(!classOptions.find(c=>c.id===classId)?.races.includes(id))setClassId(classesForRace(id)[0].id);setRequestId('');};
 const sceneStyle={'--scene-image':`url(${raceDetails[raceId].background})`} as CSSProperties;
 if(showSelection)return <CharacterSelection saves={saves} loading={loading} error={error} onCreate={()=>{setError('');setShowSelection(false);}} onReload={()=>{setError('');setLoading(true);setReload(n=>n+1);}} onDelete={async save=>{const response=await fetch(`/api/saves?saveId=${encodeURIComponent(save.id)}`,{method:'DELETE'});const data=await response.json();if(!response.ok)throw new Error(data.error||'删除失败');setSaves(current=>current.filter(s=>s.id!==save.id));}}/>;
 return <main className={styles.shell} style={sceneStyle}>
  <div className={styles.sceneShade}/><div className={styles.sceneGlow}/>
  <header className={styles.topbar}><div className={styles.logo}><span>WORLD</span><strong>WOW SIM</strong><small>经典旧世</small></div><div className={styles.step}>创建角色</div><button type="button" className={styles.rosterToggle} onClick={()=>setShowSelection(true)}>角色列表 <b>{saves.length}/20</b></button></header>
  <form className={styles.creator} onChange={()=>setRequestId('')} onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const id=requestId||crypto.randomUUID();setRequestId(id);try{const response=await fetch('/api/saves',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:name.trim(),classId,raceId,boost,requestId:id})});const data=await response.json();if(!response.ok)throw new Error(data.error||'创建失败');window.location.assign(`/?saveId=${encodeURIComponent(data.id)}`);}catch(e){setError(e instanceof Error?e.message:'创建失败，请重试');setBusy(false);}}}>
   <fieldset className={styles.racePanel} disabled={busy||loading}><legend>种族</legend><div className={styles.factionLabels}><span>联盟</span><span>部落</span></div><div className={styles.optionGrid}>{[1,2,3,5,4,6,7,8].map(id=>raceOptions.find(r=>r.id===id)!).map(race=><button type="button" key={race.id} className={race.id===raceId?styles.selected:''} aria-pressed={race.id===raceId} onClick={()=>chooseRace(race.id)}><AtlasIcon kind="race" position={racePortraits[race.id]}/><span>{race.name}</span></button>)}</div><div className={styles.faction}><span className={selectedRace.faction==='Alliance'?styles.alliance:styles.horde} aria-hidden="true"/><div><strong>{selectedRace.faction==='Alliance'?'联盟':'部落'}</strong><small>{selectedRace.name}</small></div></div></fieldset>
   <section className={styles.hero}><div className={styles.modelStage}><CreationModel key={`${raceId}:${classId}:${boost}`} raceId={raceId} classId={classId} boost={boost} title={`${selectedRace.name}${selectedClass.name} 3D 创建预览`} fallback={<div className={styles.heroPortrait}><AtlasIcon kind="race" position={racePortraits[raceId]}/></div>}/></div><div className={styles.heroTitle}><small>{selectedRace.nameEn} · {selectedClass.nameEn}</small><h1>{selectedRace.name} {selectedClass.name}</h1><p>{raceDetails[raceId].summary}</p></div></section>
   <fieldset className={styles.classPanel} disabled={busy||loading}><legend><small>选择</small>职业</legend><div className={styles.optionGrid}>{classOptions.map(option=>{const available=availableClasses.some(c=>c.id===option.id);return <button type="button" key={option.id} disabled={!available} className={option.id===classId?styles.selected:''} aria-pressed={option.id===classId} title={available?option.name:'该种族无法选择此职业'} onClick={()=>{setClassId(option.id);setRequestId('');}}><AtlasIcon kind="class" position={classPortraits[option.id]}/><span>{option.name}</span></button>})}</div><div className={styles.classDescription}><strong>{selectedClass.name}</strong><span>{classDetails[classId].role}</span><p>{classDetails[classId].summary}</p></div></fieldset>
   <aside className={styles.descriptionPanel}><h2>{selectedRace.name}</h2><p>{raceDetails[raceId].summary}</p><section className={styles.racialTraits} aria-label={`${selectedRace.name}种族技能`}><h3>种族特长</h3><ul>{racialTraits({raceId}).map((trait:{name:string;description:string})=><li key={trait.name}><strong>{trait.name}</strong><p>{trait.description}</p></li>)}</ul></section><h3>{selectedClass.name}</h3><p>{classDetails[classId].summary}</p><dl><dt>阵营</dt><dd>{selectedRace.faction==='Alliance'?'联盟':'部落'}</dd><dt>战斗职责</dt><dd>{classDetails[classId].role}</dd><dt>起始地点</dt><dd>{boost?'闪金镇':'北郡'}</dd></dl><p className={styles.routeNote}>所有种族均从共享的北郡冒险路线启程。</p><div className={styles.startChoice} role="group" aria-label="起始等级"><button type="button" disabled={busy||loading} aria-pressed={!boost} className={!boost?styles.active:''} onClick={()=>{setBoost(false);setRequestId('');}}><b>等级 1</b><small>经典旅程</small></button><button type="button" disabled={busy||loading} aria-pressed={boost} className={boost?styles.active:''} onClick={()=>{setBoost(true);setRequestId('');}}><b>等级 20</b><small>额外 50G</small></button></div></aside>
   <footer className={styles.creationBar}><button type="button" className={styles.backButton} onClick={()=>setShowSelection(true)}>返回角色列表</button><label><span>角色名称</span><input disabled={busy||loading} value={name} onChange={e=>setName(e.target.value)} required maxLength={16} autoComplete="off" placeholder="输入角色名称"/></label><button className={styles.createButton} type="submit" disabled={busy||loading||!name.trim()||saves.length>=20}>{busy?'正在创建…':'创建角色'}</button></footer>
   {boost&&<div className={styles.boostCard}><div className={styles.coin}><span className={styles.coinIcon}/><strong>额外 50G</strong></div><p>20 级训练师技能 · 本职业任务装备 · 四个 14 格符文布背包 · 旅行棕马与骑术</p></div>}
  </form>
  {error&&<div className={styles.error} role="alert">{error}<button onClick={()=>setError('')} aria-label="关闭提示">×</button></div>}
  <div className={styles.hint}>选择种族与职业，输入名称后开始你的艾泽拉斯旅程</div>
 </main>;
}
