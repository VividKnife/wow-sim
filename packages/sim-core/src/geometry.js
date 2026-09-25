// Position accepts scalar lane coordinates or explicit two-dimensional points.
export function point(unit){
 if(typeof unit?.position==='object'&&unit.position)return{x:unit.position.x||0,y:unit.position.y||0};
 return{x:unit?.position??unit?.x??0,y:unit?.positionY??unit?.y??0};
}
export function distance(a,b){const p=point(a),q=point(b);return Math.hypot(q.x-p.x,q.y-p.y);}
