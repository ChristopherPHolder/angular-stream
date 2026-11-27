import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { requestPath } from './request';

/**
 * Serves one request from a folder, if it names a file there. Resolves `true`
 * when it answered the request, `false` when the request is left to whatever
 * comes next.
 */
export type StaticHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * A static file handler for the browser build (`dist/client`).
 *
 * It answers `GET` and `HEAD` for files in `dir` and leaves everything else
 * alone: other methods, folders, paths outside `dir`, files that don't exist,
 * and every `.html` file, in any case. A page is never served as a file, so
 * `/`, `/index.html` and `/INDEX.HTML` reach the renderer, which renders them
 * into the template.
 *
 * Files under `assets/`, which Vite names by their content hash, are cached
 * for a year; everything else is revalidated on each use. A missing `dir` is
 * not an error: nothing is served from it.
 */
export function createStaticHandler(dir: string | URL): StaticHandler {
  const root = path.resolve(typeof dir === 'string' ? dir : fileURLToPath(dir));

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return false;
    }

    const file = resolveFile(root, req.url ?? '/');
    // Any case: on a case-insensitive disk, `/INDEX.HTML` is `index.html`.
    // `resolveFile()` has decoded the path, so `/index%2Ehtml` is too.
    const extension = file === null ? '' : path.extname(file).toLowerCase();
    // `.htm` too: NTFS can give `index.html` the short name `INDEX~1.HTM`.
    if (file === null || extension === '.html' || extension === '.htm') {
      return false;
    }

    const stats = await stat(file).catch(() => null);
    if (stats === null || !stats.isFile()) {
      return false;
    }

    const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const immutable = path.relative(root, file).split(path.sep)[0]?.toLowerCase() === 'assets';
    res.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream');
    res.setHeader(
      'Cache-Control',
      immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    );
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', stats.mtime.toUTCString());

    if (matchesEtag(req.headers['if-none-match'], etag)) {
      res.statusCode = 304;
      res.end();
      return true;
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', stats.size);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }

    // A failed read cuts the connection; `pipeline` has already destroyed `res`.
    await pipeline(createReadStream(file), res).catch(() => undefined);
    return true;
  };
}

/**
 * Whether `If-None-Match` names the file's ETag: `*`, or a list that holds it.
 * The comparison is weak, as it is for `GET` and `HEAD`: `W/` is ignored.
 */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (header === undefined) {
    return false;
  }
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.trim() === '*' || header.split(',').some((tag) => opaque(tag) === opaque(etag));
}

/** The file a URL names inside `root`, or `null` when it names nothing inside it. */
function resolveFile(root: string, url: string): string | null {
  let pathname: string;
  try {
    // The path the renderer would see: `//x/favicon.svg` is `/x/favicon.svg`, not `favicon.svg` on host `x`.
    pathname = decodeURIComponent(new URL(requestPath(url), 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) {
    return null;
  }

  const file = path.join(root, pathname);
  const relative = path.relative(root, file);
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative) ? null : file;
}
