import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {proxyGameRequest} from '../../../../lib/game-backend';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录以查看工坊。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  return proxyGameRequest(request, {
    accountId: user.userId,
    path: '/workshop',
    environment: env as unknown as Record<string, unknown>,
  });
}
