import {getAccountUser} from '../../../lib/account-auth';
import {isSameOriginMutation, proxyGameRequest} from '../../../lib/game-backend';

const configuration = () => process.env;

export async function GET(request: Request) {
  if(!new URL(request.url).searchParams.get('saveId'))return Response.json({error:'请先选择存档'},{status:400});
  const user = await getAccountUser();
  if (!user) return Response.json({error: '请先登录以读取你的冒险存档。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  return proxyGameRequest(request, {accountId: user.id, path: '/game', environment: configuration()});
}

export async function POST(request: Request) {
  if(!new URL(request.url).searchParams.get('saveId'))return Response.json({error:'请先选择存档'},{status:400});
  const user = await getAccountUser();
  if (!user) return Response.json({error: '请先登录以保存你的冒险。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  if (!isSameOriginMutation(request)) {
    return Response.json({error: '请求来源无效'}, {status: 403, headers: {'cache-control': 'no-store'}});
  }
  return proxyGameRequest(request, {accountId: user.id, path: '/game', environment: configuration()});
}
