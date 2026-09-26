'use client';

import {useState, type FormEvent} from 'react';
import Link from 'next/link';
import styles from './login.module.css';

export default function Login() {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({username: data.get('username'), password: data.get('password')}),
      });
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || (register ? '暂时无法创建账号，请稍后重试。' : '暂时无法登录，请稍后重试。'));
      window.location.assign('/');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '连接失败，请稍后重试。');
      setBusy(false);
    }
  }

  return <main className={styles.screen}>
    <div className={styles.content}>
      <header className={styles.brand} aria-label="WOW-SIM · 艾泽拉斯旅程">
        <span className={styles.brandOverline}>WORLD OF ADVENTURE</span>
        <strong>WOW<span>·</span>SIM</strong>
        <span className={styles.brandTitle}>艾泽拉斯旅程</span>
        <span className={styles.edition}>经典旧世</span>
      </header>

      <section className={styles.panel} aria-labelledby="auth-title">
        <div className={styles.panelHeading}>
          <span className={styles.ornament} aria-hidden="true">◆</span>
          <h1 id="auth-title">{register ? '创建账号' : '账号登录'}</h1>
          <span className={styles.ornament} aria-hidden="true">◆</span>
        </div>
        <form className={styles.form} onSubmit={submit} aria-busy={busy}>
          <p className={styles.intro}>{register ? '新的旅程，从这里开始。' : '欢迎归来，冒险者。'}</p>
          <div className={styles.field}>
            <label htmlFor="username">账号名称</label>
            <input id="username" name="username" required minLength={3} maxLength={32}
              pattern="[a-zA-Z0-9_\-]+" autoComplete="username" autoCapitalize="none"
              spellCheck={false} disabled={busy} aria-describedby="username-hint" placeholder="输入账号名称"/>
            <small id="username-hint">3–32 个英文字母、数字、下划线或短横线，不区分大小写。</small>
          </div>
          <div className={styles.field}>
            <label htmlFor="password">账号密码</label>
            <input id="password" name="password" type="password" required minLength={12} maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'} disabled={busy}
              aria-describedby="password-hint" placeholder={register ? '设置账号密码' : '输入账号密码'}/>
            <small id="password-hint">12–128 个字符。请保存好密码，当前尚不提供找回功能。</small>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.primary} type="submit" disabled={busy}>
            {busy ? (register ? '正在创建账号…' : '正在连接…') : register ? '注册并开始冒险' : '登录并继续冒险'}
          </button>
          <div className={styles.switchMode}>
            <span>{register ? '已经拥有账号？' : '首次踏入艾泽拉斯？'}</span>
            <button type="button" disabled={busy} onClick={() => {setRegister(!register); setError('');}}>
              {register ? '返回登录' : '创建账号'}
            </button>
          </div>
        </form>
      </section>
      <p className={styles.accountNote}>登录账号，在不同设备继续你的冒险。</p>
    </div>
    <footer className={styles.footer}>
      <span>WOW-SIM <span aria-hidden="true">·</span> 经典旧世冒险</span>
      <Link className={styles.back} href="/">返回游戏</Link>
      <span>艾泽拉斯，等待你的归来</span>
    </footer>
  </main>;
}
