// Out-of-combat execution has a separate registry so reference records never
// become trainable merely because their names were imported.
export const utilitySpellNames=new Set(['Slow Fall','Levitate','Water Breathing','Water Walking','Unending Breath','Aquatic Form','Track Beasts','Track Dragonkin','Track Demons','Track Elementals','Track Giants','Track Undead','Sense Undead','Track Humanoids','Sense Demons','Eagle Eye','Far Sight','Mind Vision','Eyes of the Beast','Eye of Kilrogg','Beast Lore','Detect Magic','Track Hidden','Detect Traps','Pick Pocket','Pick Lock','Disarm Trap',
 'Conjure Food','Conjure Water','Conjure Mana Agate','Conjure Mana Jade','Conjure Mana Citrine','Conjure Mana Ruby',
 'Teleport: Stormwind','Teleport: Ironforge','Teleport: Darnassus','Teleport: Orgrimmar','Teleport: Undercity','Teleport: Thunder Bluff',
 'Portal: Stormwind','Portal: Ironforge','Portal: Darnassus','Portal: Orgrimmar','Portal: Undercity','Portal: Thunder Bluff',
 'Teleport: Moonglade','Astral Recall','Ritual of Summoning','Summon Warhorse','Summon Charger','Summon Felsteed','Summon Dreadsteed',
 'Create Healthstone (Minor)','Create Healthstone (Lesser)','Create Healthstone','Create Healthstone (Greater)','Create Healthstone (Major)',
 'Create Soulstone (Minor)','Create Soulstone (Lesser)','Create Soulstone','Create Soulstone (Greater)','Create Soulstone (Major)',
 'Create Firestone (Lesser)','Create Firestone','Create Firestone (Greater)','Create Firestone (Major)',
 'Create Spellstone','Create Spellstone (Greater)','Create Spellstone (Major)',
 'Crippling Poison','Crippling Poison II','Instant Poison','Instant Poison II','Instant Poison III','Instant Poison IV','Instant Poison V','Instant Poison VI',
 'Deadly Poison','Deadly Poison II','Deadly Poison III','Deadly Poison IV','Deadly Poison V','Mind-numbing Poison','Mind-numbing Poison II','Mind-numbing Poison III',
 'Wound Poison','Wound Poison II','Wound Poison III','Wound Poison IV','Blinding Powder',
]);
export const passiveSpellNames=new Set(['Plate Mail','Mail','Dual Wield','Dodge','Block','Parry','Defense','Unarmed','One-Handed Axes','Two-Handed Axes','One-Handed Maces','Two-Handed Maces','One-Handed Swords','Two-Handed Swords','Staves','Bows','Guns','Daggers','Thrown','Crossbows','Fist Weapons','Polearms','Wands','Cloth','Leather','Shield','Libram','Totem','Fetish','Two-Handed Axes and Maces','Reincarnation','Safe Fall','Feline Grace','Poisons','Feed Pet','Beast Training']);

export const teleportDestinations={
 'Stormwind':'stormwind','Ironforge':'ironforge','Darnassus':'darnassus',
 'Orgrimmar':'orgrimmar','Undercity':'undercity','Thunder Bluff':'thunderbluff','Moonglade':'moonglade',
};
export const classTravelNodes={
 darnassus:{id:'darnassus',name:'达纳苏斯',kind:'city',region:'卡利姆多',level:[1,60],description:'传送抵达的主城服务节点。'},
 orgrimmar:{id:'orgrimmar',name:'奥格瑞玛',kind:'city',region:'卡利姆多',level:[1,60],description:'传送抵达的主城服务节点。'},
 undercity:{id:'undercity',name:'幽暗城',kind:'city',region:'东部王国',level:[1,60],description:'传送抵达的主城服务节点。'},
 thunderbluff:{id:'thunderbluff',name:'雷霆崖',kind:'city',region:'卡利姆多',level:[1,60],description:'传送抵达的主城服务节点。'},
 moonglade:{id:'moonglade',name:'月光林地',kind:'city',region:'卡利姆多',level:[10,60],description:'德鲁伊传送与训练服务节点。'},
};
