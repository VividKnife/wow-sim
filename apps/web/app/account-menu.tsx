'use client';
import {useState} from 'react';
export default function AccountMenu({username}: {username: string}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: '6px 16px', fontSize: 12}}>
    <a href="/">角色选择</a><span>{username}</span><button disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try {
        const response = await fetch('/api/auth/logout', {method: 'POST'});
        if (!response.ok) throw new Error();
        window.location.assign('/login');
      } catch { setError('退出失败，请重试'); setBusy(false); }
    }}>退出账号</button>{error && <span role="alert">{error}</span>}
  </div>;
}
