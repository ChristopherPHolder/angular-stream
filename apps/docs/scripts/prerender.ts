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
 * It then checks every link to a heading (`docs/guides/debugging#quick-checks`)
 * against the ids of the page it points at, and fails on one that is not there.
 * `markdown.ts` already fails on a link to a missing file; a heading is only
 * known once the page is rendered.
 *
 * Last, it writes sitemap.xml, every page at its public address, and llms.txt,
 * the same pages with a line on each, for a language model (`src/app/llms.ts`).
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
  /** The public address of the site, with its trailing slash. */
  SITE: string;
  llmsTxt: () => string;
}
const entry = (await import(path.join(serverDir, entryFile))) as ServerEntry;

const template = await readFile(path.join(serverDir, 'index.server.html'), 'utf8');

/** Each page's HTML by its route, for the check of links to headings below. */
const rendered = new Map<string, string>();

for (const route of entry.PRERENDERED_ROUTES) {
  const html = await entry.default(base + route, template);
  rendered.set(route, html);
  const file = path.join(client, route === '' ? 'index.html' : `${route}.html`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
  console.log(`prerendered /${route} → ${path.relative(client, file)}`);
}

// A link to a heading must find it. Links in the Markdown are relative to the
// base href (`docs/…#id`); the app's own, such as "On this page", start with it.
const ids = new Map(
  [...rendered].map(([route, html]) => [
    route,
    new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])),
  ]),
);
const linkToHeading = new RegExp(`href="(?:${escapeRegExp(base)})?(docs/[^"#?]+)#([^"]+)"`, 'g');
const broken: string[] = [];
for (const [route, html] of rendered) {
  for (const [, target, id] of html.matchAll(linkToHeading)) {
    if (!ids.get(target)?.has(decodeURIComponent(id))) {
      broken.push(`/${route}: no #${id} on /${target}`);
    }
  }
}
if (broken.length > 0) {
  throw new Error(`Links to headings that do not exist:\n  ${[...new Set(broken)].join('\n  ')}`);
}

// Every page but the not-found one, for crawlers. The addresses are the
// published ones (the same the pages name as canonical), whatever DOCS_BASE is.
const urls = entry.PRERENDERED_ROUTES.filter((route) => route !== '404').map(
  (route) => `  <url><loc>${entry.SITE}${route}</loc></url>`,
);
await writeFile(
  path.join(client, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n',
);
console.log(`wrote sitemap.xml: ${urls.length} pages`);

// The same pages for a language model. Every address in it must be one the
// sitemap has: a page that is linked but not published is a broken link.
const llms = entry.llmsTxt();
const published = new Set(entry.PRERENDERED_ROUTES.map((route) => entry.SITE + route));
const unpublished = [...llms.matchAll(/\]\((https?:[^)\s]+)\)/g)]
  .map((match) => match[1])
  .filter((url) => url.startsWith(entry.SITE) && !published.has(url));
if (unpublished.length > 0) {
  throw new Error(`llms.txt links to pages that are not published:\n  ${unpublished.join('\n  ')}`);
}
await writeFile(path.join(client, 'llms.txt'), llms);
console.log('wrote llms.txt');

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pages would otherwise skip files and folders that start with an underscore.
await writeFile(path.join(client, '.nojekyll'), '');
