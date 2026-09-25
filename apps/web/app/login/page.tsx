'use client';
import {useState} from 'react';
import styles from './login.module.css';

export default function Login() {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className={styles.shell}>
    <div className="eyebrow">WOW-SIM · 艾泽拉斯旅程</div>
    <h1>{register ? '创建冒险账号' : '欢迎归来'}</h1>
    <p>登录后可在不同设备继续你的冒险。</p>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      const data = new FormData(event.currentTarget);
      try {
        const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({username: data.get('username'), password: data.get('password')}),
        });
        const result = await response.json() as {error?: string};
        if (!response.ok) throw new Error(result.error || '暂时无法登录');
        window.location.assign('/');
      } catch (failure) { setError(failure instanceof Error ? failure.message : '连接失败'); }
      finally { setBusy(false); }
    }}>
      <label>用户名<input name="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_\-]+" autoComplete="username" autoCapitalize="none" spellCheck={false}/></label>
      <small>3–32 个英文字母、数字、下划线或短横线，不区分大小写。</small>
      <label>密码<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'}/></label>
      <small>12–128 个字符。请保存好密码，当前尚不提供找回功能。</small>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? '请稍候…' : register ? '注册并开始冒险' : '登录并继续冒险'}</button>
      <button type="button" disabled={busy} onClick={() => {setRegister(!register); setError('');}}>{register ? '已有账号？去登录' : '首次来到这里？创建账号'}</button>
      <a href="/">返回游戏</a>
    </form>
  </main>;
}
