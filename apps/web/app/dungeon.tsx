"use client";
import {Button} from '@/components/ui/button';
import {Bar,Icon,GameProps,duration} from './game-ui';

export function RecoveryControls({state:s,data:d,busy,send}:GameProps){
 const r=d.recovery;if(!r)return null;
 return <section className="recovery-controls" aria-label="小队恢复">
  <div className="section-heading"><h3>休整与补给</h3><small>食物 {r.food} · 饮水 {r.water}</small></div>
  <div className="action-row">
   <Button variant="outline" disabled={busy||!r.canRest} onClick={()=>send({type:'rest'})}>{s.dungeon?'小队坐下恢复':'坐下恢复'}</Button>
   <Button variant="outline" disabled={busy||!r.canConjureWater} onClick={()=>send({type:'conjure',water:true})}>制造饮水</Button>
   <Button variant="outline" disabled={busy||!r.canConjureFood} onClick={()=>send({type:'conjure',water:false})}>制造食物</Button>
  </div>
  <p className="footnote">{s.dungeon?'每名成员单独消耗背包中的补给；恢复结束后再继续推进。':'可在法师训练师处学习造餐术与造水术。'}</p>
  {r.fallen.length>0&&<div className="fallen-members"><h3>倒下的成员</h3>{r.fallen.map((c:any)=><div key={c.id} className="recovery-target"><div className="grow"><strong>{c.name}</strong>{!c.canResurrect&&<small>{c.reason}</small>}</div><Button variant="outline" disabled={busy||!c.canResurrect} onClick={()=>send({type:'resurrect',target:c.id})}>牧师复活</Button></div>)}
   <Button variant="outline" disabled={busy||!r.canRevive} onClick={()=>send({type:'revive'})}>倒下成员返回尸体</Button>
  </div>}
 </section>;
}

export default function Dungeon(props:GameProps){
 const {state:s,data:d,busy,send}=props,dm=d.dungeon;if(!dm)return null;
 if(!dm.active)return <section className="panel dungeon-entry" aria-label="死亡矿井入口">
  <div className="section-heading"><div><div className="eyebrow">西部荒野 · 五人地下城</div><h2>死亡矿井</h2></div><span className="dungeon-sigil" aria-hidden="true">⚔</span></div>
  <p>矿道深处，迪菲亚兄弟会正在建造一艘战舰。召集坦克、治疗和输出队友，深入矿井寻找范克里夫。</p>
  <div className="dungeon-requirements"><span>最低等级 {dm.minimumLevel}</span><span>建议 18—20 级挑战</span><span>小队 {s.party.length+1} / 5 人</span></div>
  {dm.saved&&<p className="dungeon-notice">已保存路线进度 {dm.progress} / {dm.total}；再次进入会接续本次冒险。</p>}
  {dm.saved&&<details className="dungeon-notice"><summary>重新挑战副本</summary><p>重置会清除本次路线、怪物和机关进度。已获得的装备及任务进度保留；下次进入从头开始。每小时最多进入五个新副本。</p><Button variant="outline" disabled={busy||!dm.canReset} onClick={()=>send({type:'resetDungeon'})}>清除旧路线并重置</Button>{dm.resetReason&&<p>{dm.resetReason}</p>}</details>}
  <div className="action-row">{dm.atEntrance?<Button disabled={busy||!dm.canEnter} onClick={()=>send({type:'enterDungeon'})}>{dm.saved?'重返死亡矿井':'进入死亡矿井'}</Button>:<Button variant="outline" disabled={busy||!!s.combat||!['idle','hunt'].includes(s.activity.type)||s.hp<=0} onClick={()=>send({type:'travel',to:'deadmines'})}>前往死亡矿井入口</Button>}</div>
  {dm.entryReason&&<p className="footnote">{dm.entryReason}</p>}
  <p className="footnote">副本逐场推进。离开页面时暂停，返回后继续；野外自动狩猎保持独立。</p>
  {dm.atEntrance&&d.recovery.fallen.length>0&&<RecoveryControls {...props}/>}
 </section>;

 const current=dm.current,progress=Math.min(100,dm.progress/dm.total*100);
 const activityLabels:Record<string,string>={dungeonCannon:'火炮已经点燃',resurrect:'牧师正在复活队友',revive:'倒下成员正在返回尸体',conjure:'正在制造补给'};
 return <section className="dungeon-expedition" aria-label="死亡矿井副本">
  <header className="panel dungeon-header"><div className="section-heading"><div><div className="eyebrow">五人地下城 · 当前冒险</div><h1>死亡矿井</h1></div><Button variant="outline" disabled={busy||!dm.canLeave} onClick={()=>send({type:'leaveDungeon'})}>离开副本</Button></div>
   <div className="section-heading"><span>{dm.completed?'路线已完成':`路线进度 ${dm.progress} / ${dm.total}`}</span><small>退出保留进度</small></div>
   <div className="dungeon-progress" role="progressbar" aria-label="副本路线进度" aria-valuemin={0} aria-valuemax={dm.total} aria-valuenow={dm.progress}><i style={{width:progress+'%'}}/></div>
   <p className="footnote">离开页面时副本暂停；每场战斗结束后可以休整、分配装备，再继续前进。</p>
  </header>
  <div className="dungeon-columns"><section className="panel dungeon-encounter">
   {current?<><div className="eyebrow">{current.kind==='boss'?'首领遭遇':current.interaction&&!current.enemies.length?'机关交互':'前方路线'}{current.optional?' · 可选':''}</div><h2>{current.name}</h2>
    <ul className="encounter-enemies">{current.enemies.map((e:any)=><li key={e.entry+'-'+e.level}><strong>{e.name}</strong><span>Lv.{e.level}{e.elite?' 精英':''} × {e.count}</span></li>)}</ul>
    {s.combat?<p className="dungeon-notice">战斗进行中。可在上方打开战斗界面查看小队行动。</p>:activityLabels[s.activity.type]?<p className="dungeon-notice" role="status">{activityLabels[s.activity.type]} · {duration(s.activity.endsAt-s.clock)}</p>:<>
     {current.interaction&&!current.enemies.length?<><div className="dungeon-object"><Icon src={dm.interactionIcon} name="迪菲亚火药"/><div><h3>{dm.interactionLabel}</h3><p>{current.id==='dm-cannon'?'使用一份迪菲亚火药轰开铁门。':'守卫已清除，从火药箱中取出火药。'}</p></div></div><Button disabled={busy||!dm.canInteract} onClick={()=>send({type:'dungeonInteract'})}>{dm.interactionLabel}</Button>{!dm.canInteract&&<p className="footnote">{dm.interactionReason}</p>}</>:<><Button disabled={busy||!dm.canNext} onClick={()=>send({type:'dungeonNext'})}>{current.enemies.length?'推进并迎战':'继续探索'}</Button>{!dm.canNext&&<p className="footnote">{dm.nextReason}</p>}</>}
     {dm.canSkip&&<Button variant="ghost" disabled={busy} onClick={()=>send({type:'dungeonSkip'})}>绕过这段可选路线</Button>}
    </>}
   </>:<><div className="eyebrow">矿井旅程</div><h2>路线已完成</h2><p>整理战利品，离开矿井后回到任务人物处交付任务。</p></>}
   {s.activity.reason&&<p className="dungeon-notice" role="status">{s.activity.reason}</p>}
   {(s.pending.length>0||s.bag.length>=d.bagCapacity)&&<p className="dungeon-notice">背包需要整理。到「角色」装备新物品或拾取待领取战利品；也可离开副本后找商人出售。</p>}
   <RecoveryControls {...props}/>
  </section>
  <section className="panel dungeon-party"><div className="section-heading"><h2>小队状态</h2><small>5 人</small></div>{d.recovery.members.map((c:any)=><article key={c.id} className={'dungeon-member '+(c.hp<=0?'is-fallen':'')}><div className="section-heading"><strong>{c.name} <small>Lv.{c.level}</small></strong><small>{c.hp<=0?'已倒下':c.restUntil>s.clock?'休整 '+duration(c.restUntil-s.clock):c.role}</small></div><Bar label="生命" value={c.hp} max={c.maxHp}/>{c.maxMana>0&&<Bar label="法力" value={c.mana} max={c.maxMana} tone="mana"/>}</article>)}</section></div>
  <details className="panel dungeon-route"><summary>查看完整路线 · {dm.progress} / {dm.total}</summary><ol>{dm.route.map((r:any)=><li key={r.id} className={'route-'+r.status} aria-current={r.status==='current'?'step':undefined}><span>{r.name}{r.optional?' · 可选':''}</span><small>{{cleared:'已完成',skipped:'已绕过',current:'当前',ahead:'未探索'}[r.status as string]}</small></li>)}</ol></details>
 </section>;
}
