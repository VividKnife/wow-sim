'use client';
import {useSyncExternalStore} from 'react';
import {readLowEffects,writeLowEffects,subscribeGraphicsPreferences} from './graphics-preferences.js';
export function useLowEffects(){
 const lowEffects=useSyncExternalStore(subscribeGraphicsPreferences,readLowEffects,()=>false);
 return [lowEffects,writeLowEffects] as const;
}
