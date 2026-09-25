// Labels may move; the original geographic anchor never does.
export function atlasLabels(regions){
 const placed=[];
 for(const region of [...regions].sort((a,b)=>a.y-b.y)){
  const anchorX=region.x*1.5-25,anchorY=region.y,labelWidth=Math.max(12,region.id.length*2.4+3);
  const fits=(x,y)=>x-labelWidth/2>=2&&x+labelWidth/2<=98&&y>=4&&y<=96&&placed.every(other=>Math.abs(x-other.x)>=(labelWidth+other.labelWidth)/2+1||Math.abs(y-other.y)>=7);
  let point=null;
  for(let radius=0;radius<70&&!point;radius+=.5){
   for(let step=0;step<32;step++){
    const angle=step*Math.PI/16,x=anchorX+Math.cos(angle)*radius,y=anchorY+Math.sin(angle)*radius;
    if(fits(x,y)){point={x,y};break;}
   }
  }
  placed.push({...region,anchorX,anchorY,labelWidth,...(point||{x:anchorX,y:anchorY})});
 }
 return placed;
}
