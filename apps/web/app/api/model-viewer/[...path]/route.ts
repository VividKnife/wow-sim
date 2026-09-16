import {handleModelRequest} from '@/lib/wowhead-model-assets.js';

export const dynamic='force-dynamic';
export async function GET(request:Request){return handleModelRequest(request);}
