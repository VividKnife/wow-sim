// Serializable encounter geometry in combat yards, shared by damage and drawing.
import {point} from './geometry.js';

export function fieldContains(field,unit,padding=0){
 const p=point(unit),center=field.center;
 if(!field.points)return Math.hypot(p.x-center.x,p.y-center.y)<=field.radius+padding;
 let inside=false;
 for(let i=0,j=field.points.length-1;i<field.points.length;j=i++){
  const a=field.points[j],b=field.points[i],dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  if(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=padding+1e-8)return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function spiralField(center){
 const edge=offset=>Array.from({length:97},(_,i)=>{const t=i/96,angle=Math.PI/2+t*Math.PI*2,r=6+t*17+offset;return{x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};});
 return {center,points:[...edge(-1.1),...edge(1.1).reverse()]};
}
export function rectangleField(minX,maxX,minY,maxY){
 return {center:{x:(minX+maxX)/2,y:(minY+maxY)/2},points:[{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}]};
}
export function sectorField(center,radius,angle,arc){
 return {center,points:[center,...Array.from({length:33},(_,i)=>({x:center.x+Math.cos(angle-arc/2+arc*i/32)*radius,y:center.y+Math.sin(angle-arc/2+arc*i/32)*radius}))]};
}
export function fieldSafePoint(unit,fields,area,padding=1.5){
 const p=point(unit);
 if((!area||p.x>=area.minX+1&&p.x<=area.maxX-1&&p.y>=area.minY+1&&p.y<=area.maxY-1)&&!fields.some(f=>fieldContains(f,p,padding)))return p;
 for(let radius=padding;radius<=80;radius+=1.5)for(let i=0;i<32;i++){
  const angle=i*Math.PI/16,q={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius};
  if(area&&(q.x<area.minX+1||q.x>area.maxX-1||q.y<area.minY+1||q.y>area.maxY-1))continue;
  if(!fields.some(f=>fieldContains(f,q,padding)))return q;
 }
 return p;
}
