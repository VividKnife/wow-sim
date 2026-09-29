// Temporary bonuses belong to one weapon instance, not to the equipment slot.
export function weaponEnhancementStats(c,slot,clock=c.time||0){
 const enchant=c.weaponEnchants?.[slot]||(slot===16?c.weaponEnchant:null);
 return !c.form&&enchant?.until>clock&&enchant.weaponUid===c.equipment?.[slot]?.uid?enchant.stats||{}:{};
}
