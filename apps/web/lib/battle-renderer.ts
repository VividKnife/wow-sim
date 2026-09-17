import {Application,Graphics} from 'pixi.js';
import {fieldPoint,projectilePoint,schoolColor} from './combat-view.js';

export type BattleScene={encounterId?:string;live?:boolean;sampledAt?:number;background?:string;layout:any;units:any[];projectiles:any[];effects:any[];groundEffects:any[];clock:number;selectedId:string;range:number;lowEffects:boolean;reducedMotion:boolean};
export type BattleRenderer={update:(scene:BattleScene)=>void;destroy:()=>void};

/** Presentation only. The ticker never dispatches commands or resolves damage. */
export async function createBattleRenderer(host:HTMLElement,initial:BattleScene,signal:AbortSignal):Promise<BattleRenderer>{
 if(signal.aborted)throw new DOMException('Battle view closed','AbortError');
 const app=new Application();
 let initialized=false,disposed=false,scene=initial,frameClock=initial.clock;
 const grid=new Graphics(),terrain=new Graphics(),fx=new Graphics();
 let gridScale=NaN;
 const destroy=()=>{if(disposed)return;disposed=true;observer?.disconnect();document.removeEventListener('visibilitychange',visibility);if(initialized)app.destroy(true,{children:true});else{app.stage.destroy({children:true});grid.destroy();terrain.destroy();fx.destroy();}};
 let observer:ResizeObserver|undefined;
 const visibility=()=>{if(!initialized||disposed)return;document.hidden?app.stop():app.start();};
 try{await app.init({width:1000,height:440,backgroundAlpha:0,antialias:!initial.lowEffects,resolution:Math.min(window.devicePixelRatio||1,initial.lowEffects?1:1.5),autoDensity:true,autoStart:false,sharedTicker:false,preference:'webgl'});initialized=true;}catch(error){destroy();throw error;}
 if(signal.aborted){destroy();throw new DOMException('Battle view closed','AbortError');}
 app.canvas.setAttribute('aria-hidden','true');host.appendChild(app.canvas);app.stage.addChild(grid,terrain,fx);
 const resize=()=>{if(disposed)return;const width=host.clientWidth,height=host.clientHeight;app.renderer.resize(width,height);app.stage.scale.set(width/1000,height/440);};
 observer=new ResizeObserver(resize);observer.observe(host);resize();
 document.addEventListener('visibilitychange',visibility);
 function draw(){
  if(disposed)return;
  terrain.clear();fx.clear();const {layout,lowEffects,reducedMotion}=scene;
  // A render frame has its own clock. Network/HUD updates never gate animation.
  const projectedClock=scene.clock+(scene.live?Math.min(1000,Math.max(0,performance.now()-(scene.sampledAt??performance.now()))):0);
  const clock=frameClock=scene.live?Math.max(frameClock,projectedClock):scene.clock;
  let particles=0;const budget=lowEffects?60:200;
  const selected=scene.units.find(u=>u.id===scene.selectedId);
  if(gridScale!==layout.scale){
   gridScale=layout.scale;grid.clear();const step=Math.max(1,layout.scale*5);
   for(let x=0;x<1000;x+=step)grid.moveTo(x,0).lineTo(x,440);
   for(let y=0;y<440;y+=step*(layout.scaleY/layout.scale))grid.moveTo(0,y).lineTo(1000,y);
   grid.stroke({color:0x94b8a1,alpha:.055,width:1});
  }
  if(selected){const a=(layout.anchors||layout.units)[selected.id],p={x:a.left*10,y:a.top};terrain.ellipse(p.x,p.y,scene.range*layout.scale,scene.range*layout.scaleY).fill({color:0xd7cb9b,alpha:.025}).stroke({color:0xd7cb9b,alpha:.25,width:1});}
  for(const area of scene.groundEffects){if(area.until<=clock||!area.center)continue;const p=fieldPoint(layout,area.center),radius=(area.radius||8)*layout.scale,color=schoolColor(area.school);terrain.ellipse(p.x,p.y,radius,radius*layout.scaleY/layout.scale).fill({color,alpha:.09}).stroke({color,alpha:.6,width:1.5});if(!reducedMotion){const count=lowEffects?5:14;for(let i=0;i<count&&particles<budget;i++,particles++){const a=i*2.399,phase=(clock/1200+i/count)%1;fx.circle(p.x+Math.cos(a)*radius*phase,p.y+Math.sin(a)*radius*phase,area.school===4?2:3).fill({color,alpha:(1-phase)*.7});}}}
  for(const projectile of scene.projectiles){if(projectile.landsAt<=clock||projectile.startedAt>clock)continue;const p=fieldPoint(layout,projectilePoint(projectile,clock)),from=fieldPoint(layout,projectile.from),color=schoolColor(projectile.school);if(!reducedMotion){const delta=Math.hypot(p.x-from.x,p.y-from.y)||1;fx.moveTo(p.x-(p.x-from.x)/delta*24,p.y-(p.y-from.y)/delta*24).lineTo(p.x,p.y).stroke({color,width:projectile.school===4?3:5,alpha:.65});}fx.circle(p.x,p.y,projectile.school===4?4:6).fill({color});}
  for(const effect of scene.effects){const age=Date.now()-effect.shownAt;if(age<0||age>1000)continue;const target=layout.units[effect.targetId],actor=layout.units[effect.actorId],t=reducedMotion ? .4 : age/1000,color=schoolColor(effect.school,effect.kind==='heal');
   if(effect.center&&effect.radius){const p=fieldPoint(layout,effect.center);fx.ellipse(p.x,p.y,effect.radius*layout.scale*(reducedMotion?1:Math.min(1,t*3)),effect.radius*layout.scaleY*(reducedMotion?1:Math.min(1,t*3))).stroke({color,alpha:1-t,width:2});}
   if(target&&(effect.amount||effect.kind==='miss')){const x=target.left*10,y=target.top;fx.circle(x,y,22+t*18).stroke({color,alpha:(1-t)*.8,width:effect.critical?3:1.5});if(effect.kind==='heal'){fx.moveTo(x-7,y).lineTo(x+7,y).moveTo(x,y-7).lineTo(x,y+7).stroke({color,width:3,alpha:1-t});}if(!reducedMotion&&!effect.periodic){const count=lowEffects?3:8;for(let i=0;i<count&&particles<budget;i++,particles++){const a=i/count*Math.PI*2;fx.circle(x+Math.cos(a)*(15+t*30),y+Math.sin(a)*(15+t*30),2).fill({color,alpha:1-t});}}}
   if(actor&&target&&!effect.spellId&&effect.kind!=='heal'&&age<550){const x=actor.left*10,y=actor.top,a=Math.atan2(target.top-y,target.left*10-x);fx.moveTo(x+Math.cos(a-.7+t)*30,y+Math.sin(a-.7+t)*30).arc(x,y,30,a-.7+t,a+.7+t).stroke({color,width:3,alpha:1-t});}
  }
 }
 app.ticker.maxFPS=initial.lowEffects?30:60;app.ticker.add(draw);visibility();
 return {update(next){if(next.encounterId!==scene.encounterId)frameClock=next.clock;scene=next;app.ticker.maxFPS=next.lowEffects?30:60;},destroy};
}
