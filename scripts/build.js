/**
 * 构建脚本：语法检查全部 JS、校验页面资源引用、产出 dist/ 目录。
 * 任一步失败以非零退出码结束。
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync, readFileSync, rmSync, mkdirSync, cpSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';

const fail = (msg) => {
  console.error(`构建失败：${msg}`);
  process.exit(1);
};

const required = [
  'server.js',
  'public/index.html',
  'public/app.js',
  'public/solver.js',
  'public/style.css',
];
for (const f of required) {
  if (!existsSync(f)) fail(`缺少文件 ${f}`);
}

// 1. 语法检查
const jsFiles = [
  'server.js',
  'public/app.js',
  'public/solver.js',
  'scripts/build.js',
  'scripts/smoke.js',
  'test/solver.test.js',
];
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail(`${f} 语法错误：\n${r.stderr}`);
}
console.log('语法检查通过');

// 2. 页面资源引用完整性
const html = readFileSync('public/index.html', 'utf8');
for (const ref of ['style.css', 'app.js']) {
  if (!html.includes(ref)) fail(`index.html 未引用 ${ref}`);
}
const appJs = readFileSync('public/app.js', 'utf8');
if (!appJs.includes("from './solver.js'")) fail('app.js 未引入 solver.js');
console.log('资源引用完整');

// 3. 产出 dist/
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist/public', { recursive: true });
cpSync('server.js', 'dist/server.js');
cpSync('package.json', 'dist/package.json');

const manifest = { builtAt: new Date().toISOString(), files: {} };
for (const f of ['public/index.html', 'public/app.js', 'public/solver.js', 'public/style.css', 'server.js']) {
  manifest.files[f] = createHash('sha256').update(readFileSync(f)).digest('hex');
}
writeFileSync('dist/build-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log('构建完成：dist/');
