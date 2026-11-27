import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite-plus';

/** What the kit publishes; its README and package.json stay in the repository. */
const TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Publishes the repository's `press-kit/` folder under `press-kit/` on the
 * site, so the docs can show and link the very files the repository holds:
 * read from disk by the dev server, copied into the browser build.
 */
export function pressKit(dir: string): Plugin {
  let base = '/';
  return {
    name: 'docs-press-kit',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent((request.url ?? '').split('?')[0]);
        const prefix = [base + 'press-kit/', '/press-kit/'].find((p) => pathname.startsWith(p));
        if (prefix === undefined) {
          next();
          return;
        }
        const file = path.join(dir, pathname.slice(prefix.length));
        const type = TYPES[path.extname(file)];
        if (!file.startsWith(dir + path.sep) || type === undefined || !existsSync(file)) {
          next();
          return;
        }
        response.setHeader('Content-Type', type);
        createReadStream(file).pipe(response);
      });
    },
    generateBundle() {
      if (this.environment.config.consumer !== 'client') {
        return;
      }
      for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || TYPES[path.extname(entry.name)] === undefined) {
          continue;
        }
        const file = path.join(entry.parentPath, entry.name);
        this.emitFile({
          type: 'asset',
          fileName: 'press-kit/' + path.relative(dir, file).replace(/\\/g, '/'),
          source: readFileSync(file),
        });
      }
    },
  };
}
