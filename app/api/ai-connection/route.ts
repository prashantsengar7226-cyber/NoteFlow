export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { guard, body, limited, json, handleError, db, ai } from '@/lib/server';
import { aiContext } from '@/lib/ai-context';
import { AppError } from '@/lib/core';
import { sealKey, personalAIStatus, withAILease, credential, openKey } from '@/lib/personal-ai';
import { providerSchema,modelIdSchema,apiKeySchema } from '@/lib/ai-models';

const inputSchema = z.object({
  provider: providerSchema,
  model: modelIdSchema,
  key: apiKeySchema.optional(),
  revision: z.string().uuid().optional(),
  consent: z.literal(true),
}).strict().refine(v=>Boolean(v.key)!==Boolean(v.revision),'Use a new key or your saved connection.');
export async function GET(r: Request) {
  try { return json(await personalAIStatus(await guard(r))); } catch (e) { return handleError(e); }
}
export async function POST(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(`key-connect:${owner}`, 3);
    const input = inputSchema.parse(await body(r, 4096));
    await withAILease(owner, async () => {
      const saved=await credential(owner);
      if(!input.key&&(!saved||saved.provider!==input.provider||saved.revision!==input.revision))throw new AppError(409,'AI_CONNECTION_CHANGED','Your saved connection changed. Refresh Settings and try again.');
      if(!input.key&&saved?.model===input.model)return;
      const key=input.key??openKey(saved!);
      const revision=crypto.randomUUID();
      const sealed=sealKey(owner,input.provider,input.model,revision,key);
      await aiContext.run({owner,candidate:{provider:input.provider,model:input.model,key}},async()=>{
      const tested = await ai('Return {"ok":true}. This is a connection test.', 'Connection test', z.object({ ok: z.boolean() }), [], 15000);
      if (!tested.ok) throw new AppError(422,'CONNECTION_TEST_FAILED','The model did not pass the connection test. Check the model ID and try again.');
      if(!input.key){
        const updated=await db().prepare('UPDATE ai_credentials SET model=?,ciphertext=?,revision=?,updated_at=? WHERE owner=? AND revision=? RETURNING owner')
          .bind(input.model,sealed,revision,Date.now(),owner,input.revision).first();
        if(!updated)throw new AppError(409,'AI_CONNECTION_CHANGED','Your saved connection changed. Refresh Settings and try again.');
      }else await db().prepare('INSERT INTO ai_credentials(owner,provider,model,ciphertext,revision,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET provider=excluded.provider,model=excluded.model,ciphertext=excluded.ciphertext,revision=excluded.revision,updated_at=excluded.updated_at')
        .bind(owner, input.provider, input.model, sealed, revision, Date.now()).run();
      await db().prepare("UPDATE ai_jobs SET state='cancelled',error_code='AI_CONNECTION_CHANGED',updated_at=? WHERE owner=? AND credential_revision!=? AND state IN ('queued','retry','running')").bind(Date.now(),owner,revision).run();
      });
    });
    return json(await personalAIStatus(owner));
  } catch (e) { return handleError(e); }
}
export async function DELETE(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(`key-connect:${owner}`, 3);
    await db().batch([
      db().prepare('DELETE FROM ai_credentials WHERE owner=?').bind(owner),
      db().prepare("UPDATE ai_jobs SET state='cancelled',error_code='AI_CONNECTION_CHANGED',updated_at=? WHERE owner=? AND credential_revision!='shared' AND state IN ('queued','retry','running')").bind(Date.now(), owner),
    ]);
    return json(await personalAIStatus(owner));
  } catch (e) { return handleError(e); }
}
