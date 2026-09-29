import {runtime} from './runtime-content.js';
/**
 * @typedef {{id:number,name:string,loot:any[],abilities:{id:number,name:string,icon?:string,cooldown:number|number[]|null}[],strategy?:string,portrait?:string,rare?:boolean,[key:string]:any}} JournalBoss
 * @type {{id:string,name:string,bosses:JournalBoss[],[key:string]:any}[]}
 */
export const dungeonJournal=runtime.dungeonJournal;
