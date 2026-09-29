// 部署前构建：把 public/index.html 内联进 Worker，输出 dist/index.js
// 用法：node scripts/build.mjs
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/index.js'), 'utf8');
const html = readFileSync(join(root, 'public/index.html'), 'utf8');

const PLACEHOLDER = '"__UNI_INDEX_HTML__"';
if (!src.includes(PLACEHOLDER)) throw new Error('placeholder not found in src/index.js');

const out = src.replace(PLACEHOLDER, JSON.stringify(html));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.js'), out);
console.log(`built dist/index.js (${out.length} bytes)`);
