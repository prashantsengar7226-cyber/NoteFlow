export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
import {z} from 'zod';
import {guard,body,json,handleError,limited} from '@/lib/server';
import {requireAdmin} from '@/lib/access';
import {vertexCostReport,syncCloudCosts} from '@/lib/vertex-costs';
const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export async function GET(request:Request){
  try{
    const owner=await guard(request);await requireAdmin(owner);await limited('cost-read:'+owner,60);
    const value=month.parse(new URL(request.url).searchParams.get('month')||new Date().toISOString().slice(0,7));
    return json(await vertexCostReport(owner,value));
  }catch(error){return handleError(error);}
}
export async function POST(request:Request){
  try{
    const owner=await guard(request,true);await requireAdmin(owner,true);await limited('cost-sync',2);
    const input=z.object({month}).strict().parse(await body(request));
    return json(await syncCloudCosts(owner,input.month));
  }catch(error){return handleError(error);}
}
