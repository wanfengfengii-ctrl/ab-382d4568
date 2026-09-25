'use strict';

/**
 * 构建脚本：语法校验全部 JS 源文件，校验静态资源完整性，
 * 并将运行所需文件组装到 dist/（镜像以 dist/ 为运行目录）。
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

// 1. 语法校验
const jsFiles = [
  ...listJs(path.join(ROOT, 'scripts')),
  ...listJs(path.join(ROOT, 'test')),
  path.join(ROOT, 'server.js'),
  path.join(ROOT, 'solver.js'),
  path.join(ROOT, 'public', 'app.js'),
];
for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`syntax ok (${jsFiles.length} files)`);

// 2. 静态资源完整性
for (const asset of ['index.html', 'styles.css', 'app.js']) {
  const p = path.join(ROOT, 'public', asset);
  if (!fs.existsSync(p)) throw new Error(`missing public asset: ${asset}`);
}

// 3. 组装 dist/
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'public'), { recursive: true });
for (const f of ['server.js', 'solver.js', 'package.json']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(DIST, f));
}
for (const f of fs.readdirSync(path.join(ROOT, 'public'))) {
  fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, 'public', f));
}
fs.writeFileSync(
  path.join(DIST, 'build-info.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), node: process.version }, null, 2) + '\n'
);
console.log('build ok -> dist/');
