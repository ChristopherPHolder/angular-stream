# docs

The documentation site for angular-ssr-stream: Angular, server-rendered by ngp,
prerendered to static HTML and published to GitHub Pages.

## Develop

```bash
pnpm dev:docs
```

The dev server renders every page on the server, like the built site, and
reloads on edits to the Markdown.

## Build

```bash
pnpm nx build docs
```

`vp build` builds the browser app into `dist/client` and `src/main.server.ts`
into `dist/server` (ngp's `ssr` option). `scripts/prerender.ts` then renders
every route `src/app/docs/nav.ts` lists into `dist/client`, as `<route>.html`,
plus `404.html`. `dist/client` is the whole site.

Each page's description, link preview (`og:*`) and canonical URL are its own
(`src/app/page-head.ts`), and the prerender writes `sitemap.xml`. Those are
absolute URLs, at the address in `SITE` (`src/app/links.ts`): change it there if
the site moves.

The site is built for `/` unless `DOCS_BASE` says otherwise; the Pages workflow
sets it to `/angular-ssr-stream/`. To preview that locally:

```bash
DOCS_BASE=/angular-ssr-stream/ pnpm nx build docs
pnpm nx preview docs   # http://localhost:4173/angular-ssr-stream/
```

`vite preview` serves each page's `.html` file the way Pages does, but answers
an unknown path with the home page rather than `404.html`.

## Write content

Pages are Markdown files at `src/content/<dir>/<page>.md`, served at
`docs/<dir>/<page>`. Add the page to `DOCS` in `src/app/docs/nav.ts` to give it
a title, a description and a place in the contents; the sidebar, the home page,
previous/next links and prerendering all read that list. The page's title comes
from there, so the Markdown starts with its first paragraph, not a `#` heading.

Where a page sits in the contents is its place in `DOCS`, not its folder: the
runtimes' setup pages are in `content/getting-started/` and listed under
"Runtimes", so moving a page in the contents never changes its URL. A section
may be `collapsed` (folded in the sidebar until the reader is in it) and its
pages `alternatives` (previous/next skip them, and the home page shows them as
a choice).

A runtime's setup page also carries `runtime`: the adapter it installs, if any,
and its `apps/example-*`. The page shows those under its title with a link to
the adapter's API page, the API page links back to every setup that uses it,
and the home page lists the runtime. Set it when adding a runtime.

`markdown.ts` renders each page at build time, so neither the parser nor the
highlighter ships to the browser:

- `##` and `###` headings get ids (GitHub's) and make up "On this page".
- Code blocks are highlighted. Name a file with ` ```ts title="src/worker.ts" `.
  Each gets a bar with that name, or else its language, and a copy button.
- ` ```mermaid ` blocks are drawn in the browser, on the pages that have one.
- `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` block
  quotes are callouts.
- Link with relative paths, as you would on GitHub: to another page
  (`../guides/debugging.md#quick-checks`) or to any file in the repository
  (`../../../../../packages/core/src/server/handler.ts`), which becomes a link
  to it on GitHub. A link to a file that does not exist fails the build, and so
  does a link to a heading that does not exist (`scripts/prerender.ts`).

A step several pages share is written once, in `src/content/_shared/`, and
pulled into each page by a line of its own:

```md
## 2. The server config

<!-- include ../_shared/server-config.md -->
```

The heading stays in the page, since its number differs from page to page; the
included file is the text under it. The reader gets the whole step on every
page, and there is one copy to keep right. An included file's links resolve from
the page that includes it, so keep it in a folder next to the pages'. A missing
file fails the build.

The same plugin builds the search index (`virtual:docs-search`): the text of
every page, cut at its `##` and `###` headings, code included. A new page is
searchable once it is listed in `nav.ts`; there is nothing else to do. The index
is a chunk of its own that the browser downloads on the first search.

A page may also hold HTML. The repository's `press-kit/` folder is published
under `press-kit/` (`press-kit.ts`), so `<img src="press-kit/...">` shows one of
its files and `<a href="press-kit/..." download>` links one; these paths are not
checked by the build.

Styles use the PushBased design system (`libs/design-system`); see its
`README.md`. Keep to its tokens, `.pb-*` classes and `.text-*` type styles.
