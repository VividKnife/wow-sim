export type BattlePoint={x:number;y:number};
export type BattleArea={minX:number;maxX:number;minY:number;maxY:number;name?:string};
export type BattleLayout={units:Record<string,{left:number;top:number}>;scale:number;scaleY:number;originX:number;originY:number;width:number;height:number;zoom:number;area?:BattleArea|null};
export type BattleCast={spell:number;startedAt:number;until:number;target?:string;school?:number;channel?:boolean;center?:BattlePoint};
export type BattleUnitData={id:string;name:string;hp:number;maxHp:number;classId?:number;creatureType?:number;rank?:number;form?:string;kind?:string;foe?:boolean;removed?:boolean;petUnit?:boolean;totemUnit?:boolean;cast?:BattleCast;swing?:number;target?:string;polyUntil?:number;visual?:{kind?:string;src?:string;species?:string;creatureType?:number}};
export type BattleSkill={spellId:number;name:string;school?:number;icon?:string};
export type BattleEffect={id:string|number;kind:string;shownAt:number;actorId?:string;targetId?:string;spellId?:number;school?:number;amount?:number;periodic?:boolean;critical?:boolean;center?:BattlePoint;radius?:number};
export type BattleProjectile={id:string|number;spellId?:number;spell?:number;actorId?:string;targetId?:string;from:BattlePoint;to:BattlePoint;startedAt:number;landsAt:number;school?:number};
export type BattleGroundEffect={id?:string|number;spellId?:number;spell?:number;actorId?:string;startedAt?:number;until:number;center:BattlePoint;radius?:number;school?:number};
export type BattleScene={
 encounterId?:string;live?:boolean;sampledAt?:number;endClock?:number;ground?:string;
 layout:BattleLayout;units:BattleUnitData[];projectiles:BattleProjectile[];effects:BattleEffect[];groundEffects:BattleGroundEffect[];
 clock:number;selectedId:string;range:number;lowEffects:boolean;reducedMotion:boolean;
};
