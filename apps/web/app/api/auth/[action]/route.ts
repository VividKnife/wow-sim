import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {accountStore, SESSION_COOKIE} from '../../../../lib/account-auth';
import {SESSION_SECONDS} from '../../../../lib/account-store';
import {isSameOriginMutation} from '../../../../lib/game-backend';
import {clientAddress} from '../../../../lib/client-address';

export const runtime = 'nodejs';
export async function POST(request: Request, context: {params: Promise<{action: string}>}) {
  if (!isSameOriginMutation(request)) return Response.json({error: '请求来源无效'}, {status: 403});
  const {action} = await context.params;
  if (!['login', 'register', 'logout'].includes(action)) return new Response(null, {status: 404});
  try {
    const store = await accountStore();
    let token = '';
    if (action === 'logout') {
      await store.logout((await cookies()).get(SESSION_COOKIE)?.value);
    } else {
      if (!request.headers.get('content-type')?.startsWith('application/json')) {
        return Response.json({error: '需要 JSON 请求'}, {status: 415});
      }
      // Bound both declared and streamed body size before parsing untrusted input.
      const reader = request.body?.getReader();
      if (!reader) return Response.json({error: '缺少登录信息'}, {status: 400});
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4096) { await reader.cancel(); return new Response(null, {status: 413}); }
        chunks.push(value);
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return Response.json({error: '登录信息格式无效'}, {status: 400}); }
      const result = await store[action as 'login' | 'register'](data?.username, data?.password, clientAddress(request));
      token = result.token;
    }
    const response = NextResponse.json({ok: true}, {headers: {'cache-control': 'no-store'}});
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/', maxAge: token ? SESSION_SECONDS : 0,
    });
    return response;
  } catch (error) {
    const status = (error as {status?: number}).status;
    if (status && [400, 401, 409, 429].includes(status)) {
      return Response.json({error: (error as Error).message}, {status, headers: {'cache-control': 'no-store', ...(status === 429 ? {'retry-after': '900'} : {})}});
    }
    console.error('Account service unavailable');
    return Response.json({error: '账号服务暂时不可用，请稍后重试。'}, {status: 503});
  }
}
