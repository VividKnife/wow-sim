"use client";
import type {ComponentProps,ReactNode} from 'react';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './select';
import './game-select.css';

const emptyValue='__game_select_empty__';
const encode=(value:string|number)=>String(value)===''?emptyValue:String(value);
type Props=Omit<ComponentProps<typeof SelectTrigger>,'value'|'onChange'|'children'> & {
 value:string|number;onValueChange:(value:string)=>void;children:ReactNode;
};
export function GameSelect({value,onValueChange,children,disabled,...props}:Props){
 return <Select value={encode(value)} onValueChange={next=>onValueChange(next===emptyValue?'':next)} disabled={disabled}>
  <SelectTrigger {...props} data-game-select="" disabled={disabled}><SelectValue/></SelectTrigger>
  <SelectContent data-game-select-menu="" position="popper" align="start">{children}</SelectContent>
 </Select>;
}
export function GameSelectOption({value,...props}:Omit<ComponentProps<typeof SelectItem>,'value'> & {value:string|number}){
 return <SelectItem {...props} value={encode(value)}/>;
}
