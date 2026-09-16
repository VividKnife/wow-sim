import {env} from 'cloudflare:workers';
import {proxyGameRequest} from '../../../../lib/game-backend';

export async function GET(request: Request) {
  return proxyGameRequest(request, {
    accountId: null,
    public: true,
    path: '/content',
    environment: env as unknown as Record<string, unknown>,
  });
}
