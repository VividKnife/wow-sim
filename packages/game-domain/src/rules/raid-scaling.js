import reference from '../../../game-data/data/raid-combat-reference.json' with {type:'json'};

export const raidScaling=Object.freeze({sourcePlayers:40,targetPlayers:25,health:25/40,meleeDamage:1,encounterLimitMs:15*60*1000});
const templates=new Map(reference.tables.creature_template.map(r=>[r.Entry,r]));
const levels=new Map(reference.tables.creature_template_classlevelstats.map(r=>[`${r.Level}:${r.Class}`,r]));

// ClassicDB z2815 uses the class-level damage formula, not the legacy
// MinMeleeDmg/MaxMeleeDmg columns. Keep original damage and defense intact; only health scales with raid size.
export function raidCreatureStats(entry){
 const raw=templates.get(entry);
 if(!raw)throw new Error(`缺少团本生物参考数据：${entry}`);
 const level=raw.MaxLevel,base=levels.get(`${level}:${raw.UnitClass}`);
 if(!base)throw new Error(`缺少团本生物等级属性：${entry}`);
 const sourceHp=Math.round(base.BaseHealthExp0*raw.HealthMultiplier);
 const swing=raw.MeleeBaseAttackTime||2000,ap=base.BaseMeleeAttackPower/14;
 const damage=n=>(base.BaseDamageExp0*(raw.DamageVariance||1)*n+ap)*swing/1000*raw.DamageMultiplier;
 const hp=Math.round(sourceHp*raidScaling.health);
 return {level,hp,maxHp:hp,sourceHp,armor:Math.round(base.BaseArmor*raw.ArmorMultiplier),
  sourceLow:damage(1),sourceHigh:damage(1.5),low:damage(1)*raidScaling.meleeDamage,high:damage(1.5)*raidScaling.meleeDamage,swing,rank:raw.Rank,mana:Math.round(base.BaseMana*raw.PowerMultiplier),maxMana:Math.round(base.BaseMana*raw.PowerMultiplier),
  damageSchool:raw.DamageSchool,schoolImmuneMask:raw.SchoolImmuneMask,mechanicImmuneMask:raw.MechanicImmuneMask,
  resistances:Object.fromEntries(['Holy','Fire','Nature','Frost','Shadow','Arcane'].map((name,i)=>[i+1,raw['Resistance'+name]||0])),
  scaling:{sourcePlayers:40,targetPlayers:25,health:raidScaling.health,meleeDamage:raidScaling.meleeDamage}};
}
