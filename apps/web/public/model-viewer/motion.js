// Adapter for the pinned c3f890f viewer: setAnimation's second argument is
// cross-fading, NOT looping. Its M2 timeline (X) otherwise wraps every clip.
export function holdDeathPose(model){
 const advance=model.X;
 model.X=function(state,delta){
  const clip=state.d.c;
  if(clip?.i!=='Death'||!(clip.f>0))return advance.call(this,state,delta);
  const end=Math.max(0,clip.f-1);
  state.d.b=Math.min(state.d.b,end);
  state.b.d=-1; // Do not blend into a queued Stand or another Death variant.
  const noSubAnimation=this.af;
  this.af=true;
  try{return advance.call(this,state,Math.max(0,Math.min(delta,end-state.d.b)));}
  finally{this.af=noSubAnimation;}
 };
}

export function createMotionController(viewer){
 let animation=null;
 return ({animation:next,paused},reducedMotion=false)=>{
  // Pausing a menu must not reset a one-shot clip (or restart a running stride).
  if(next!==animation){viewer.method('setAnimation',[next,true]);animation=next;}
  viewer.method('setAnimPaused',[paused||reducedMotion]);
 };
}
