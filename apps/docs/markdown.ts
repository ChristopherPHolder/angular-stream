import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked, type Tokens } from 'marked';
import type { Plugin } from 'vite-plus';

for (const [name, language] of Object.entries({
  bash,
  css,
  diff,
  javascript,
  json,
  plaintext,
  typescript,
  xml,
  yaml,
})) {
  hljs.registerLanguage(name, language);
}
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' });
hljs.registerAliases(['js', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts'], { languageName: 'typescript' });
hljs.registerAliases(['jsonc'], { languageName: 'json' });
hljs.registerAliases(['html', 'angular-html'], { languageName: 'xml' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' });

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** What a `.md` import gives the app: the page body as HTML, and its table of contents. */
export interface RenderedPage {
  html: string;
  toc: TocEntry[];
}

export interface MarkdownOptions {
  /** The folder whose `<section>/<page>.md` files are pages at `docs/<section>/<page>`. */
  contentDir: string;
  /** The repository root: links to files outside `contentDir` go to GitHub. */
  repoRoot: string;
  /** Where links to repository files point, e.g. `https://github.com/o/r/blob/main`. */
  repoBlobUrl: string;
}

/**
 * Turns every `.md` import into a rendered page at build time, so neither the
 * Markdown parser nor the highlighter reaches the browser.
 *
 * Links are rewritten for a site served under a base href: every in-site link
 * is relative (`docs/<section>/<page>#id`, no leading slash), `#id` links
 * included, which a base href would otherwise send to the home page. Links to
 * other files in the repository go to GitHub. A link to a missing file fails
 * the build.
 */
export function markdown(options: MarkdownOptions): Plugin {
  return {
    name: 'docs-markdown',
    enforce: 'pre',
    transform(source, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.md')) {
        return null;
      }
      this.addWatchFile(file);
      const page = renderPage(source, file, options);
      return { code: `export default ${JSON.stringify(page)};`, map: null };
    },
  };
}

/** The route of a content file: `content/guides/debugging.md` is `docs/guides/debugging`. */
function routeOf(file: string, contentDir: string): string {
  const relative = path.relative(contentDir, file).replace(/\\/g, '/');
  return 'docs/' + relative.replace(/\.md$/, '');
}

/** GitHub's heading ids: lower case, punctuation dropped, spaces to dashes. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CALLOUTS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

export function renderPage(source: string, file: string, options: MarkdownOptions): RenderedPage {
  const route = routeOf(file, options.contentDir);
  const toc: TocEntry[] = [];
  const seen = new Map<string, number>();

  const resolveHref = (href: string): string => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
      return href;
    }
    if (href.startsWith('#')) {
      return route + href;
    }
    const [target, fragment] = href.split('#') as [string, string | undefined];
    const hash = fragment === undefined ? '' : '#' + fragment;
    const absolute = path.resolve(path.dirname(file), target);
    if (!existsSync(absolute)) {
      throw new Error(`${path.relative(options.repoRoot, file)}: broken link to ${href}`);
    }
    if (absolute.startsWith(options.contentDir + path.sep) && absolute.endsWith('.md')) {
      return routeOf(absolute, options.contentDir) + hash;
    }
    const relative = path.relative(options.repoRoot, absolute).replace(/\\/g, '/');
    const kind = statSync(absolute).isDirectory() ? 'tree' : 'blob';
    return options.repoBlobUrl.replace(/\/blob\//, `/${kind}/`) + '/' + relative + hash;
  };

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const html = this.parser.parseInline(tokens);
        const base = slugify(html);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        if (depth === 2 || depth === 3) {
          toc.push({ id, text: html.replace(/<[^>]+>/g, ''), level: depth });
        }
        return (
          `<h${depth} id="${id}">${html}` +
          `<a class="anchor" href="${route}#${id}" aria-label="Link to this section">#</a>` +
          `</h${depth}>\n`
        );
      },
      code({ text, lang }: Tokens.Code) {
        const info = (lang ?? '').trim();
        const language = info.split(/\s+/)[0] ?? '';
        const title = /title="([^"]+)"/.exec(info)?.[1];
        if (language === 'mermaid') {
          // Drawn in the browser, on pages that have one; the source is the fallback.
          return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
        }
        const known = language !== '' && hljs.getLanguage(language) !== undefined;
        const body = known
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : escapeHtml(text);
        const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '';
        const label = known ? ` data-lang="${escapeHtml(language)}"` : '';
        return `<figure class="code">${caption}<pre${label}><code class="hljs">${body}</code></pre></figure>\n`;
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const body = this.parser.parse(tokens);
        const match = /^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(body);
        if (!match) {
          return `<blockquote>${body}</blockquote>\n`;
        }
        const kind = match[1];
        const rest = body.slice(match[0].length).replace(/^<\/p>\s*/, '');
        const content = rest.startsWith('<') ? rest : '<p>' + rest;
        return (
          `<aside class="callout callout--${kind.toLowerCase()}">` +
          `<p class="callout-title">${CALLOUTS[kind]}</p>${content}</aside>\n`
        );
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        const target = resolveHref(href);
        const external = /^https?:/.test(target);
        const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
        const rel = external ? ' rel="noopener"' : '';
        return `<a href="${escapeHtml(target)}"${titleAttribute}${rel}>${text}</a>`;
      },
    },
    hooks: {
      // Wide tables scroll inside the column instead of widening the page.
      postprocess: (html) =>
        html
          .replace(/<table>/g, '<div class="table-wrap" tabindex="0"><table>')
          .replace(/<\/table>/g, '</table></div>'),
    },
  });

  const html = marked.parse(source, { async: false });
  return { html, toc };
}
