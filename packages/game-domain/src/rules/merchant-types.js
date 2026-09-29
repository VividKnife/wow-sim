// Merchant specialties come from creature titles, independent of current stock.
/** @type {Array<[RegExp, string]>} */
const specialties = [
 [/Innkeeper/, '旅店老板'],
 [/Herb/, '草药商'],
 [/Reagent|Arcane Goods/, '材料商'],
 [/Poison/, '毒药商'],
 [/Alchemy|Potion|Scroll/, '炼金用品商'],
 [/Blacksmith|Smithing Supplies/, '锻造用品商'],
 [/Engineering|Engineer/, '工程用品商'],
 [/Enchanting/, '附魔用品商'],
 [/Leatherworking|Leatherworker/, '制皮用品商'],
 [/Tailoring/, '裁缝用品商'],
 [/Mining/, '采矿用品商'],
 [/Cooking/, '烹饪用品商'],
 [/Fishing|Fisherman|Bait|Tackle/, '钓鱼用品商'],
 [/Weaponsmith.*Armor|Light Armor & Weapons/, '武器与护甲商'],
 [/Armor|Clothier|Robe|Shield|War Harness|Dress|Hatter|Cobbler/, '护甲商'],
 [/Weapon|Blade|Sword|Dagger|Axe|Mace|Staff|Staves|Bow|Gun|Wand|Fletcher/, '武器商'],
 [/Ammunition/, '弹药商'],
 [/Bag|Sacks/, '背包商'],
 [/Tabard/, '公会徽章商'],
 [/Horse|Ram Breeder|Raptor|Saber|Kodo|Mechanostrider/, '坐骑商'],
 [/kittens|Cat Lady|Cockroach|Owl|Prairie Dog|Snake|Kennel/, '宠物商'],
 [/Food.*Drink/, '食品饮料商'],
 [/Drink|Beverage|Ale|Wine|Vintner|Merlot|Barmaid|Bartender|Waitress|Drunk/, '饮料商'],
 [/Bread|Baker|Pie/, '面包商'],
 [/Meat|Butcher/, '肉商'],
 [/Fish/, '鱼商'],
 [/Fruit/, '水果商'],
 [/Mushroom|Fungus/, '蘑菇商'],
 [/Cheese/, '奶酪商'],
 [/Food|Cook|Chef|Treats|Ice Cream/, '食品商'],
 [/Book|Librarian|Lorekeeper|Demon/, '书籍商'],
 [/Fireworks/, '烟花商'],
 [/Florist/, '花商'],
 [/Quartermaster|Supply Officer/, '军需官'],
 [/Trade|Tools|Supplies|Supplier/, '材料商'],
 [/General|Goods|Merchant|Dealer|Salesman|Basket/, '杂货商'],
];

export function merchantType(creature) {
 if (creature?.NpcFlags & 128) return '旅店老板';
 const title = creature?.SubName || '';
 return specialties.find(([pattern]) => pattern.test(title))?.[1] || '商人';
}
