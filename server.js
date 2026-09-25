'use strict';

/**
 * 本机 HTTP 服务：
 *   GET  /health      健康检查
 *   POST /api/solve   水渍分布复原（在本机联合枚举求解）
 *   GET  /*           前端静态资源
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { solve, validateInput } = require('./solver');

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 256 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleSolve(req, res) {
  let input;
  try {
    const raw = await readBody(req);
    input = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    sendJson(res, 400, { error: '请求体不是合法的 JSON 或超出大小限制' });
    return;
  }
  const check = validateInput(input);
  if (!check.ok) {
    sendJson(res, 400, { error: '输入校验失败', details: check.errors });
    return;
  }
  try {
    sendJson(res, 200, solve(input));
  } catch (err) {
    if (err && err.code === 'EBUDGET') {
      sendJson(res, 503, { error: '搜索空间超出本机枚举预算，请补充确认标注后重试' });
    } else {
      sendJson(res, 500, { error: '求解器内部错误' });
    }
  }
}

function serveStatic(pathname, res) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function route(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/solve') {
    handleSolve(req, res).catch(() => sendJson(res, 500, { error: '求解器内部错误' }));
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(url.pathname, res);
    return;
  }
  sendJson(res, 405, { error: 'method not allowed' });
}

const server = http.createServer((req, res) => {
  try {
    route(req, res);
  } catch (err) {
    sendJson(res, 500, { error: 'internal error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`stain-restorer listening on http://0.0.0.0:${PORT}`);
  });
}

module.exports = { server };
