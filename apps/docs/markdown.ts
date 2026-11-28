import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
import { FIGURES } from './src/app/figures/names';

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
    resolveId(id) {
      return id === SEARCH_MODULE ? '\0' + SEARCH_MODULE : null;
    },
    // The search index: every page's text, section by section. A module of its
    // own, so it is a chunk of its own that only a search downloads.
    load(id) {
      if (id !== '\0' + SEARCH_MODULE) {
        return null;
      }
      const entries: SearchEntry[] = [];
      for (const file of contentFiles(options.contentDir)) {
        const { source, included } = withIncludes(readFileSync(file, 'utf8'), file, options);
        for (const watched of [file, ...included]) {
          this.addWatchFile(watched);
        }
        const { html } = renderPage(source, file, options);
        entries.push(...searchEntries(routeOf(file, options.contentDir), html));
      }
      return { code: `export default ${JSON.stringify(entries)};`, map: null };
    },
    transform(source, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.md')) {
        return null;
      }
      const whole = withIncludes(source, file, options);
      for (const watched of [file, ...whole.included]) {
        this.addWatchFile(watched);
      }
      const page = renderPage(whole.source, file, options);
      return { code: `export default ${JSON.stringify(page)};`, map: null };
    },
  };
}

/** What the app imports the search index as; `src/types.d.ts` declares it. */
const SEARCH_MODULE = 'virtual:docs-search';

/** One section of one page, as plain text: what a search looks through. */
export interface SearchEntry {
  /** The page: `docs/<dir>/<page>`. */
  path: string;
  /** The section's heading id, or `''` for what comes before the first heading. */
  id: string;
  /** The section's heading, or `''`. */
  heading: string;
  text: string;
}

/**
 * A line that is replaced by another file's Markdown: a step several pages
 * share, written once. The path is relative to the page, like a link.
 */
const INCLUDE = /^<!-- include (\S+) -->$/gm;

/**
 * Puts each included file in the place of its `<!-- include … -->` line. The
 * text is inlined before it is rendered, so its links resolve from the page
 * that includes it: keep included files one folder down from `contentDir`,
 * like the pages, and the same relative link works from both. An included file
 * cannot include another.
 */
export function withIncludes(
  source: string,
  file: string,
  options: MarkdownOptions,
): { source: string; included: string[] } {
  const included: string[] = [];
  const whole = source.replace(INCLUDE, (_, target: string) => {
    const absolute = path.resolve(path.dirname(file), target);
    if (!existsSync(absolute)) {
      throw new Error(`${path.relative(options.repoRoot, file)}: nothing to include at ${target}`);
    }
    included.push(absolute);
    return readFileSync(absolute, 'utf8').trim();
  });
  return { source: whole, included };
}

/** A line that places a figure: `DocPage` renders the component there. */
const FIGURE_LINE = /^<!-- figure (\S*) -->$/gm;

/** Fails the build on a figure that does not exist, like a broken link. */
function checkFigures(source: string, file: string, options: MarkdownOptions): void {
  for (const [, name] of source.matchAll(FIGURE_LINE)) {
    if (!(FIGURES as readonly string[]).includes(name)) {
      throw new Error(
        `${path.relative(options.repoRoot, file)}: no figure called "${name}" (there is ${FIGURES.join(', ')})`,
      );
    }
  }
}

/**
 * Every page: the `.md` files one folder down from `contentDir`, in a stable
 * order. A folder that starts with `_` holds included files, not pages.
 */
function contentFiles(contentDir: string): string[] {
  return readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .flatMap((dir) =>
      readdirSync(path.join(contentDir, dir.name))
        .filter((file) => file.endsWith('.md'))
        .map((file) => path.join(contentDir, dir.name, file)),
    )
    .sort();
}

/**
 * Splits a rendered page at its `h2` and `h3` headings, the ones with a place
 * in "On this page", and reduces each part to its text. Code is kept: an
 * option's name is what people search for. Diagrams, the copy buttons and the
 * headings' link icons are not text of the page.
 */
export function searchEntries(route: string, html: string): SearchEntry[] {
  const content = html
    .replace(/<pre class="mermaid"[^>]*>[\s\S]*?<\/pre>/g, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<a class="anchor"[^>]*>[\s\S]*?<\/a>/g, '');
  return content
    .split(/(?=<h[23] id=")/)
    .map((part) => {
      const heading = /^<h[23] id="([^"]*)">([\s\S]*?)<\/h[23]>/.exec(part);
      return {
        path: route,
        id: heading?.[1] ?? '',
        heading: toText(heading?.[2] ?? ''),
        text: toText(heading ? part.slice(heading[0].length) : part),
      };
    })
    .filter((entry) => entry.heading !== '' || entry.text !== '');
}

/**
 * HTML to the text it shows, on one line. Inline tags go without a trace, so
 * highlighted code reads `allowedHosts: [` and not `allowedHosts : [`; any
 * other tag separates words.
 */
function toText(html: string): string {
  return html
    .replace(/<\/?(?:span|code|strong|em|a|wbr)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
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

/**
 * Lets a long identifier in inline code wrap after a separator
 * (`@push-based/<wbr>angular-ssr-stream-node`, `app.<wbr>component.<wbr>html`)
 * instead of in the middle of a word. Only between a word and a letter, so
 * `22.3.0`, `...` and `.html` stay whole, and only in a long one: a short one
 * (`/api/hello`, `src/server.ts`) reads better moved to the next line whole.
 * Takes escaped HTML: no entity holds one of these characters.
 */
function breakable(html: string): string {
  if (html.length <= LONGEST_UNBROKEN_CODE) {
    return html;
  }
  return html.replace(/(?<=[\w)\]])([/.:(,])(?=[A-Za-z_$])/g, '$1<wbr>');
}

/** In characters: about half a line of a phone's column. */
const LONGEST_UNBROKEN_CODE = 24;

const CALLOUTS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

export function renderPage(source: string, file: string, options: MarkdownOptions): RenderedPage {
  checkFigures(source, file, options);
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
          return `<pre class="mermaid" tabindex="0">${escapeHtml(text)}</pre>\n`;
        }
        const known = language !== '' && hljs.getLanguage(language) !== undefined;
        const body = known
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : escapeHtml(text);
        const label = known ? ` data-lang="${escapeHtml(language)}"` : '';
        // Above every block: its file name, or else its language, and the copy
        // button, which `DocPage` handles: this HTML carries no script.
        const name = escapeHtml(title ?? (known ? language : ''));
        const bar =
          `<div class="code-bar"><span class="code-title">${name}</span>` +
          `<button type="button" class="code-copy">Copy</button></div>`;
        // `tabindex`: a block that scrolls sideways has to be reachable by keyboard.
        return `<div class="code">${bar}<pre tabindex="0"${label}><code class="hljs">${body}</code></pre></div>\n`;
      },
      codespan({ text }: Tokens.Codespan) {
        return `<code>${breakable(escapeHtml(text))}</code>`;
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
