import {Eye,EyeOff} from 'lucide-react';
import './scene-ui-toggle.css';

export default function SceneUiToggle({hidden,onToggle}:{hidden:boolean;onToggle:()=>void}){
 const label=hidden?'显示 UI':'隐藏 UI';
 return <button type="button" className="scene-ui-toggle" aria-label={label} aria-pressed={hidden} title={hidden?'显示 UI（Esc）':'隐藏全部 UI，只看场景'} onClick={onToggle}>{hidden?<Eye size={16}/>:<EyeOff size={16}/>}<span>{label}</span></button>;
}
