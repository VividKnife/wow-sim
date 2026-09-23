"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Popover,PopoverContent,PopoverTrigger} from '@/components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from '@/components/ui/command';
import {Icon} from './game-ui';

type Skill={spellId:number;name:string;nameEn:string;icon:string;rank:string};
export function StrategySkillPicker({skills,value,label,onChange,disabled=false}:{skills:Skill[];value:number;label:string;onChange:(id:number)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 const selected=skills.find(skill=>skill.spellId===value);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-label={label} aria-expanded={open} className="strategy-skill-trigger" disabled={disabled||!skills.length}>
   {selected&&<Icon src={selected.icon} name={selected.name} size={28}/>}
   <span>{selected?.name||'选择已学技能'} <small>{selected?.rank}</small></span><span aria-hidden="true">⌄</span>
  </Button></PopoverTrigger>
  <PopoverContent className="strategy-skill-popover" align="start"><Command>
   <CommandInput placeholder="搜索技能名称…" aria-label="搜索已学技能"/>
   <CommandList><CommandEmpty>没有匹配的已学主动技能</CommandEmpty>{skills.map(skill=><CommandItem key={skill.spellId} value={`${skill.name} ${skill.nameEn} ${skill.spellId}`} onSelect={()=>{onChange(skill.spellId);setOpen(false);}}>
    <Icon src={skill.icon} name={skill.name} size={32}/><span>{skill.name}<small className="strategy-skill-rank">{skill.rank||'主动技能'}</small></span>{skill.spellId===value&&<span className="strategy-skill-selected" aria-label="已选择">✓</span>}
   </CommandItem>)}</CommandList>
  </Command></PopoverContent>
 </Popover>;
}
