export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { db, json } from '@/lib/server';
export async function GET() {
  try {
    await db().prepare('SELECT 1 AS ok').first();
    return json({ status: 'ok', version: '0.6.0' });
  } catch {
    return json({ status: 'unavailable', version: '0.6.0' }, 503);
  }
}
