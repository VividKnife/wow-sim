import {getAccountUser} from '../../../../lib/account-auth';
import {isSameOriginMutation, proxyGameRequest} from '../../../../lib/game-backend';

export async function POST(request:Request) {
  if (!new URL(request.url).searchParams.get('saveId')) return Response.json({error:'请先选择存档'}, {status:400});
  const user = await getAccountUser();
  if (!user) return Response.json({error:'请先登录以保存冒险进度'}, {status:401});
  if (!isSameOriginMutation(request)) return Response.json({error:'请求来源无效'}, {status:403});
  return proxyGameRequest(request, {accountId:user.id, path:'/game/local', environment:process.env});
}
