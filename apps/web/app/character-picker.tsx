"use client";
import ClassIcon from './class-icon';
import type {CSSProperties} from 'react';
import type {ClientRosterMember} from '../../../packages/contracts/src/game';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {classOptions} from './class-options.js';
import './character-picker.css';

const colors:Record<number,string>={1:'#c69b6d',2:'#f48cba',3:'#aad372',4:'#fff468',5:'#e8e6df',7:'#5d9dff',8:'#69ccf0',9:'#b69bea',11:'#ff9b48'};
function Identity({member}:{member:ClientRosterMember}){
 const name=classOptions.find(option=>option.id===member.classId)?.name||'未知职业';
 return <span className="character-picker-identity" style={{'--class-color':colors[member.classId]||'#cfb77e'} as CSSProperties}>
  <span className="character-picker-mark" aria-hidden="true"><ClassIcon classId={member.classId}/></span>
  <span className="character-picker-copy"><span className="character-picker-name"><strong>{member.name}</strong><small>Lv.{member.level}</small><span className="character-picker-kind">{member.kind==='hero'?'主角':'队友'}</span></span><span className="character-picker-detail"><span>{name}</span><span> · {member.talentSummary}</span></span></span>
 </span>;
}
export default function CharacterPicker({roster,value,disabled,onChange,label='查看角色'}:{roster:readonly ClientRosterMember[];value:string;disabled:boolean;onChange:(id:string)=>void;label?:string}){
 const selected=roster.find(member=>member.id===value);
 return <div className="character-picker"><span className="character-picker-label">{label}</span><Select value={value} disabled={disabled} onValueChange={onChange}><SelectTrigger className="character-picker-trigger" aria-label={label}><SelectValue>{selected&&<Identity member={selected}/>}</SelectValue></SelectTrigger><SelectContent className="character-picker-menu" position="popper" align="start" sideOffset={6}>{roster.map(member=><SelectItem className="character-picker-option" key={member.id} value={member.id} textValue={`${member.name} ${member.level} ${member.talentSummary}`}><Identity member={member}/></SelectItem>)}</SelectContent></Select></div>;
}
