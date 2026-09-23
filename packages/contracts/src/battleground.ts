export type BattlegroundPoint={id:string;name:string;x:number;y:number};
export type BattlegroundOrder={task:string;route:string;pointId:string};
export type BattlegroundScore={kills:number;deaths:number;damage:number;healing:number;captures:number;returns:number};
export type BattlegroundMember={
 id:string;sourceId:string;name:string;classId:number;className:string;level:number;role:string;side:number;number:number;
 hp:number;maxHp:number;mana:number;maxMana:number;x:number;y:number;node:string;edge:string|null;order:BattlegroundOrder;
 stunnedUntil:number;respawnAt:number;intent:string;cast:{name:string;targetId:string;until:number}|null;score:BattlegroundScore;
};
export type BattlegroundFlag={side:number;status:'base'|'carried'|'dropped'|'resetting';carrierId:string|null;x:number;y:number;returnAt:number};
export type BattlegroundBuff={id:string;node:string;kind:string;name:string;readyAt?:number};
export type BattlegroundMap={
 id:string;name:string;nodes:BattlegroundPoint[];edges:string[][];walls:{x:number;y:number;w:number;h:number}[];
 teams:{name:string;color:string;base:string;graveyard:string;safe:string}[];buffs:BattlegroundBuff[];
};
export type BattlegroundMatch={
 id:string;phase:'preparing'|'countdown'|'combat'|'finished';clock:number;startedAt:number;revision:number;
 score:number[];flags:BattlegroundFlag[];flagResetAt:number;pressure:number;resurrectionInMs:number;
 result:{winner:number;reason:string;durationMs:number;score:number[]}|null;
 teams:{name:string;color:string;members:BattlegroundMember[]}[];buffs:BattlegroundBuff[];
 effects:{from:string;to:string;kind:string;until:number}[];events:{id:number;at:number;text:string;kind:string}[];
};
export type BattlegroundView={
 unlocked:boolean;blockedReason:string;map:BattlegroundMap;record:{played:number;won:number;captures:number};
 orders:{id:string;name:string;short:string;description:string}[];routes:{id:string;name:string}[];match:BattlegroundMatch|null;
};
