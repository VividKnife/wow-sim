import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {isSameOriginMutation, proxyGameRequest} from '../../../lib/game-backend';

const configuration = () => env as unknown as Record<string, unknown>;

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录以读取你的冒险存档。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  return proxyGameRequest(request, {accountId: user.userId, path: '/game', environment: configuration()});
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({error: '请先登录以保存你的冒险。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  if (!isSameOriginMutation(request)) {
    return Response.json({error: '请求来源无效'}, {status: 403, headers: {'cache-control': 'no-store'}});
  }
  return proxyGameRequest(request, {accountId: user.userId, path: '/game', environment: configuration()});
}
