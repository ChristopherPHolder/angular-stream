# docs

The documentation site for angular-stream: Angular, server-rendered by ngp,
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

The site is built for `/` unless `DOCS_BASE` says otherwise; the Pages workflow
sets it to `/angular-stream/`. To preview that locally:

```bash
DOCS_BASE=/angular-stream/ pnpm nx build docs
pnpm nx preview docs   # http://localhost:4173/angular-stream/
```

`vite preview` serves each page's `.html` file the way Pages does, but answers
an unknown path with the home page rather than `404.html`.

## Write content

Pages are Markdown files at `src/content/<section>/<page>.md`, served at
`docs/<section>/<page>`. Add the page to `DOCS` in `src/app/docs/nav.ts` to give
it a title, a description and a place in the sidebar; the home page,
previous/next links and prerendering all read that list. The page's title comes
from there, so the Markdown starts with its first paragraph, not a `#` heading.

`markdown.ts` renders each page at build time, so neither the parser nor the
highlighter ships to the browser:

- `##` and `###` headings get ids (GitHub's) and make up "On this page".
- Code blocks are highlighted. Name a file with ` ```ts title="src/worker.ts" `.
- ` ```mermaid ` blocks are drawn in the browser, on the pages that have one.
- `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` block
  quotes are callouts.
- Link with relative paths, as you would on GitHub: to another page
  (`../guides/debugging.md#quick-checks`) or to any file in the repository
  (`../../../../../packages/core/src/server/handler.ts`), which becomes a link
  to it on GitHub. A link to a file that does not exist fails the build.

Styles use the PushBased design system (`libs/design-system`); see its
`README.md`. Keep to its tokens, `.pb-*` classes and `.text-*` type styles.
