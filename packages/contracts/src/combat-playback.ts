import {applyProjectedState,type ProjectedStateOperation} from './events.ts';

export type PlaybackFrame = {
 clock:number;
 operations:ProjectedStateOperation[];
 events?:Record<string,any>[];
 firstLogId?:number;
};

export function applyPlaybackFrame(previous:any,frame:PlaybackFrame):any{
 const next:any=applyProjectedState(previous,frame.operations);
 if(frame.events){
  const first=frame.firstLogId??0;
  next.player.logs=[...(previous.player.logs||[]),...frame.events].filter(event=>event.id>=first);
 }
 return next;
}
