import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createAssistantService } from './ai/assistantService.js';
import { readJsonBody } from './http/body.js';
import { HttpError } from './http/errors.js';
import { createRateLimiter } from './http/rateLimiter.js';
import { createRouter } from './http/router.js';
import { applySecurityHeaders } from './http/security.js';
import { loadStaticFiles, serveStatic } from './http/staticFiles.js';
import { createApiRoutes } from './routes/api.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MAX_URL_LENGTH = 2048;

function sendJson(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function parsePathname(req) {
  if (typeof req.url !== 'string' || req.url.length > MAX_URL_LENGTH) {
    throw new HttpError(414, 'Request URL is too long.');
  }
  try {
    return new URL(req.url, 'http://localhost').pathname;
  } catch {
    throw new HttpError(400, 'Malformed URL.');
  }
}

// Builds the HTTP server without starting it. Static files are read once at
// startup; API routes are plain functions over validated JSON.
export async function createApp({ config, aiClient, logger, now = Date.now, publicDir = DEFAULT_PUBLIC_DIR }) {
  const staticFiles = await loadStaticFiles(publicDir);
  const assistant = createAssistantService({ aiClient, logger, now });
  const router = createRouter(createApiRoutes({ assistant, now }));
  const limiters = {
    general: createRateLimiter({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax, now }),
    ai: createRateLimiter({ windowMs: config.rateLimitWindowMs, max: config.aiRateLimitMax, now }),
  };

  function enforceRateLimits(req, route) {
    const client = req.socket.remoteAddress ?? 'unknown';
    const buckets = route.limit === 'ai' ? [limiters.general, limiters.ai] : [limiters.general];
    for (const limiter of buckets) {
      const { allowed, retryAfterSeconds } = limiter.check(client);
      if (!allowed) {
        throw new HttpError(429, 'Too many requests. Please wait a moment and try again.', {
          headers: { 'Retry-After': String(retryAfterSeconds) },
        });
      }
    }
  }

  async function handleApi(req, res, pathname) {
    const route = router.resolve(req.method, pathname);
    enforceRateLimits(req, route);
    const body = req.method === 'POST' ? await readJsonBody(req, { maxBytes: config.maxBodyBytes }) : undefined;
    sendJson(res, 200, await route.handler({ body }));
  }

  function sendError(res, error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof HttpError) {
      const payload = { error: { message: error.message, ...(error.details ?? {}) } };
      sendJson(res, error.status, payload, error.headers);
      return;
    }
    logger.error('unhandled_error', { name: error?.name, message: error?.message });
    sendJson(res, 500, { error: { message: 'Something went wrong on our side. Please try again.' } });
  }

  const server = http.createServer(async (req, res) => {
    applySecurityHeaders(res);
    const startedAt = performance.now();
    res.once('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.url?.split('?')[0].slice(0, 120),
        status: res.statusCode,
        ms: Math.round(performance.now() - startedAt),
      });
    });

    try {
      const pathname = parsePathname(req);
      if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
      else serveStatic(req, res, pathname, staticFiles);
    } catch (error) {
      sendError(res, error);
    }
  });

  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
