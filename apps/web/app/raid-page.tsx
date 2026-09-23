'use client';
import GuildRaid from './guild-raid';
import GoldRaid from './gold-raid';
import type {GameProps} from './game-ui';
export default function RaidPage(props:GameProps&{onObserve:()=>void}){
 const d=props.data;
 if(d.goldRaid?.active)return <GoldRaid {...props}/>;
 if(d.guildRaid?.active)return <GuildRaid {...props}/>;
 return <div className="dungeon-page"><header className="panel"><div className="eyebrow">RAID COMMAND / 团长席位</div><h1>团队远征</h1><p>带领核心五人与二十名战友：分配职责，预留关键技能，复盘每一次尝试。</p></header><GuildRaid {...props}/><GoldRaid {...props}/></div>;
}
