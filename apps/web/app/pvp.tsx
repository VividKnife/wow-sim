import {useState} from 'react';
import {lazy,Suspense} from 'react';
import {Flag,Swords} from 'lucide-react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import type {GameProps} from './game-ui';
import './pvp.css';

const Battleground=lazy(()=>import('./battleground'));
const Arena=lazy(()=>import('./arena'));

export default function Pvp(props:GameProps){
 const [mode,setMode]=useState(['preparing','countdown','combat'].includes(props.data.arena?.match?.phase)?'arena':'battleground');
 return <Tabs value={mode} onValueChange={setMode} className="pvp-page">
  <header className="pvp-heading"><h1>战场与竞技场</h1><p>对手为 NPC 战队。完成战前部署后，由你开始战斗。</p></header>
  <TabsList className="pvp-modes" aria-label="PVP 玩法">
   <TabsTrigger value="battleground"><Flag size={19}/><span><strong>战场</strong><small>20级开放 · 10v10 夺旗</small></span></TabsTrigger>
   <TabsTrigger value="arena"><Swords size={19}/><span><strong>竞技场</strong><small>60级开放 · 小队竞技</small></span></TabsTrigger>
  </TabsList>
  <TabsContent value="battleground"><Suspense fallback={<p role="status">正在加载界面…</p>}><Battleground {...props}/></Suspense></TabsContent>
  <TabsContent value="arena"><Suspense fallback={<p role="status">正在加载界面…</p>}><Arena {...props}/></Suspense></TabsContent>
 </Tabs>;
}
