import {classMarketSupplies} from '../../../game-data/market-reference.js';
import {recipes,enchants,potions,bandages,disenchantLoot} from './profession-data.js';

const recipeProfession=new Map(recipes.flatMap(r=>r.recipeItems.map(id=>[id,r.profession])));
const professionNames={alchemy:'炼金术',blacksmithing:'锻造',leatherworking:'制皮',tailoring:'裁缝',engineering:'工程学',enchanting:'附魔',cooking:'烹饪',firstaid:'急救',fishing:'钓鱼',mining:'采矿'};
const weapons={0:'单手斧',1:'双手斧',2:'弓',3:'枪械',4:'单手锤',5:'双手锤',6:'长柄武器',7:'单手剑',8:'双手剑',10:'法杖',13:'拳套',14:'工具',15:'匕首',16:'投掷武器',18:'弩',19:'魔杖',20:'鱼竿'};
const armor={0:'饰品与杂项',1:'布甲',2:'皮甲',3:'锁甲',4:'板甲',6:'盾牌',7:'圣契',8:'神像',9:'图腾'};
const slots={1:'头部',2:'颈部',3:'肩部',4:'衬衣',5:'胸部',6:'腰部',7:'腿部',8:'脚部',9:'手腕',10:'手部',11:'手指',12:'饰品',14:'副手',16:'背部',19:'战袍',20:'胸部',23:'副手'};
const enchantSlots={9:'手腕',5:'胸部',15:'背部',16:'武器',17:'盾牌',8:'脚部',10:'手部'};
const disenchantMaterials=new Set(Object.values(disenchantLoot).flat().map(r=>r.item));
export const marketSlot=i=>i.class===4?slots[i.InventoryType]||'其他':'';
export function marketSubcategory(i){
 const name=i.name||'';
 if(classMarketSupplies.includes(i.entry))return /Poison/.test(name)?'盗贼毒药':'施法媒介';
 if(i.enchant){const slot=enchants[i.enchant]?.slots[0];return enchantSlots[slot]||'其他附魔';}
 if(i.class===2)return weapons[i.subclass]||'其他武器';
 if(i.class===4)return i.InventoryType===16?'披风':armor[i.subclass]||'其他护甲';
 if(i.class===9)return professionNames[recipeProfession.get(i.entry)]||'其他配方';
 if(i.class===1)return ({0:'背包',1:'灵魂袋',2:'草药包',3:'附魔材料包',4:'工程材料包'})[i.subclass]||'专用容器';
 if(i.class===6)return i.subclass===2?'箭':'子弹';
 if(i.class===11)return i.subclass===2?'箭袋':'弹药袋';
 if(bandages[i.entry]||/Anti-Venom/.test(name))return '绷带与急救';
 if(potions[i.entry]||/Potion|Elixir|Flask/.test(name))return /Flask/.test(name)?'合剂':/Elixir/.test(name)?'药剂':'药水';
 if(/Oil|Sharpening Stone|Weightstone|Armor Kit|Shield Spike|Scope/.test(name)&&!/(Fish|Blackmouth|Fire|Stonescale|Goblin Rocket) Oil/.test(name))return '物品强化';
 if(i.class===0)return /Firework|Rocket|Launcher/.test(name)?'烟花':/Scroll/.test(name)?'卷轴':'食物与饮料';
 if(disenchantMaterials.has(i.entry))return '附魔材料';
 if(/Cloth|Linen|Silk|Mageweave|Felcloth/.test(name))return '布料';
 if(/Leather|Hide|Scale|Carapace|Chitin/.test(name))return '皮革与鳞片';
 if(/Ore| Bar$|Stone$|Coal|Flux/.test(name))return '矿石与金属';
 if(/Lotus|bloom|weed|leaf|root|thorn|sblood|Lichen|Moss|Lily|Kelp|Wintersbite|Goldthorn|Golden Sansam|Sungrass|Mountain Silversage|Arthas|Bloodvine|Dreamfoil|Goldclover/.test(name))return '草药';
 if(/Pearl|Diamond|Sapphire|Ruby|Emerald|Opal|Aquamarine|Malachite|Tigerseye|Citrine|Jade|Agate|Souldarite|Arcane Crystal/.test(name))return '宝石';
 if(/Essence|Elemental|Heart of|Core of|Breath of|Ichor of|Globe of/.test(name))return '元素材料';
 if(/Meat|Egg|Fish|Clam|Craw|Tenderloin|Chunk|Boar|Wolf|Venison|Raptor|Spider|Turtle|Stag/.test(name))return '烹饪材料';
 if(i.class===7&&[1,2,3].includes(i.subclass))return ['','工程零件','炸药','装置'][i.subclass];
 return '其他';
}
