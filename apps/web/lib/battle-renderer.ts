import {Application,Container,Graphics,Sprite,Texture,Rectangle} from 'pixi.js';
import {fieldPoint,projectilePoint,schoolColor} from './combat-view.js';

export type BattleScene={layout:any;units:any[];projectiles:any[];effects:any[];groundEffects:any[];clock:number;selectedId:string;range:number;lowEffects:boolean;reducedMotion:boolean};
export type BattleRenderer={update:(scene:BattleScene)=>void;destroy:()=>void};

/** Presentation only. The ticker never dispatches commands or resolves damage. */
export async function createBattleRenderer(host:HTMLElement,initial:BattleScene,signal:AbortSignal):Promise<BattleRenderer>{
 if(signal.aborted)throw new DOMException('Battle view closed','AbortError');
 const app=new Application();
 let initialized=false,disposed=false,scene=initial;
 const visualKeys=new Map<string,string>(),sprites=new Map<string,Sprite>(),textures=new Map<string,Texture>(),pending=new Set<string>(),frames=new Set<Texture>(),images=new Set<HTMLImageElement>();
 const motion=new Map<string,{from:{x:number;y:number};to:{x:number;y:number};at:number}>();
 const position=(id:string)=>{const m=motion.get(id);if(!m)return{x:scene.layout.units[id]?.left*10,y:scene.layout.units[id]?.top};const t=scene.reducedMotion?1:Math.min(1,(performance.now()-m.at)/160);return{x:m.from.x+(m.to.x-m.from.x)*t,y:m.from.y+(m.to.y-m.from.y)*t};};
 const terrain=new Graphics(),figures=new Container(),fx=new Graphics();
 const destroy=()=>{if(disposed)return;disposed=true;observer?.disconnect();document.removeEventListener('visibilitychange',visibility);for(const image of images){image.onload=null;image.onerror=null;image.src='';}images.clear();if(initialized)app.destroy(true,{children:true,texture:false,textureSource:false});else{app.stage.destroy({children:true});terrain.destroy();figures.destroy();fx.destroy();}for(const frame of frames)frame.destroy(false);for(const texture of textures.values())texture.destroy(true);textures.clear();sprites.clear();visualKeys.clear();};
 let observer:ResizeObserver|undefined;
 const visibility=()=>{if(!initialized||disposed)return;document.hidden?app.stop():app.start();};
 try{await app.init({width:1000,height:440,backgroundAlpha:0,antialias:!initial.lowEffects,resolution:Math.min(window.devicePixelRatio||1,initial.lowEffects?1:1.5),autoDensity:true,autoStart:false,sharedTicker:false,preference:'webgl'});initialized=true;}catch(error){destroy();throw error;}
 if(signal.aborted){destroy();throw new DOMException('Battle view closed','AbortError');}
 app.canvas.setAttribute('aria-hidden','true');host.appendChild(app.canvas);app.stage.addChild(terrain,figures,fx);
 const resize=()=>{if(disposed)return;const width=host.clientWidth,height=host.clientHeight;app.renderer.resize(width,height);app.stage.scale.set(width/1000,height/440);};
 observer=new ResizeObserver(resize);observer.observe(host);resize();
 document.addEventListener('visibilitychange',visibility);
 const loadTexture=(src:string)=>{if(pending.has(src)||textures.has(src))return;pending.add(src);const image=new Image();images.add(image);image.onload=()=>{if(!disposed){const texture=Texture.from(image,true);textures.set(src,texture);}images.delete(image);};image.onerror=()=>images.delete(image);image.src=src;};
 function draw(){
  if(disposed)return;
  terrain.clear();fx.clear();const {layout,clock,lowEffects,reducedMotion}=scene;let particles=0;const budget=lowEffects?60:200;
  const at=(u:any)=>position(u.id);
  const selected=scene.units.find(u=>u.id===scene.selectedId);
  for(let x=0;x<1000;x+=layout.scale*5)terrain.moveTo(x,0).lineTo(x,440).stroke({color:0x94b8a1,alpha:.055,width:1});
  for(let y=0;y<440;y+=layout.scale*5)terrain.moveTo(0,y).lineTo(1000,y).stroke({color:0x94b8a1,alpha:.055,width:1});
  if(selected){const p=at(selected);terrain.circle(p.x,p.y,scene.range*layout.scale).fill({color:0xd7cb9b,alpha:.025}).stroke({color:0xd7cb9b,alpha:.25,width:1});}
  for(const area of scene.groundEffects){if(area.until<=clock||!area.center)continue;const p=fieldPoint(layout,area.center),radius=(area.radius||8)*layout.scale,color=schoolColor(area.school);terrain.circle(p.x,p.y,radius).fill({color,alpha:.09}).stroke({color,alpha:.6,width:1.5});if(!reducedMotion){const count=lowEffects?5:14;for(let i=0;i<count&&particles<budget;i++,particles++){const a=i*2.399,phase=(clock/1200+i/count)%1;fx.circle(p.x+Math.cos(a)*radius*phase,p.y+Math.sin(a)*radius*phase,area.school===4?2:3).fill({color,alpha:(1-phase)*.7});}}}
  const aliveIds=new Set(scene.units.map(u=>u.id));for(const [id,sprite] of sprites)if(!aliveIds.has(id)){sprite.destroy();sprites.delete(id);visualKeys.delete(id);}
  for(const unit of scene.units){
   const p=at(unit);if(!Number.isFinite(p.x))continue;const color=unit.foe?0xd09074:0x95c4ac;
   terrain.circle(p.x,p.y+4,22).fill({color:0x04130d,alpha:.5});terrain.circle(p.x,p.y,21).fill({color:0x1b2d28}).stroke({color:unit.id===scene.selectedId?0xffe1a0:color,width:unit.id===scene.selectedId?3:1.5,alpha:unit.hp>0?1:.3});
   const src=unit.visual.src,visualKey=src+':'+(unit.visual.frame||[]).join(',');loadTexture(src);const texture=textures.get(src);
   if(visualKeys.get(unit.id)!==visualKey&&sprites.has(unit.id)){sprites.get(unit.id)!.destroy();sprites.delete(unit.id);}
   if(texture&&!sprites.has(unit.id)){let own=texture;if(unit.visual.frame){const [column,row]=unit.visual.frame;own=new Texture({source:texture.source,frame:new Rectangle(column*texture.width/4,row*texture.height/4,texture.width/4,texture.height/4)});frames.add(own);}const sprite=new Sprite(own);sprite.anchor.set(.5);sprite.width=34;sprite.height=34;figures.addChild(sprite);sprites.set(unit.id,sprite);visualKeys.set(unit.id,visualKey);}
   const sprite=sprites.get(unit.id);if(sprite){sprite.position.set(p.x,p.y);sprite.alpha=unit.hp>0&&!unit.removed?1:.25;}
   if(unit.foe&&unit.target&&layout.units[unit.target]){const target=layout.units[unit.target];terrain.moveTo(p.x,p.y).lineTo(target.left*10,target.top).stroke({color:0xbba077,alpha:.14,width:1});}
  }
  for(const projectile of scene.projectiles){if(projectile.landsAt<=clock||projectile.startedAt>clock)continue;const p=fieldPoint(layout,projectilePoint(projectile,clock)),from=fieldPoint(layout,projectile.from),color=schoolColor(projectile.school);if(!reducedMotion){const delta=Math.hypot(p.x-from.x,p.y-from.y)||1;fx.moveTo(p.x-(p.x-from.x)/delta*24,p.y-(p.y-from.y)/delta*24).lineTo(p.x,p.y).stroke({color,width:projectile.school===4?3:5,alpha:.65});}fx.circle(p.x,p.y,projectile.school===4?4:6).fill({color});}
  for(const effect of scene.effects){const age=Date.now()-effect.shownAt;if(age>1000)continue;const target=layout.units[effect.targetId],actor=layout.units[effect.actorId],t=reducedMotion ? .4 : age/1000,color=schoolColor(effect.school,effect.kind==='heal');
   if(effect.center&&effect.radius){const p=fieldPoint(layout,effect.center);fx.circle(p.x,p.y,effect.radius*layout.scale*(reducedMotion?1:Math.min(1,t*3))).stroke({color,alpha:1-t,width:2});}
   if(target&&(effect.amount||effect.kind==='miss')){const x=target.left*10,y=target.top;fx.circle(x,y,22+t*18).stroke({color,alpha:(1-t)*.8,width:effect.critical?3:1.5});if(effect.kind==='heal'){fx.moveTo(x-7,y).lineTo(x+7,y).moveTo(x,y-7).lineTo(x,y+7).stroke({color,width:3,alpha:1-t});}if(!reducedMotion&&!effect.periodic){const count=lowEffects?3:8;for(let i=0;i<count&&particles<budget;i++,particles++){const a=i/count*Math.PI*2;fx.circle(x+Math.cos(a)*(15+t*30),y+Math.sin(a)*(15+t*30),2).fill({color,alpha:1-t});}}}
   if(actor&&target&&!effect.spellId&&effect.kind!=='heal'&&age<550){const x=actor.left*10,y=actor.top,a=Math.atan2(target.top-y,target.left*10-x);fx.arc(x,y,30,a-.7+t,a+.7+t).stroke({color,width:3,alpha:1-t});}
  }
 }
 app.ticker.maxFPS=initial.lowEffects?30:60;app.ticker.add(draw);visibility();
 return {update(next){for(const unit of next.units){const p=next.layout.units[unit.id],to={x:p.left*10,y:p.top},prior=motion.get(unit.id);if(!prior||prior.to.x!==to.x||prior.to.y!==to.y)motion.set(unit.id,{from:Number.isFinite(position(unit.id).x)?position(unit.id):to,to,at:performance.now()});}for(const id of motion.keys())if(!next.layout.units[id])motion.delete(id);scene=next;app.ticker.maxFPS=next.lowEffects?30:60;},destroy};
}
