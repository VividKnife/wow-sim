import {classTalentTrees} from './catalog.js';

export function talentSummary(character){
 const trees=classTalentTrees.filter(tree=>tree.classId===character.classId).map(tree=>({name:tree.nameZhCN||tree.name,points:tree.talents.reduce((sum,talent)=>sum+(character.talents?.[talent.id]||0),0)}));
 const maximum=Math.max(0,...trees.map(tree=>tree.points));
 return maximum?trees.filter(tree=>tree.points===maximum).map(tree=>tree.name).join(' / '):'未分配天赋';
}
