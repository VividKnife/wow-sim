"use client";
import {useState} from 'react';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import GuildRaid from './guild-raid';
import GoldRaid from './gold-raid';
import type {GameProps} from './game-ui';
import './dungeon-page.css';
import './pvp.css';

export default function RaidPage(props:GameProps&{onObserve:()=>void}){
 const [mode,setMode]=useState('guild');
 const d=props.data;
 if(d.goldRaid?.active)return <GoldRaid {...props}/>;
 if(d.guildRaid?.active)return <GuildRaid {...props}/>;
 return <Tabs value={mode} onValueChange={setMode} className="dungeon-page">
  <header className="dungeon-page-intro"><div><h1>团队副本</h1><p>60 级 · 25 人。带上五人小队，招募二十名团员。</p></div></header>
  <TabsList className="pvp-modes" aria-label="团队副本模式">
   <TabsTrigger value="guild"><span><strong>公会团</strong><small>组建阵容 · 挑战首领</small></span></TabsTrigger>
   <TabsTrigger value="gold"><span><strong>金团</strong><small>装备竞拍 · 按贡献分金</small></span></TabsTrigger>
  </TabsList>
  <TabsContent value="guild"><GuildRaid {...props}/></TabsContent>
  <TabsContent value="gold"><GoldRaid {...props}/></TabsContent>
 </Tabs>;
}
