/** One page: `src/content/<dir>/<slug>.md`, served at `docs/<dir>/<slug>`. */
export interface DocPageEntry {
  /**
   * The content folder, and the first segment of the URL. Where the page sits
   * in the navigation is its place in `DOCS`, so a page can move there without
   * its URL changing.
   */
  dir: string;
  slug: string;
  /** The page's name among the others: the sidebar, previous and next, search. */
  title: string;
  /**
   * Its name where it stands alone: the heading on the page, the browser tab,
   * a search result and a link preview. "Express" says enough in the sidebar
   * and nothing in a list of results. Left out where `title` already does;
   * read it with `headlineOf()`.
   */
  headline?: string;
  /** One sentence: the page's meta description and its line on the home page. */
  description: string;
  /** Set on a runtime's setup page: shown under its title, and on the home page. */
  runtime?: RuntimeFacts;
  load: () => Promise<{ default: { html: string; toc: TocEntry[] } }>;
}

/** What a runtime's setup is made of, besides the core. */
export interface RuntimeFacts {
  /**
   * `<adapter>` in `@push-based/angular-ssr-stream-<adapter>`, which is also the
   * slug of its API page. Left out for a runtime that speaks `Request` and
   * `Response` itself, where the core is the whole server.
   */
  adapter?: string;
  /** The apps in the repository that are this setup: `apps/<example>`. */
  examples: string[];
}

export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Pages listed together; a section with one untitled group is a plain list. */
export interface DocGroup {
  title?: string;
  pages: DocPageEntry[];
}

export interface DocSection {
  id: string;
  title: string;
  /** One sentence, for the home page. */
  description: string;
  /**
   * The pages are alternatives, not a sequence: a reader needs one of them.
   * Previous and next skip them (`neighboursOf()`).
   */
  alternatives?: boolean;
  /** Folded in the sidebar until the reader is in it or opens it. */
  collapsed?: boolean;
  groups: DocGroup[];
}

/**
 * Every page, in reading order. A page exists once it is listed here: the
 * sidebar, the home page, previous/next links and prerendering all read this.
 */
export const DOCS: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    description: 'What it is, what it needs, and which packages to install.',
    groups: [
      {
        pages: [
          {
            dir: 'getting-started',
            slug: 'introduction',
            title: 'Introduction',
            headline: 'Introduction: streaming SSR for Angular',
            description:
              'What streamed hydration is: one response, sent in pieces, hydrated while it is still arriving.',
            load: () => import('../../content/getting-started/introduction.md'),
          },
          {
            dir: 'getting-started',
            slug: 'installation',
            title: 'Installation',
            headline: 'Installing streaming SSR in an Angular app',
            description: 'The packages, what they need, and how to install them.',
            load: () => import('../../content/getting-started/installation.md'),
          },
        ],
      },
    ],
  },
  {
    id: 'runtimes',
    title: 'Runtimes',
    description: 'One setup page per server or platform. You need only yours.',
    alternatives: true,
    collapsed: true,
    groups: [
      {
        title: 'Angular CLI',
        pages: [
          {
            dir: 'getting-started',
            slug: 'angular-cli',
            title: 'Angular CLI',
            description:
              'Stream the server-rendered routes of an app made by ng new --ssr, built by ng build and served by @angular/ssr.',
            runtime: { adapter: 'angular-ssr', examples: ['example-angular-cli'] },
            load: () => import('../../content/getting-started/angular-cli.md'),
          },
        ],
      },
      {
        title: 'Node and its frameworks',
        pages: [
          {
            dir: 'getting-started',
            slug: 'node',
            title: 'Node',
            headline: 'Angular SSR on Node, with streaming',
            description:
              'Stream an Angular app from Node with node:http, Express or Connect, from the app config to running it in production.',
            runtime: { adapter: 'node', examples: ['example-node'] },
            load: () => import('../../content/getting-started/node.md'),
          },
          {
            dir: 'getting-started',
            slug: 'express',
            title: 'Express',
            headline: 'Angular SSR on Express, with streaming',
            description:
              'Stream an Angular app from Express 5, next to your API routes and behind compression, from the app config to production.',
            runtime: { adapter: 'node', examples: ['example-express'] },
            load: () => import('../../content/getting-started/express.md'),
          },
          {
            dir: 'getting-started',
            slug: 'fastify',
            title: 'Fastify',
            headline: 'Angular SSR on Fastify, with streaming',
            description:
              'Stream an Angular app from a Fastify plugin, next to your routes, with @fastify/static and @fastify/compress.',
            runtime: { adapter: 'fastify', examples: ['example-fastify'] },
            load: () => import('../../content/getting-started/fastify.md'),
          },
          {
            dir: 'getting-started',
            slug: 'nestjs',
            title: 'NestJS',
            headline: 'Angular SSR on NestJS, with streaming',
            description:
              'Stream an Angular app from a NestJS app on platform-express or platform-fastify, next to its controllers, from the app config to running it in production.',
            runtime: { adapter: 'nestjs', examples: ['example-nestjs', 'example-nestjs-fastify'] },
            load: () => import('../../content/getting-started/nestjs.md'),
          },
          {
            dir: 'getting-started',
            slug: 'koa',
            title: 'Koa',
            headline: 'Angular SSR on Koa, with streaming',
            description:
              'Stream an Angular app from Koa, with koa-static, koa-compress and your API routes, from the app config to running it in production.',
            runtime: { adapter: 'node', examples: ['example-koa'] },
            load: () => import('../../content/getting-started/koa.md'),
          },
        ],
      },
      {
        title: 'Edge and other runtimes',
        pages: [
          {
            dir: 'getting-started',
            slug: 'cloudflare-workers',
            title: 'Cloudflare Workers',
            headline: 'Angular SSR on Cloudflare Workers, with streaming',
            description:
              'Stream an Angular app from a Cloudflare Worker, from the app config to the deploy.',
            runtime: { adapter: 'cloudflare', examples: ['example-cloudflare'] },
            load: () => import('../../content/getting-started/cloudflare-workers.md'),
          },
          {
            dir: 'getting-started',
            slug: 'hono',
            title: 'Hono',
            headline: 'Angular SSR on Hono, with streaming',
            description:
              'Stream an Angular app from Hono on Node, Bun, Deno or Cloudflare Workers, next to your API routes.',
            runtime: { examples: ['example-hono', 'example-hono-workers'] },
            load: () => import('../../content/getting-started/hono.md'),
          },
          {
            dir: 'getting-started',
            slug: 'deno',
            title: 'Deno',
            headline: 'Angular SSR on Deno, with streaming',
            description:
              'Stream an Angular app from Deno with Deno.serve, deploy it to Deno Deploy, and what Supabase Edge Functions allow.',
            runtime: { examples: ['example-deno'] },
            load: () => import('../../content/getting-started/deno.md'),
          },
          {
            dir: 'getting-started',
            slug: 'bun',
            title: 'Bun',
            headline: 'Angular SSR on Bun, with streaming',
            description:
              'Stream an Angular app from Bun.serve(), or from Elysia, from the app config to production.',
            runtime: { examples: ['example-bun'] },
            load: () => import('../../content/getting-started/bun.md'),
          },
          {
            dir: 'getting-started',
            slug: 'fastly-compute',
            title: 'Fastly Compute',
            headline: 'Angular SSR on Fastly Compute, with streaming',
            description:
              'Stream an Angular app from Fastly Compute, with its files in a KV Store, from the app config to the deploy.',
            runtime: { examples: ['example-fastly'] },
            load: () => import('../../content/getting-started/fastly-compute.md'),
          },
        ],
      },
      {
        title: 'Hosted platforms',
        pages: [
          {
            dir: 'getting-started',
            slug: 'vercel',
            title: 'Vercel',
            headline: 'Angular SSR on Vercel, with streaming',
            description:
              'Stream an Angular app from a Vercel Function, from the app config to the Build Output Vercel deploys.',
            runtime: { examples: ['example-vercel'] },
            load: () => import('../../content/getting-started/vercel.md'),
          },
          {
            dir: 'getting-started',
            slug: 'netlify',
            title: 'Netlify',
            headline: 'Angular SSR on Netlify, with streaming',
            description:
              'Stream an Angular app from a Netlify Function or an Edge Function, from the app config to the deploy.',
            runtime: { examples: ['example-netlify'] },
            load: () => import('../../content/getting-started/netlify.md'),
          },
          {
            dir: 'getting-started',
            slug: 'aws-lambda',
            title: 'AWS Lambda',
            headline: 'Angular SSR on AWS Lambda, with streaming',
            description:
              'Stream an Angular app from AWS Lambda through a streaming Function URL and CloudFront.',
            runtime: { adapter: 'aws-lambda', examples: ['example-aws-lambda'] },
            load: () => import('../../content/getting-started/aws-lambda.md'),
          },
          {
            dir: 'getting-started',
            slug: 'azure-functions',
            title: 'Azure Functions',
            headline: 'Angular SSR on Azure Functions, with streaming',
            description:
              'Stream an Angular app from Azure Functions, from the app config to the deploy.',
            runtime: { examples: ['example-azure'] },
            load: () => import('../../content/getting-started/azure-functions.md'),
          },
          {
            dir: 'getting-started',
            slug: 'nitro',
            title: 'Nitro',
            headline: 'Angular SSR on Nitro, with streaming',
            description:
              'Stream an Angular app from a Nitro server, deployed with any of its presets: Node, Vercel, Netlify and more.',
            runtime: { adapter: 'nitro', examples: ['example-nitro'] },
            load: () => import('../../content/getting-started/nitro.md'),
          },
        ],
      },
    ],
  },
  {
    id: 'guides',
    title: 'Guides',
    description:
      'Making a page stream, checking that it does, getting it through a proxy, and running it in production.',
    groups: [
      {
        pages: [
          {
            dir: 'guides',
            slug: 'making-something-stream',
            title: 'Making something stream',
            headline: 'Making a @defer block stream from the server',
            description:
              'Which parts of a template stream, which hydrate trigger to pick, and what to expect from them.',
            load: () => import('../../content/guides/making-something-stream.md'),
          },
          {
            dir: 'guides',
            slug: 'coming-from-react-suspense',
            title: 'React Suspense streaming, in Angular',
            description:
              'A Suspense boundary, its fallback and loading.js: what each maps to here, and where streaming an Angular page differs from streaming a React one.',
            load: () => import('../../content/guides/coming-from-react-suspense.md'),
          },
          {
            dir: 'guides',
            slug: 'analog-streaming-ssr',
            title: "Analog's streaming SSR, compared",
            headline: "Analog's streaming SSR and angular-ssr-stream, compared",
            description:
              'One page sent through both, step by step: when each part can be read and clicked, what is better here, and what Analog does that this library does not.',
            load: () => import('../../content/guides/analog-streaming-ssr.md'),
          },
          {
            dir: 'guides',
            slug: 'debugging',
            title: 'Troubleshooting',
            headline: 'Troubleshooting streamed Angular SSR',
            description:
              'What you see when a page does not stream or hydrate, how to confirm the cause, and what to change.',
            load: () => import('../../content/guides/debugging.md'),
          },
          {
            dir: 'guides',
            slug: 'streaming-through-proxies',
            title: 'Streaming through proxies',
            headline: 'Streaming SSR through proxies, CDNs and compression',
            description:
              'Compression, Nginx, CDNs and timeouts: what holds a streamed response back, and how to check that it does not.',
            load: () => import('../../content/guides/streaming-through-proxies.md'),
          },
          {
            dir: 'guides',
            slug: 'production',
            title: 'Going to production',
            headline: 'Streamed Angular SSR in production',
            description:
              'Status codes, crawlers and metadata, Content Security Policy, caching, Web Vitals and request context, with a checklist.',
            load: () => import('../../content/guides/production.md'),
          },
          {
            dir: 'guides',
            slug: 'service-worker',
            title: 'Service Worker (experimental)',
            headline: 'Angular SSR in a Service Worker (experimental)',
            description:
              'Render and stream every navigation from a Service Worker in the browser, offline included, and what that costs.',
            runtime: { examples: ['example-service-worker'] },
            load: () => import('../../content/guides/service-worker.md'),
          },
        ],
      },
    ],
  },
  {
    id: 'concepts',
    title: 'How it works',
    description:
      'What Angular has and what it lacks, why stream out of order, what goes over the wire, and what does not work yet.',
    groups: [
      {
        pages: [
          {
            dir: 'concepts',
            slug: 'angular-streaming-ssr',
            title: 'Does Angular support streaming SSR?',
            description:
              'No: Angular sends a server-rendered page whole. Why it can look as if it streamed, what it has instead, and how to add streaming to it.',
            load: () => import('../../content/concepts/angular-streaming-ssr.md'),
          },
          {
            dir: 'concepts',
            slug: 'why-stream-out-of-order',
            title: 'Why stream out of order',
            headline: 'Why stream server-rendered HTML out of order',
            description:
              'What streaming out of order buys a page, and how other frameworks came to it.',
            load: () => import('../../content/concepts/why-stream-out-of-order.md'),
          },
          {
            dir: 'concepts',
            slug: 'walkthrough',
            title: 'One response, flush by flush',
            headline: 'One streamed Angular response, flush by flush',
            description:
              'A real response taken apart: the HTML each flush carries, and when each part hydrates.',
            load: () => import('../../content/concepts/walkthrough.md'),
          },
          {
            dir: 'concepts',
            slug: 'internals',
            title: 'Wire format and internals',
            headline: 'Wire format and internals of streamed Angular SSR',
            description:
              'The chunk format, what the server does on each flush, and what the browser does with it.',
            load: () => import('../../content/concepts/internals.md'),
          },
          {
            dir: 'reference',
            slug: 'limitations',
            title: 'Caveats and limitations',
            headline: 'Caveats and limitations of streaming Angular SSR',
            description: 'What does not work yet, and why.',
            load: () => import('../../content/reference/limitations.md'),
          },
        ],
      },
    ],
  },
  {
    id: 'reference',
    title: 'API reference',
    description: 'Every export of every package, in the order of the runtimes.',
    collapsed: true,
    groups: [
      {
        pages: [
          {
            dir: 'reference',
            slug: 'core',
            title: 'angular-ssr-stream-core',
            headline: '@push-based/angular-ssr-stream-core API',
            description:
              'The API of @push-based/angular-ssr-stream-core: the client providers and the runtime-agnostic server handler.',
            load: () => import('../../content/reference/core.md'),
          },
          {
            dir: 'reference',
            slug: 'angular-ssr',
            title: 'angular-ssr-stream-angular-ssr',
            description:
              'The API of @push-based/angular-ssr-stream-angular-ssr: streaming for @angular/ssr, and the renderer main.server.ts exports.',
            load: () => import('../../content/reference/angular-ssr.md'),
          },
          {
            dir: 'reference',
            slug: 'node',
            title: 'angular-ssr-stream-node',
            headline: '@push-based/angular-ssr-stream-node API',
            description:
              'The API of @push-based/angular-ssr-stream-node: a Node request handler, the pieces it is made of, and a Vite plugin for dev.',
            load: () => import('../../content/reference/node.md'),
          },
          {
            dir: 'reference',
            slug: 'fastify',
            title: 'angular-ssr-stream-fastify',
            headline: '@push-based/angular-ssr-stream-fastify API',
            description:
              'The API of @push-based/angular-ssr-stream-fastify: a Fastify plugin that streams every page route.',
            load: () => import('../../content/reference/fastify.md'),
          },
          {
            dir: 'reference',
            slug: 'nestjs',
            title: 'angular-ssr-stream-nestjs',
            headline: '@push-based/angular-ssr-stream-nestjs API',
            description:
              'The API of @push-based/angular-ssr-stream-nestjs: a Nest module that renders every page route, and a Vite plugin for dev.',
            load: () => import('../../content/reference/nestjs.md'),
          },
          {
            dir: 'reference',
            slug: 'cloudflare',
            title: 'angular-ssr-stream-cloudflare',
            headline: '@push-based/angular-ssr-stream-cloudflare API',
            description:
              'The API of @push-based/angular-ssr-stream-cloudflare: a Worker fetch handler over the ASSETS binding.',
            load: () => import('../../content/reference/cloudflare.md'),
          },
          {
            dir: 'reference',
            slug: 'aws-lambda',
            title: 'angular-ssr-stream-aws-lambda',
            headline: '@push-based/angular-ssr-stream-aws-lambda API',
            description:
              'The API of @push-based/angular-ssr-stream-aws-lambda: a response-streaming handler for a Lambda Function URL.',
            load: () => import('../../content/reference/aws-lambda.md'),
          },
          {
            dir: 'reference',
            slug: 'nitro',
            title: 'angular-ssr-stream-nitro',
            headline: '@push-based/angular-ssr-stream-nitro API',
            description:
              'The API of @push-based/angular-ssr-stream-nitro: an h3 handler, and a Vite plugin that gives it the template.',
            load: () => import('../../content/reference/nitro.md'),
          },
        ],
      },
    ],
  },
  {
    id: 'about',
    title: 'About',
    description: 'Questions, releases and the logo.',
    groups: [
      {
        pages: [
          {
            dir: 'reference',
            slug: 'faq',
            title: 'FAQ',
            headline: 'Streaming SSR for Angular: frequently asked questions',
            description:
              'Short answers on Angular support, SEO, caching, the Angular CLI, failures and readiness, each linking the page with the long one.',
            load: () => import('../../content/reference/faq.md'),
          },
          {
            dir: 'reference',
            slug: 'releases',
            title: 'Releases and upgrading',
            headline: 'angular-ssr-stream releases, and upgrading Angular and the packages',
            description:
              'How the packages are versioned and tagged, where the release notes are, and how to upgrade Angular and the packages.',
            load: () => import('../../content/reference/releases.md'),
          },
          {
            dir: 'reference',
            slug: 'press-kit',
            title: 'Press kit',
            description: 'The angular-ssr-stream logo: the files, the colours and how to use them.',
            load: () => import('../../content/reference/press-kit.md'),
          },
        ],
      },
    ],
  },
];

export interface FlatDocPage extends DocPageEntry {
  section: DocSection;
  /** `docs/<dir>/<slug>`, relative to the base href. */
  path: string;
}

export const ALL_PAGES: FlatDocPage[] = DOCS.flatMap((section) =>
  section.groups.flatMap((group) =>
    group.pages.map((page) => ({
      ...page,
      section,
      path: `docs/${page.dir}/${page.slug}`,
    })),
  ),
);

export function findPage(dir: string, slug: string): FlatDocPage | undefined {
  return ALL_PAGES.find((page) => page.dir === dir && page.slug === slug);
}

/** What a page is called where it stands alone: see `DocPageEntry.headline`. */
export function headlineOf(page: DocPageEntry): string {
  return page.headline ?? page.title;
}

/** The API page of a runtime's adapter; the core's, for a runtime that needs none. */
export function referenceOf(runtime: RuntimeFacts): FlatDocPage | undefined {
  return findPage('reference', runtime.adapter ?? 'core');
}

/** The setup pages an API page belongs to: the reverse of `referenceOf()`. */
export function setupsOf(page: FlatDocPage): FlatDocPage[] {
  if (page.dir !== 'reference') {
    return [];
  }
  return ALL_PAGES.filter(
    (other) => other.runtime !== undefined && referenceOf(other.runtime) === page,
  );
}

/**
 * The pages before and after one, in reading order. Alternatives are left out
 * of that order, except the page itself: after Installation and after NestJS
 * comes the first guide, not the next runtime.
 */
export function neighboursOf(page: FlatDocPage): {
  previous: FlatDocPage | undefined;
  next: FlatDocPage | undefined;
} {
  const sequence = ALL_PAGES.filter((other) => other === page || !other.section.alternatives);
  const index = sequence.indexOf(page);
  return { previous: sequence[index - 1], next: sequence[index + 1] };
}

/** What `scripts/prerender.ts` writes, relative to the base href. `404` becomes `404.html`. */
export const PRERENDERED_ROUTES: string[] = ['', ...ALL_PAGES.map((page) => page.path), '404'];
