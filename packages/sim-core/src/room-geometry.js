const EPS=1e-8;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const edges=polygon=>polygon.map((a,i)=>[a,polygon[(i+1)%polygon.length]]);
function pointSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function intersects(a,b,c,d){
 const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
 if(abC*abD<0&&cdA*cdB<0)return true;
 return Math.abs(abC)<EPS&&pointSegment(c,a,b)<EPS||Math.abs(abD)<EPS&&pointSegment(d,a,b)<EPS||Math.abs(cdA)<EPS&&pointSegment(a,c,d)<EPS||Math.abs(cdB)<EPS&&pointSegment(b,c,d)<EPS;
}
export function roomPointInside(polygon,p,padding=0){
 let inside=false;
 for(const [a,b]of edges(polygon)){
  const distance=pointSegment(p,a,b);
  if(distance<padding-EPS)return false;
  if(distance<EPS&&padding===0)return true;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
export function roomSegmentInside(polygon,a,b,padding=0){
 if(!roomPointInside(polygon,a,padding)||!roomPointInside(polygon,b,padding))return false;
 const cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y;
 for(const [c,d]of edges(polygon)){
  const ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
  if(Math.abs(den)>EPS){const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
  if(padding>0&&(intersects(a,b,c,d)||Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b))<padding-EPS))return false;
 }
 cuts.sort((a,b)=>a-b);
 return cuts.slice(1).every((t,i)=>roomPointInside(polygon,{x:a.x+dx*(t+cuts[i])/2,y:a.y+dy*(t+cuts[i])/2}));
}
/** Build-time ear clipping for bounded simple, counter-clockwise room floors.
 * No geometry generation or triangulation runs in the simulation hot path. */
export function bakeRoomNavigation(polygon){
 if(!Array.isArray(polygon)||polygon.length<3||polygon.length>64||polygon.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('Invalid room polygon');
 const boundary=edges(polygon);
 for(let i=0;i<boundary.length;i++){
  const [a,b]=boundary[i];if(Math.hypot(a.x-b.x,a.y-b.y)<EPS)throw new Error('Duplicate room vertex');
  for(let j=i+1;j<boundary.length;j++)if(j!==i+1&&!(i===0&&j===boundary.length-1)&&intersects(a,b,...boundary[j]))throw new Error('Room polygon intersects itself');
 }
 if(boundary.reduce((sum,[a,b])=>sum+a.x*b.y-b.x*a.y,0)<=EPS)throw new Error('Room polygon must be counter-clockwise');
 const remaining=polygon.map((_,i)=>i),triangles=[];
 while(remaining.length>3){
  const ear=remaining.findIndex((b,i)=>{const a=remaining[(i+remaining.length-1)%remaining.length],c=remaining[(i+1)%remaining.length];
   return cross(polygon[a],polygon[b],polygon[c])>EPS&&!remaining.some(p=>p!==a&&p!==b&&p!==c&&cross(polygon[a],polygon[b],polygon[p])>=-EPS&&cross(polygon[b],polygon[c],polygon[p])>=-EPS&&cross(polygon[c],polygon[a],polygon[p])>=-EPS);});
  if(ear<0)throw new Error('Room cannot be triangulated');
  triangles.push([remaining[(ear+remaining.length-1)%remaining.length],remaining[ear],remaining[(ear+1)%remaining.length]]);remaining.splice(ear,1);
 }
 triangles.push([...remaining]);
 const shared=new Map(),portals=[];
 for(const [cell,triangle]of triangles.entries())for(let i=0;i<3;i++){
  const edge=[triangle[i],triangle[(i+1)%3]].sort((a,b)=>a-b),key=edge.join(':');
  if(shared.has(key))portals.push({cells:[shared.get(key),cell],edge});else shared.set(key,cell);
 }
 return{version:1,triangles,portals};
}
