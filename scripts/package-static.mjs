// 打包可部署的静态站点：node scripts/package-static.mjs [outDir]
//
// 只复制页面运行期真正会请求的条目（index.html / css / js / vendor）。
// 依据：用 Playwright 实测过本页的全部网络请求，除页面自身文件外没有任何外部请求，
// 因此 shots/（约 10MB 证据截图）、docs/、scripts/ 都不需要进入部署产物。
//
// 本脚本只做复制与校验，不删除任何文件。

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'dist'));
const ENTRIES = ['index.html', 'css', 'js', 'vendor'];

if (out === root) {
  console.error('refusing to package into the project root');
  process.exit(1);
}

for (const entry of ENTRIES) {
  const src = join(root, entry);
  if (!existsSync(src)) {
    console.error(`missing entry: ${entry}`);
    process.exit(1);
  }
  cpSync(src, join(out, entry), { recursive: true });
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push({ path: p, size: st.size });
  }
  return acc;
}

const files = walk(out);
const bytes = files.reduce((n, f) => n + f.size, 0);

// 校验：产物内所有相对引用都能在自己内部解析到
const refRe = /(?:from\s+|import\s*)['"](\.[^'"]+)['"]|(?:href|src)\s*=\s*"(\.[^"]+)"/g;
const missing = [];
let refs = 0;
for (const f of files) {
  if (!/\.(html|js|mjs|css)$/.test(f.path)) continue;
  const text = readFileSync(f.path, 'utf8');
  for (const m of text.matchAll(refRe)) {
    const spec = m[1] ?? m[2];
    if (!spec || spec.startsWith('data:')) continue;
    refs += 1;
    const target = resolve(dirname(f.path), spec);
    if (!existsSync(target)) missing.push(`${f.path.slice(out.length + 1)} -> ${spec}`);
  }
}

console.log(`out=${out}`);
console.log(`files=${files.length} bytes=${bytes} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`relative refs checked=${refs} missing=${missing.length}`);
for (const m of missing) console.log(`  MISSING ${m}`);
process.exit(missing.length === 0 ? 0 : 2);
