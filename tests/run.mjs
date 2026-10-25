import ts from 'typescript';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const dest = new URL('../.test-runtime/', import.meta.url);
await mkdir(dest, { recursive: true });
const sources = {
  'lib/platform.ts': 'platform.mjs',
  'lib/billing.ts': 'billing.mjs',
  'app/api/billing/route.ts': 'billing-route.mjs',
  'app/api/billing-webhook/route.ts': 'billing-webhook.mjs',
  'app/api/account/route.ts': 'account.mjs',
  'app/api/export-batch/route.ts': 'export-batch.mjs',
  'app/api/diagnostics/route.ts': 'diagnostics.mjs',
  'lib/summary-progress.ts': 'summary-progress.mjs',
  'lib/core.ts': 'core.mjs',
  'lib/study.ts': 'study.mjs',
  'lib/pdf.ts': 'pdf.mjs',
  'lib/server.ts': 'server.mjs',
  'lib/provider.ts': 'provider.mjs',
  'lib/plans.ts': 'plans.mjs',
  'lib/imports.ts': 'imports.mjs',
  'app/api/notes/route.ts': 'notes.mjs',
  'app/api/actions/route.ts': 'actions.mjs',
  'app/api/workspace/route.ts': 'workspace.mjs',
  'app/api/transcribe/route.ts': 'transcribe.mjs',
  'app/api/export/route.ts': 'export.mjs',
};
for (const [path, name] of Object.entries(sources)) {
  const text = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const result = ts
    .transpileModule(text, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    })
    .outputText.replaceAll("'cloudflare:workers'", "'./harness.mjs'")
    .replaceAll("'@/lib/billing'", "'./billing.mjs'")
    .replaceAll("'@/app/chatgpt-auth'", "'./harness.mjs'")
    .replaceAll("'@/lib/summary-progress'", "'./summary-progress.mjs'")
    .replaceAll("'@/lib/server'", "'./server.mjs'")
    .replaceAll("'@/lib/core'", "'./core.mjs'")
    .replaceAll("'@/lib/study'", "'./study.mjs'")
    .replaceAll("'@/lib/pdf'", "'./pdf.mjs'")
    .replaceAll("'@/lib/plans'", "'./plans.mjs'")
    .replaceAll("'@/lib/imports'", "'./imports.mjs'")
    .replaceAll("'./platform'", "'./harness.mjs'")
    .replaceAll("'./server'", "'./server.mjs'")
    .replaceAll("'./provider'", "'./provider.mjs'")
    .replaceAll("'./plans'", "'./plans.mjs'")
    .replaceAll("'pdfkit'", "'../node_modules/pdfkit/js/pdfkit.browser.mjs'")
    .replaceAll("'./study'", "'./study.mjs'")
    .replaceAll("'./core'", "'./core.mjs'");
  await writeFile(new URL(name, dest), result);
}
await writeFile(
  new URL('harness.mjs', dest),
  await readFile(new URL('./harness.mjs', import.meta.url)),
);
const result = spawnSync(
  process.execPath,
  process.argv.includes('--live-summary') ? ['--experimental-transform-types', 'tests/live-summary.mjs'] : [
    '--experimental-transform-types',
    '--test',
    'tests/auth.test.mjs',
    'tests/launch-config.test.mjs',
    'tests/signout.test.mjs',
    'tests/security.test.mjs',
    'tests/router.test.mjs',
    'tests/staging-config.test.mjs',
    'tests/core.test.mjs',
    'tests/api.test.mjs',
    'tests/billing.test.mjs',
    'tests/study.test.mjs',
    'tests/platform.test.mjs',
    'tests/pwa.test.mjs',
  ],
  { stdio: 'inherit' },
);
await rm(dest, { recursive: true, force: true });
process.exit(result.status ?? 1);
