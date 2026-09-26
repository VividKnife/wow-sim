"use client";
import GoldRaid from './gold-raid';
import type {GameProps} from './game-ui';
export default function RaidPage(props:GameProps&{onObserve:()=>void}){return <GoldRaid {...props}/>;}
