'use client';
import {useSyncExternalStore} from 'react';
import {audioDefaults,readAudioPreference,writeAudioPreference,subscribeAudioPreferences} from './audio-preferences.js';
export function useAudioPreference<K extends keyof typeof audioDefaults>(name:K){
 const value=useSyncExternalStore(subscribeAudioPreferences,()=>readAudioPreference(name),()=>audioDefaults[name]) as (typeof audioDefaults)[K];
 return [value,(next:(typeof audioDefaults)[K])=>writeAudioPreference(name,next)] as const;
}
