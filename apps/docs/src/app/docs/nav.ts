/** One page: `src/content/<section>/<slug>.md`, served at `docs/<section>/<slug>`. */
export interface DocPageEntry {
  slug: string;
  title: string;
  /** One sentence: the page's meta description and its line on the home page. */
  description: string;
  load: () => Promise<{ default: { html: string; toc: TocEntry[] } }>;
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocSection {
  slug: string;
  title: string;
  pages: DocPageEntry[];
}

/**
 * Every page, in reading order. A page exists once it is listed here: the
 * sidebar, the home page, previous/next links and prerendering all read this.
 */
export const DOCS: DocSection[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    pages: [
      {
        slug: 'introduction',
        title: 'Introduction',
        description:
          'What streamed hydration is: one response, sent in pieces, hydrated while it is still arriving.',
        load: () => import('../../content/getting-started/introduction.md'),
      },
      {
        slug: 'installation',
        title: 'Installation',
        description: 'The packages, what they need, and how to install them.',
        load: () => import('../../content/getting-started/installation.md'),
      },
      {
        slug: 'cloudflare-workers',
        title: 'Cloudflare Workers',
        description:
          'Stream an Angular app from a Cloudflare Worker, from the app config to the deploy.',
        load: () => import('../../content/getting-started/cloudflare-workers.md'),
      },
      {
        slug: 'bun',
        title: 'Bun',
        description:
          'Stream an Angular app from Bun.serve(), or from Elysia, from the app config to production.',
        load: () => import('../../content/getting-started/bun.md'),
      },
      {
        slug: 'deno',
        title: 'Deno',
        description:
          'Stream an Angular app from Deno with Deno.serve, deploy it to Deno Deploy, and what Supabase Edge Functions allow.',
        load: () => import('../../content/getting-started/deno.md'),
      },
    ],
  },
  {
    slug: 'guides',
    title: 'Guides',
    pages: [
      {
        slug: 'making-something-stream',
        title: 'Making something stream',
        description:
          'Which parts of a template stream, which hydrate trigger to pick, and what to expect from them.',
        load: () => import('../../content/guides/making-something-stream.md'),
      },
      {
        slug: 'debugging',
        title: 'Debugging and verifying',
        description:
          'How to tell that a page really streams and hydrates, and what to do when it does not.',
        load: () => import('../../content/guides/debugging.md'),
      },
    ],
  },
  {
    slug: 'concepts',
    title: 'How it works',
    pages: [
      {
        slug: 'why-stream-out-of-order',
        title: 'Why stream out of order',
        description:
          'What streaming out of order buys a page, and how other frameworks came to it.',
        load: () => import('../../content/concepts/why-stream-out-of-order.md'),
      },
      {
        slug: 'walkthrough',
        title: 'One response, flush by flush',
        description:
          'A real response taken apart: the HTML each flush carries, and when each part hydrates.',
        load: () => import('../../content/concepts/walkthrough.md'),
      },
      {
        slug: 'internals',
        title: 'Wire format and internals',
        description:
          'The chunk format, what the server does on each flush, and what the browser does with it.',
        load: () => import('../../content/concepts/internals.md'),
      },
    ],
  },
  {
    slug: 'reference',
    title: 'Reference',
    pages: [
      {
        slug: 'core',
        title: 'angular-stream-core',
        description:
          'The API of @push-based/angular-stream-core: the client providers and the runtime-agnostic server handler.',
        load: () => import('../../content/reference/core.md'),
      },
      {
        slug: 'cloudflare',
        title: 'angular-stream-cloudflare',
        description:
          'The API of @push-based/angular-stream-cloudflare: a Worker fetch handler over the ASSETS binding.',
        load: () => import('../../content/reference/cloudflare.md'),
      },
      {
        slug: 'limitations',
        title: 'Caveats and limitations',
        description: 'What does not work yet, and why.',
        load: () => import('../../content/reference/limitations.md'),
      },
      {
        slug: 'press-kit',
        title: 'Press kit',
        description: 'The angular-stream logo: the files, the colours and how to use them.',
        load: () => import('../../content/reference/press-kit.md'),
      },
    ],
  },
];

export interface FlatDocPage extends DocPageEntry {
  section: DocSection;
  /** `docs/<section>/<slug>`, relative to the base href. */
  path: string;
}

export const ALL_PAGES: FlatDocPage[] = DOCS.flatMap((section) =>
  section.pages.map((page) => ({
    ...page,
    section,
    path: `docs/${section.slug}/${page.slug}`,
  })),
);

export function findPage(section: string, slug: string): FlatDocPage | undefined {
  return ALL_PAGES.find((page) => page.section.slug === section && page.slug === slug);
}

/** What `scripts/prerender.ts` writes, relative to the base href. `404` becomes `404.html`. */
export const PRERENDERED_ROUTES: string[] = ['', ...ALL_PAGES.map((page) => page.path), '404'];
