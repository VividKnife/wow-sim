'use client';
import {useState} from 'react';
import {useLowEffects} from '@/lib/use-low-effects';
import {useAudioPreference} from '@/lib/use-audio-preference';
import type {GameProps} from './game-ui';
import UnstuckControl from './unstuck-control';
import AccountMenu from './account-menu';

export default function GameSettings({state:s,busy,send,onClose}:{state:GameProps['state'];busy:boolean;send:GameProps['send'];onClose:()=>void}){
 const [music,setMusic]=useAudioPreference('musicEnabled'),[musicVolume,setMusicVolume]=useAudioPreference('musicVolume');
 const [effects,setEffects]=useAudioPreference('effectsEnabled'),[effectsVolume,setEffectsVolume]=useAudioPreference('effectsVolume');
 const [lowEffects,setLowEffects]=useLowEffects();
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 return <div className="cu-settings">
  <fieldset><legend>声音</legend>
   <label className="cu-setting-toggle"><span>音乐<small>随当前区域播放背景音乐</small></span><input type="checkbox" checked={music} onChange={e=>setMusic(e.target.checked)} aria-label="音乐"/></label>
   <label className="cu-setting-volume"><span>音乐音量</span><input type="range" min="0" max="100" value={Math.round(musicVolume*100)} onChange={e=>setMusicVolume(Number(e.target.value)/100)} aria-label="音乐音量"/><output>{Math.round(musicVolume*100)}%</output></label>
   <label className="cu-setting-toggle"><span>音效<small>战斗技能与任务提示音</small></span><input type="checkbox" checked={effects} onChange={e=>setEffects(e.target.checked)} aria-label="音效"/></label>
   <label className="cu-setting-volume"><span>音效音量</span><input type="range" min="0" max="100" value={Math.round(effectsVolume*100)} onChange={e=>setEffectsVolume(Number(e.target.value)/100)} aria-label="音效音量"/><output>{Math.round(effectsVolume*100)}%</output></label>
  </fieldset>
  <fieldset><legend>画面与特效</legend>
   <label className="cu-setting-toggle"><span>简化特效<small>减少粒子与同屏特效，关闭动态阴影和后期效果，优先保证流畅</small></span><input type="checkbox" checked={lowEffects} onChange={e=>setLowEffects(e.target.checked)} aria-label="简化特效"/></label>
   <p className="cu-settings-hint">适用于野外、副本和竞技场战斗，不影响战斗计算与伤害统计。</p>
  </fieldset>
  <fieldset><legend>游戏</legend>
   <label className="cu-setting-toggle"><span>自动拾取<small>战后自动收取战利品，背包已满时保留掉落</small></span><input type="checkbox" checked={!!s.settings.autoLoot} disabled={busy||saving} aria-label="自动拾取" onChange={async e=>{const next=e.target.checked;setSaving(true);setNotice('');try{const ok=await send({type:'settings',autoLoot:next});setNotice(ok?'拾取设置已保存':'保存失败，请重试。');}finally{setSaving(false);}}}/></label>
   <label className="cu-setting-toggle"><span>跳过灰色物品<small>自动拾取时忽略粗糙品质物品，仍可手动拾取；不会阻塞继续战斗</small></span><input type="checkbox" checked={!!s.settings.autoLootIgnoreGray} disabled={!s.settings.autoLoot||busy||saving} aria-label="跳过灰色物品" onChange={async e=>{const next=e.target.checked;setSaving(true);setNotice('');try{const ok=await send({type:'settings',autoLootIgnoreGray:next});setNotice(ok?'拾取过滤已保存':'保存失败，请重试。');}finally{setSaving(false);}}}/></label>
   <p className="cu-settings-notice" role="status">{saving?'正在保存…':notice}</p>
   <UnstuckControl busy={busy} send={send}/>
  </fieldset>
  <fieldset><legend>角色与账号</legend><AccountMenu settings/><p className="cu-settings-hint">退出游戏将退出当前账号并返回登录页。</p></fieldset>
  <button className="cu-gold-button cu-settings-return" onClick={onClose}>返回游戏 <kbd>Esc</kbd></button>
 </div>;
}
