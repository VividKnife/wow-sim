// Capture registered display identities without importing live gameplay values.
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {items,spells,icon,classAbilities,talents} from '../../../packages/game-domain/src/rules/catalog.js';
import {recipes,professions,professionRanks,specializations,marketIds} from '../../../packages/game-domain/src/rules/profession-data.js';

const out=new URL('./item-profession-assets/',import.meta.url);
mkdirSync(out,{recursive:true});
const inputs=['classic-reference','quest-supplement-reference','deadmines-reference','classes-reference','class-demons-reference','professions-reference','professions-templates','client-rules-reference'];
const sourceBundles=Object.fromEntries(inputs.map(name=>{
 const path=`packages/game-data/data/${name}.json`;
 return [path,createHash('sha256').update(readFileSync(new URL('../../../'+path,import.meta.url))).digest('hex')];
}));
const itemRows=Object.values(items).sort((a,b)=>a.entry-b.entry).map(i=>({id:i.entry,name:i.name,displayId:i.displayid||0,itemClass:i.class,inventoryType:i.InventoryType,existingIcon:icon('items',i.entry)}));
const spellRow=id=>({id,name:spells[id]?.SpellName||'',iconId:spells[id]?.SpellIconID||0,existingIcon:icon('spells',id)});
const professionIds=new Set(recipes.map(r=>r.spell).concat(Object.values(professionRanks).flat().map(r=>r.spell),specializations.map(s=>s.id)));
const classIds=new Set(Object.values(classAbilities).flat().map(a=>a.spellId));
const scope={scope:'Current registered items, profession recipes/ranks/specializations, class abilities and talents; not the entire Vanilla database',
 sourceBundles,items:itemRows,professionSpells:[...professionIds].sort((a,b)=>a-b).map(spellRow),classSpells:[...classIds].sort((a,b)=>a-b).map(spellRow),
 talents:Object.values(talents).map(t=>({id:t.id,classId:t.classId,existingIcon:icon('talents',t.id),rankSpellIds:t.ranks})),
 professions:professions.map(p=>({id:p.id,skillId:p.skillId,rankSpellId:professionRanks[p.id][0].spell})),
 recipes:recipes.map(r=>({id:r.id,spellId:r.spell,profession:r.profession,itemId:r.item,materialIds:r.materials.map(m=>m.id),recipeItemIds:r.recipeItems})),marketIds};
writeFileSync(new URL('scope.json',out),JSON.stringify(scope,null,2)+'\n');
console.log(`Captured ${itemRows.length} items, ${scope.professionSpells.length} profession spells, ${scope.classSpells.length} class spells, ${scope.talents.length} talents`);
