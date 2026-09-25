import {nameOf} from './catalog.js';
import {recipes,professions} from './profession-data.js';
import {recipeQuote,recipeAvailability} from './professions.js';
import {CONTENT_VERSION} from './client-content.js';

const filters={
 all:()=>true,'全部':()=>true,
 known:r=>r.known,'已解锁':r=>r.known,
 skillup:r=>r.known&&r.color!=='gray','可提升':r=>r.known&&r.color!=='gray',
 specialization:r=>!!r.specialization,'专精配方':r=>!!r.specialization,
 cooldown:r=>!!r.cooldown,'冷却配方':r=>!!r.cooldown,
};
const integer=(value,fallback)=>Number.isInteger(Number(value))?Number(value):fallback;

export function workshopView(state,query={}){
 const profession=typeof query.profession==='string'?query.profession:'';
 const pageSize=Math.max(1,Math.min(24,integer(query.pageSize,24)));
 const requestedPage=Math.max(0,integer(query.page,0));
 const search=typeof query.search==='string'?query.search.trim().toLowerCase():'';
 const filter=filters[query.filter]||filters.all;
 const validProfession=professions.some(row=>row.id===profession);
 const matching=validProfession?recipes.filter(recipe=>recipe.profession===profession).filter(recipe=>{
  if(!filter({...recipe,...recipeAvailability(state,recipe)}))return false;
  return !search||[recipe.name,recipe.nameEn,nameOf('items',recipe.item),String(recipe.spell),String(recipe.id)].some(value=>value?.toLowerCase().includes(search));
 }).sort((a,b)=>a.skill-b.skill||a.spell-b.spell):[];
 const total=matching.length,maxPage=Math.max(0,Math.ceil(total/pageSize)-1),page=Math.min(requestedPage,maxPage);
 return{recipes:matching.slice(page*pageSize,(page+1)*pageSize).map(recipe=>recipeQuote(state,recipe)),total,page,pageSize,profession,contentVersion:CONTENT_VERSION};
}
