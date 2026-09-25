import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const MAX_BODY = 1024 * 1024; // 1 MiB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 草稿与最近结论的最低限度结构校验，避免写入明显损坏的数据。 */
function isValidState(state) {
  if (state === null || typeof state !== 'object') return false;
  if (state.draft !== null && typeof state.draft !== 'object') return false;
  if (state.result !== null && typeof state.result !== 'object') return false;
  return true;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }
  if (url.pathname === '/api/state' && req.method === 'GET') {
    try {
      const raw = await readFile(STATE_FILE, 'utf8');
      sendJson(res, 200, { saved: true, state: JSON.parse(raw) });
    } catch {
      sendJson(res, 200, { saved: false, state: null });
    }
    return;
  }
  if (url.pathname === '/api/state' && req.method === 'PUT') {
    try {
      const raw = await readBody(req);
      const state = JSON.parse(raw);
      if (!isValidState(state)) {
        sendJson(res, 400, { error: '状态结构非法' });
        return;
      }
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(STATE_FILE, JSON.stringify(state), 'utf8');
      sendJson(res, 200, { saved: true });
    } catch (err) {
      sendJson(res, 400, { error: `保存失败：${err.message}` });
    }
    return;
  }
  sendJson(res, 404, { error: 'Not Found' });
}

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: 'Bad Request' });
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== PUBLIC_DIR) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not Found' });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  try {
    if (url.pathname === '/health' || url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url);
    } else {
      sendJson(res, 405, { error: 'Method Not Allowed' });
    }
  } catch (err) {
    sendJson(res, 500, { error: `服务器内部错误：${err.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`水渍复原应用已启动：http://0.0.0.0:${PORT}（健康检查：/health）`);
});
