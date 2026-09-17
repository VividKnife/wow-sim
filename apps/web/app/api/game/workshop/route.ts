import {getAccountUser} from '../../../../lib/account-auth';
import {proxyGameRequest} from '../../../../lib/game-backend';

export async function GET(request: Request) {
  const user = await getAccountUser();
  if (!user) return Response.json({error: '请先登录以查看工坊。'}, {status: 401, headers: {'cache-control': 'no-store'}});
  return proxyGameRequest(request, {
    accountId: user.id,
    path: '/workshop',
    environment: process.env,
  });
}
