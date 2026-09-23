import {unitPoint} from './battle-hd2d.js';

// Labels use exactly the same interpolated world feet as the models. Reuse the
// caller's vector; never walk the entire scene to project a new damage number.
export function projectBattleLabel(vector,layout,id,height,camera,size,offsetX=0){
 const p=unitPoint(layout,id);
 vector.set(p[0]+offsetX,height,p[2]).project(camera);
 vector.x=(vector.x+1)*size.width/2;vector.y=(1-vector.y)*size.height/2;
 return vector;
}
