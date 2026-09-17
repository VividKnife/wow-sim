import {proxyGameRequest} from '../../../../lib/game-backend';

export async function GET(request: Request) {
  return proxyGameRequest(request, {
    accountId: null,
    public: true,
    path: '/content',
    environment: process.env,
  });
}
