import type {CSSProperties} from 'react';

// Classic character creation atlas: four columns and four rows, 64px per cell.
const positions:Record<number,[number,number]>={1:[0,0],8:[1,0],4:[2,0],11:[3,0],3:[0,1],7:[1,1],5:[2,1],9:[3,1],2:[0,2]};

export default function ClassIcon({classId,size='80%'}:{classId:number;size?:CSSProperties['width']}){
 const position=positions[classId];
 if(!position)return null;
 return <span aria-hidden="true" style={{display:'inline-block',width:size,aspectRatio:'1',flexShrink:0,verticalAlign:'middle',borderRadius:4,backgroundImage:'url(/icons/atlases/ui-charactercreate-classes.png)',backgroundSize:'400% 400%',backgroundPosition:`${position[0]*100/3}% ${position[1]*100/3}%`}}/>;
}
