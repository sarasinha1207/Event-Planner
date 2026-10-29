import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { HttpError } from './errors.js';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
});

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
// Files are compressed once at startup, so the slowest and smallest setting is used.
const BROTLI_QUALITY = 11;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    }),
  );
  return nested.flat();
}

/**
 * Loads every file under `root` into memory once at startup. Requests are
 * answered by exact lookup in this table, so a request path can never reach a
 * file that was not in the public folder.
 *
 * @param {string} root Folder that holds the website files.
 * @returns {Promise<Map<string, object>>}
 */
export async function loadStaticFiles(root) {
  const files = new Map();
  for (const filePath of await listFiles(root)) {
    const extension = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[extension];
    if (!type) continue;

    const body = await readFile(filePath);
    const urlPath = `/${path.relative(root, filePath).split(path.sep).join('/')}`;
    files.set(urlPath, {
      type,
      body,
      gzip: COMPRESSIBLE.has(extension) ? gzipSync(body) : null,
      br: COMPRESSIBLE.has(extension) ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }) : null,
      etag: `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`,
    });
  }
  return files;
}

function lookupPath(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new HttpError(400, 'Malformed URL.');
  }
  return decoded === '/' ? '/index.html' : decoded;
}

// Brotli is preferred over gzip, and either is used only if the file has it and the browser accepts it.
function chooseEncoding(file, acceptEncoding) {
  if (file.br && /\bbr\b/.test(acceptEncoding)) return 'br';
  if (file.gzip && /\bgzip\b/.test(acceptEncoding)) return 'gzip';
  return null;
}

/**
 * Answers a GET or HEAD request for a file in the table, with caching and compression.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} pathname
 * @param {Map<string, object>} files From `loadStaticFiles`.
 * @returns {void}
 * @throws {HttpError} 400, 404 or 405.
 */
export function serveStatic(req, res, pathname, files) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    throw new HttpError(405, 'Method not allowed.', { headers: { Allow: 'GET, HEAD' } });
  }

  const file = files.get(lookupPath(pathname));
  if (!file) throw new HttpError(404, 'Not found.');

  res.setHeader('Content-Type', file.type);
  res.setHeader('ETag', file.etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Accept-Encoding');

  if (req.headers['if-none-match'] === file.etag) {
    res.writeHead(304);
    res.end();
    return;
  }

  const encoding = chooseEncoding(file, String(req.headers['accept-encoding'] ?? ''));
  const body = encoding ? file[encoding] : file.body;
  if (encoding) res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
}
