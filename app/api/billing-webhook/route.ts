export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { json, handleError } from '@/lib/server';
import { handleWebhook } from '@/lib/billing';
// Public server-to-server endpoint; authenticated exclusively by raw-body HMAC.
export async function POST(request: Request) {
  try {
    return json(await handleWebhook(request));
  } catch (error) {
    return handleError(error);
  }
}
