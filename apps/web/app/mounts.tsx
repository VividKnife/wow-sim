"use client";
import {Button} from '@/components/ui/button';
import {GameProps,money,duration} from './game-ui';
import './mounts.css';

type Mount={id:number;name:string;level:number;bonus:number;price:number;tone:string;owned:boolean;canBuy:boolean;purchaseReason:string;canMount:boolean;reason:string};

export default function Mounts({state:s,data:d,busy,send}:GameProps){
 const m=d.mounts;if(!m)return null;
 const casting=s.activity.type==='mount',collection:Mount[]=m.collection;
 const owned=collection.filter(h=>h.owned),ready=owned.find(h=>h.canMount);
 const canTravel=!busy&&!s.dungeon&&!s.escort&&!s.combat&&s.hp>0&&['idle','hunt'].includes(s.activity.type);
 const status=casting?'正在上马':m.active?`${m.activeName} · 移动速度 +${m.speedBonus}%`:owned.length?`已拥有 ${owned.length} 匹坐骑`:s.level<m.level?`${m.level} 级解锁骑乘`:'前往东谷学习骑术';
 return <section className="panel mounts-panel" aria-label="坐骑">
  <div className="mounts-heading">
   <span className={'mounts-emblem '+(m.active?'is-riding':'')} aria-hidden="true">♞</span>
   <div className="grow"><strong>坐骑</strong><small role="status">{status}</small></div>
   {casting?<Button variant="outline" disabled={busy} onClick={()=>send({type:'stop'})}>取消上马</Button>:m.active?<Button variant="outline" disabled={busy||!m.canDismount} title={m.dismountReason||'收起坐骑'} onClick={()=>send({type:'dismount'})}>下马</Button>:ready?<Button disabled={busy} onClick={()=>send({type:'mount',id:ready.id})}>骑乘{ready.name}</Button>:null}
  </div>
  {casting&&<p className="footnote">召唤{collection.find(h=>h.id===s.activity.mount)?.name} · 剩余 {duration(s.activity.endsAt-s.clock)}</p>}
  <details className="mounts-collection">
   <summary>马匹收藏与骑术 <span>{owned.length} / {collection.length}</span></summary>
   <div className="mounts-training">
    <div className="grow"><strong>马匹骑术 <span>{m.trained?'已学会':`${m.level} 级可学`}</span></strong><p>{m.trained?'已解锁马匹骑乘，可在下方选择坐骑。':`训练费用 ${money(m.trainingPrice)} · ${m.serviceName}`}</p>{!m.trained&&<small>{m.trainingReason}</small>}</div>
    {!m.trained&&<Button variant="outline" disabled={busy||!m.canTrain} title={m.trainingReason||'学习马匹骑术'} onClick={()=>send({type:'trainRiding'})}>学习骑术</Button>}
    {s.location!==m.serviceLocation&&!s.dungeon&&<Button variant="outline" disabled={!canTravel} onClick={()=>send({type:'travel',to:m.serviceLocation})}>前往东谷</Button>}
   </div>
   <div className="mounts-grid">
    {collection.map(h=>{const active=m.active===h.id,reason=h.owned?h.reason:h.purchaseReason;return <article key={h.id} className={'mount-card '+(active?'mount-active':'')}>
     <div className={'mount-portrait mount-tone-'+h.tone} aria-hidden="true"><span>♞</span><b>+{h.bonus}%</b></div>
     <div className="mount-card-body"><div className="mount-card-title"><strong>{h.name}</strong>{h.owned&&<span>{active?'骑乘中':'已拥有'}</span>}</div>
      <p>{h.level} 级 · 移速 +{h.bonus}%{!h.owned?` · ${money(h.price)}`:''}</p>
      <small className="mount-requirement">{active?'户外旅行加速，进入受限路段自动下马。':reason|| (h.owned?'3 秒召唤，骑乘后出发即可加速。':'可向东谷的凯蒂·亨特购买。')}</small>
      <Button variant={active?'secondary':'outline'} disabled={busy||casting||(h.owned?(active?!m.canDismount:!h.canMount):!h.canBuy)} title={active?m.dismountReason:reason} onClick={()=>send(active?{type:'dismount'}:h.owned?{type:'mount',id:h.id}:{type:'buyMount',id:h.id})}>{active?'下马':h.owned?'骑乘':'购买坐骑'}</Button>
     </div>
    </article>;})}
   </div>
   <p className="footnote">普通马在 20 级解锁，迅捷马需要 60 级。东谷出售的马匹仅供联盟骑乘，非人类角色需暴风城声望崇拜；测试礼包赠送的旅行棕马不限种族与声望。</p>
  </details>
 </section>;
}
