import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import CityServicePanel from '../../app/city-services';
import '../../app/globals.css';

const item={id:117,name:'测试补给',quality:1,sell:5,itemLevel:1,effects:Array.from({length:40},(_,id)=>({id,trigger:'使用',text:`补给效果 ${id+1}`}))};
const state={id:'preview',location:'stormwind',money:10000,hp:100,activity:{type:'idle'},bag:[{id:117,uid:'supply',count:2}],auctions:[]};
const data={city:{canInteract:true,junkCount:0},shop:[{...item,count:5,price:25}],items:{117:item},inventoryActions:{supply:{protected:false}}};
function Preview(){
 const [commands,setCommands]=useState<any[]>([]);
 return <main style={{padding:16}}><h1>商人物品详情验证</h1><CityServicePanel service={{id:'shop',name:'商人',npc:'测试商人',description:'',greeting:''}} state={state} data={data} busy={false} send={async command=>{setCommands(previous=>[...previous,command]);return true;}}/><output aria-label="已发送命令">{JSON.stringify(commands)}</output></main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
