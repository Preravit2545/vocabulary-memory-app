/**
 * Local development server for API functions.
 * Runs on port 3001 and proxies requests to the appropriate handler.
 *
 * Usage (from project root):
 *   node --env-file=.env.local --experimental-strip-types api/dev-server.mjs
 */

import { createServer } from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3001;

// Resolve handler path relative to this file (api/ directory)
function handlerPath(relativePath) {
  return pathToFileURL(join(__dirname, relativePath)).href;
}

// Cache-bust to allow hot reload
function bustCache(url) {
  return url + '?t=' + Date.now();
}

async function loadHandler(relativePath) {
  const mod = await import(bustCache(handlerPath(relativePath)));
  return mod.default;
}

function makeReq(req, body, params = {}) {
  return Object.assign(req, {
    query: params,
    body: body ? (() => { try { return JSON.parse(body); } catch { return {}; } })() : {},
  });
}

function makeRes(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    setHeader(k, v) { res.setHeader(k, v); return this; },
    json(data) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      }
    },
    end(data) { if (!res.headersSent) res.end(data); },
    redirect(url) {
      res.statusCode = 302;
      res.setHeader('Location', url);
      res.end();
    },
  };
}

async function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const body = await getBody(req);

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  console.log(`[${req.method}] ${path}`);

  try {
    if (path === '/api/auth/signin/google' || path === '/api/auth/google') {
      const handler = await loadHandler('auth/signin.ts');
      await handler(makeReq(req, body), makeRes(res));

    } else if (path === '/api/auth/callback/google') {
      const params = Object.fromEntries(url.searchParams);
      const handler = await loadHandler('auth/callback/google.ts');
      await handler(makeReq(req, body, params), makeRes(res));

    } else if (path === '/api/auth/session') {
      const handler = await loadHandler('auth/session.ts');
      await handler(makeReq(req, body), makeRes(res));

    } else if (path === '/api/auth/signout') {
      const handler = await loadHandler('auth/signout.ts');
      await handler(makeReq(req, body), makeRes(res));

    } else if (path === '/api/vocabulary') {
      const handler = await loadHandler('vocabulary/index.ts');
      await handler(makeReq(req, body), makeRes(res));

    } else if (path.match(/^\/api\/vocabulary\/[^/]+$/)) {
      const id = path.split('/').pop();
      const handler = await loadHandler('vocabulary/[id].ts');
      await handler(makeReq(req, body, { id }), makeRes(res));

    } else if (path === '/api/review-sessions') {
      const handler = await loadHandler('review-sessions/index.ts');
      await handler(makeReq(req, body), makeRes(res));

    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `No handler for ${path}` }));
    }
  } catch (err) {
    console.error(`[ERROR ${path}]`, err.message);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`\nAPI dev server running at http://localhost:${PORT}`);
  console.log('Routes available:');
  console.log('  GET  /api/auth/signin/google  → redirect to Google');
  console.log('  GET  /api/auth/callback/google → OAuth callback');
  console.log('  GET  /api/auth/session         → current session');
  console.log('  POST /api/auth/signout         → sign out');
  console.log('  GET/POST /api/vocabulary');
  console.log('  PUT/DELETE /api/vocabulary/:id');
  console.log('  GET/POST /api/review-sessions\n');
});
