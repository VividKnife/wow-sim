"use client";
import {Button} from '@/components/ui/button';
import {GameProps} from './game-ui';
import Dungeon from './dungeon';
import './dungeon-page.css';

export default function DungeonPage(props:GameProps&{onOpenParty:()=>void;onConfigure:()=>void}){
 const {state:s,data:d,onOpenParty,onConfigure}=props;
 const members=d.recovery?.members||[],roles=d.strategyMembers||[];
 const hasRole=(role:string)=>roles.some((member:any)=>member.role===role);
 return <div className="dungeon-page">
  <header className="panel dungeon-page-intro"><div><div className="eyebrow">小队冒险 · 经典旧世</div><h1>地下城</h1><p>集结队友，准备补给，向矿井深处进发。</p></div><span className="dungeon-page-status">{s.dungeon?'副本进行中':'出发前准备'}</span></header>
  {!s.dungeon&&<section className="panel" aria-label="地下城准备"><div className="section-heading"><h2>出发检查</h2><small>建议搭配坦克、治疗与输出</small></div><div className="dungeon-preparation">
   <div><small>小队成员</small><strong>{members.length||s.party.length+1} / 5 人</strong><Button variant="outline" onClick={onOpenParty}>管理队伍</Button></div>
   <div><small>战斗配置</small><strong>{hasRole('tank')?'坦克已就位':'建议配置坦克'} · {hasRole('healer')?'治疗已就位':'建议配置治疗'}</strong><Button variant="outline" onClick={onConfigure}>配置角色天赋与策略</Button></div>
   <div><small>共享补给</small><strong>食物 {d.recovery?.food??0} · 饮水 {d.recovery?.water??0}</strong><span>倒下成员 {members.filter((member:any)=>member.hp<=0).length} 人</span></div>
  </div></section>}
  {d.dungeon?<Dungeon {...props}/>:<section className="panel"><p>地下城信息暂不可用，请稍后重试。</p></section>}
 </div>;
}
