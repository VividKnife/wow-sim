'use client';
import {useState} from 'react';
import {Tabs} from 'radix-ui';
import {Volume2,Monitor,Cog,UserRound} from 'lucide-react';
import './game-settings.css';
import {useLowEffects} from '@/lib/use-low-effects';
import {useBattleZoom} from '@/lib/use-battle-zoom';
import {useAudioPreference} from '@/lib/use-audio-preference';
import type {GameProps} from './game-ui';
import UnstuckControl from './unstuck-control';
import AccountMenu from './account-menu';

export default function GameSettings({state:s,busy,send,onClose}:{state:GameProps['state'];busy:boolean;send:GameProps['send'];onClose:()=>void}){
 const [music,setMusic]=useAudioPreference('musicEnabled'),[musicVolume,setMusicVolume]=useAudioPreference('musicVolume');
 const [effects,setEffects]=useAudioPreference('effectsEnabled'),[effectsVolume,setEffectsVolume]=useAudioPreference('effectsVolume');
 const [lowEffects,setLowEffects]=useLowEffects();
 const [battleZoom,setBattleZoom]=useBattleZoom();
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 return <div className="cu-settings classic-settings">
  <Tabs.Root defaultValue="sound" className="settings-layout" orientation="vertical">
   <Tabs.List className="settings-categories" aria-label="设置分类">
    <span className="settings-category-heading">游戏选项</span>
    <Tabs.Trigger value="sound"><Volume2 size={17}/>声音</Tabs.Trigger>
    <Tabs.Trigger value="graphics"><Monitor size={17}/>画面</Tabs.Trigger>
    <Tabs.Trigger value="gameplay"><Cog size={17}/>游戏</Tabs.Trigger>
    <Tabs.Trigger value="account"><UserRound size={17}/>账号</Tabs.Trigger>
   </Tabs.List>
   <div className="settings-content">
  <Tabs.Content value="sound"><header className="settings-section-heading"><h3>声音</h3><p>调整艾泽拉斯的音乐与环境音效。</p></header><fieldset><legend>音量与播放</legend>
   <label className="cu-setting-toggle"><span>音乐<small>随当前区域播放背景音乐</small></span><input type="checkbox" checked={music} onChange={e=>setMusic(e.target.checked)} aria-label="音乐"/></label>
   <label className="cu-setting-volume"><span>音乐音量</span><input type="range" min="0" max="100" disabled={!music} value={Math.round(musicVolume*100)} onChange={e=>setMusicVolume(Number(e.target.value)/100)} aria-label="音乐音量"/><output>{Math.round(musicVolume*100)}%</output></label>
   <label className="cu-setting-toggle"><span>音效<small>战斗技能与任务提示音</small></span><input type="checkbox" checked={effects} onChange={e=>setEffects(e.target.checked)} aria-label="音效"/></label>
   <label className="cu-setting-volume"><span>音效音量</span><input type="range" min="0" max="100" disabled={!effects} value={Math.round(effectsVolume*100)} onChange={e=>setEffectsVolume(Number(e.target.value)/100)} aria-label="音效音量"/><output>{Math.round(effectsVolume*100)}%</output></label>
  </fieldset></Tabs.Content>
  <Tabs.Content value="graphics"><header className="settings-section-heading"><h3>画面</h3><p>调整特效表现与战斗视野。</p></header><fieldset><legend>画面与特效</legend>
   <label className="cu-setting-toggle"><span>简化特效<small>减少粒子与同屏特效，关闭动态阴影和后期效果，优先保证流畅</small></span><input type="checkbox" checked={lowEffects} onChange={e=>setLowEffects(e.target.checked)} aria-label="简化特效"/></label>
   <label className="cu-setting-volume cu-setting-battle-zoom"><span>战斗默认缩放</span><input type="range" min="50" max="300" step="10" value={Math.round(battleZoom*100)} onChange={e=>setBattleZoom(Number(e.target.value)/100)} aria-label="进入战斗画面默认放大比例"/><output>{Math.round(battleZoom*100)}%</output></label>
   <p className="cu-settings-hint">进入新战斗时使用此比例；战斗中仍可用滚轮或战斗窗口按钮自由缩放。</p>
   <p className="cu-settings-hint">适用于野外、副本和竞技场战斗，不影响战斗计算与伤害统计。</p>
  </fieldset></Tabs.Content>
  <Tabs.Content value="gameplay"><header className="settings-section-heading"><h3>游戏</h3><p>设置战利品拾取方式和角色恢复选项。</p></header><fieldset><legend>战利品</legend>
   <label className="cu-setting-toggle"><span>自动拾取<small>战后自动收取战利品，背包已满时保留掉落</small></span><input type="checkbox" checked={!!s.settings.autoLoot} disabled={busy||saving} aria-label="自动拾取" onChange={async e=>{const next=e.target.checked;setSaving(true);setNotice('');try{const ok=await send({type:'settings',autoLoot:next});setNotice(ok?'拾取设置已保存':'保存失败，请重试。');}finally{setSaving(false);}}}/></label>
   <label className="cu-setting-toggle"><span>跳过灰色物品<small>自动拾取时忽略粗糙品质物品，仍可手动拾取；不会阻塞继续战斗</small></span><input type="checkbox" checked={!!s.settings.autoLootIgnoreGray} disabled={!s.settings.autoLoot||busy||saving} aria-label="跳过灰色物品" onChange={async e=>{const next=e.target.checked;setSaving(true);setNotice('');try{const ok=await send({type:'settings',autoLootIgnoreGray:next});setNotice(ok?'拾取过滤已保存':'保存失败，请重试。');}finally{setSaving(false);}}}/></label>
   <p className="cu-settings-notice" role="status">{saving?'正在保存…':notice}</p>
  </fieldset><fieldset><legend>帮助</legend><UnstuckControl busy={busy} send={send}/>
  </fieldset></Tabs.Content>
  <Tabs.Content value="account"><header className="settings-section-heading"><h3>账号</h3><p>管理当前角色与登录状态。</p></header><fieldset><legend>角色与账号</legend><AccountMenu settings/><p className="cu-settings-hint">退出游戏将退出当前账号并返回登录页。</p></fieldset></Tabs.Content>
   </div>
  </Tabs.Root>
  <footer className="settings-footer"><span>选项修改后自动保存</span><button className="cu-gold-button cu-settings-return" onClick={onClose}>返回游戏 <kbd>Esc</kbd></button></footer>
 </div>;
}
