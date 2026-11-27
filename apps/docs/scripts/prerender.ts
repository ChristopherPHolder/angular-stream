/**
 * Prerenders every docs route to static HTML, after `vp build`.
 *
 * ngp builds the browser app into dist/client and the server entry
 * (src/main.server.ts) into dist/server. This renders each route the entry
 * lists into dist/server/index.server.html and writes it to dist/client, as
 * `<route>.html`, which GitHub Pages serves for the extensionless URL.
 *
 * index.server.html is the built index.html plus Angular's event dispatch
 * contract, which `withEventReplay()` needs to queue the clicks made before
 * the page hydrates. Rendered into dist/client/index.html, the pages would
 * lose those clicks without an error.
 * `404` becomes 404.html, Pages' page for every unknown path.
 *
 * `DOCS_BASE` must match the one the build ran with.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const client = path.join(dist, 'client');
const base = process.env['DOCS_BASE'] ?? '/';

const serverDir = path.join(dist, 'server');
const entryFile = (await readdir(serverDir)).find((file) => /^main\.server.*\.js$/.test(file));
if (entryFile === undefined) {
  throw new Error(`No server entry in ${serverDir}`);
}

interface ServerEntry {
  default: (url: string, document: string) => Promise<string>;
  PRERENDERED_ROUTES: string[];
}
const entry = (await import(path.join(serverDir, entryFile))) as ServerEntry;

const template = await readFile(path.join(serverDir, 'index.server.html'), 'utf8');

for (const route of entry.PRERENDERED_ROUTES) {
  const html = await entry.default(base + route, template);
  const file = path.join(client, route === '' ? 'index.html' : `${route}.html`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
  console.log(`prerendered /${route} → ${path.relative(client, file)}`);
}

// Pages would otherwise skip files and folders that start with an underscore.
await writeFile(path.join(client, '.nojekyll'), '');
