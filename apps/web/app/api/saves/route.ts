import {getAccountUser} from '../../../lib/account-auth';
import {isSameOriginMutation,proxyGameRequest} from '../../../lib/game-backend';

async function handle(request:Request){
 const user=await getAccountUser();
 if(!user)return Response.json({error:'请先登录。'},{status:401});
 if(!isSameOriginMutation(request))return Response.json({error:'请求来源无效'},{status:403});
 return proxyGameRequest(request,{accountId:user.id,path:'/saves',environment:process.env});
}
export {handle as GET,handle as POST,handle as DELETE};
