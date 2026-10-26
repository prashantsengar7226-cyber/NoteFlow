import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverableImport} from '../.test-runtime/api-client.mjs';

for (const failure of ['truncated-success', 'network', 'gateway']) {
  test(`import recovers ${failure} without repeating the write`, async () => {
    const original = globalThis.fetch;
    const requests = [];
    const requestId = crypto.randomUUID();
    const note = {id: crypto.randomUUID(), status:'ready'};
    globalThis.fetch = async (path, options) => {
      requests.push({path, method:options.method});
      if (options.method === 'POST') {
        if (failure === 'network') throw new TypeError('Failed to fetch');
        return new Response(failure === 'gateway' ? '<html>Gateway error</html>' : '{"note":', {status:failure === 'gateway' ? 502 : 201});
      }
      return Response.json({note});
    };
    try {
      assert.deepEqual(await recoverableImport({requestId,kind:'text'}),{note});
      assert.deepEqual(requests,[{path:'/api/notes',method:'POST'},{path:`/api/notes?requestId=${requestId}`,method:'GET'}]);
    } finally { globalThis.fetch = original; }
  });
}

test('authentication and validation errors do not trigger import recovery', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401,400,403,429]) {
      let calls = 0;
      globalThis.fetch = async () => {calls++; return Response.json({error:'Denied'}, {status});};
      await assert.rejects(recoverableImport({requestId:crypto.randomUUID()}));
      assert.equal(calls,1);
    }
  } finally {globalThis.fetch = original;}
});
