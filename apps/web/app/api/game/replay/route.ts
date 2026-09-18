import {getAccountUser} from '../../../../lib/account-auth';
import {proxyGameRequest} from '../../../../lib/game-backend';

export async function GET(request: Request) {
  const user = await getAccountUser();
  if (!user) return Response.json({error: '请先登录以读取战斗回放。'}, {status: 401});
  return proxyGameRequest(request, {accountId: user.id, path: '/game/replay', environment: process.env});
}
