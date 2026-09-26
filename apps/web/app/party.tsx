"use client";
import AdventureHall from './adventure-hall';
import {RecoveryControls} from './dungeon';
import AmmoControls from './ammo-controls';
import type {GameProps} from './game-ui';
export default function Party(props:GameProps){
 return <div><AdventureHall {...props}/><details className="panel"><summary>小队补给</summary><RecoveryControls {...props}/><AmmoControls {...props}/></details></div>;
}
