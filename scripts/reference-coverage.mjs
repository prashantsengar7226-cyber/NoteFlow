// Summarize saved REA evidence; parse the oversized entry as inert syntax.
// This does not execute downloaded JavaScript or claim resolved backend behavior.
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const root = 'audit/reference/continuation';
const passes = ['study', 'dependencies', 'transport', 'large'].map(name => {
  const bytes = fs.readFileSync(`${root}/rea-${name}-summary.json`);
  const text = bytes[0] === 255 && bytes[1] === 254 ? bytes.toString('utf16le').replace(/^\uFEFF/, '') : bytes.toString('utf8');
  const view = JSON.parse(text).summary.normalized_result;
  return { name, ...view.summary, unknowns: view.unknowns };
});
const file = '2pTj_kM7.js';
const text = fs.readFileSync(`${root}/assets/${file}`, 'utf8');
const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let nodes = 0, functions = 0;
const imports = new Set();
function visit(node) {
  nodes++;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) functions++;
  if (ts.isStringLiteralLike(node) && /^\.\/[\w-]+\.js$/.test(node.text)) imports.add(node.text);
  ts.forEachChild(node, visit);
}
visit(ast);
const fallback = { file, method: 'TypeScript inert syntax parser; no semantic graph', sha256: createHash('sha256').update(text).digest('hex'), nodes, functions, parseDiagnosticCount: ast.parseDiagnostics.length, imports: [...imports], reason: 'REA complete-fact checkpoint exceeds its fixed 8 MiB ceiling.' };
const report = { checkedAt: new Date().toISOString(), downloadedAssets: fs.readdirSync(`${root}/assets`).filter(f => f.endsWith('.js')).length, reaParsedFiles: passes.reduce((n,p) => n + p.statistics.parsed_javascript_files, 0), passes, fallback, scope: 'Seven selected public study routes and downloaded imports. Semantic resolution is partial; undiscovered dynamic imports, authenticated workflows and private backend behavior are unverified.' };
fs.writeFileSync(`${root}/coverage-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ downloaded: report.downloadedAssets, reaParsed: report.reaParsedFiles, fallback: { file, nodes, functions, parseDiagnosticCount: ast.parseDiagnostics.length }, semanticCoverage: 'partial' }));
