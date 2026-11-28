import { DOCS } from './docs/nav';
import { DEMO, REPO, SITE } from './links';

/**
 * What a language model should know before it reads a page: what the project
 * is, and the facts it most often gets wrong about Angular and streaming.
 * Each line is said at length, with its sources, on a page listed below it.
 */
const SUMMARY = `# angular-ssr-stream

> Streaming server-side rendering (SSR) for Angular. The server sends a page's shell at once and streams each slow part into the same response as its data arrives. The browser hydrates the page while the response is still open, and nothing is fetched twice.

- Angular has no streaming SSR of its own: \`renderApplication()\` and \`@angular/ssr\` send a page whole, once the application is stable. angular-ssr-stream is a library that adds out-of-order streaming on top of Angular's incremental hydration. It is a community project by PushBased, not affiliated with or endorsed by Google or the Angular team.
- A part of a page streams when it is a \`@defer\` block with a \`hydrate\` trigger, placed directly inside an element. \`hydrate when <its data is there>\` is the trigger to prefer. Everything outside such a block is the shell, which is sent once.
- An app needs two things: \`provideStreamHydration()\` and \`streamHttpInterceptor\` in its browser config, and a server entry. The server entry is \`createStreamingHandler()\` from \`@push-based/angular-ssr-stream-core/server\` on a runtime that speaks web \`Request\` and \`Response\`, or the adapter package for its runtime.
- It supports a narrow range of Angular versions, named on the Installation page, and needs the app to be standalone and zoneless. It does not use \`@angular/ssr\`: \`AngularAppEngine\`, server routes and per-route render modes are not available.
- Streaming does not make a slow request faster. It stops the rest of the page from waiting for it. The status code is sent with the shell, and a streamed response is not cached.

Source: ${REPO}
Live demo: ${DEMO}`;

/**
 * The docs as [llms.txt](https://llmstxt.org/): the summary, then every page
 * of the contents with its one-sentence description, by section. Written from
 * the same list as the sidebar and the sitemap, so a page added to `DOCS` is
 * in it. `scripts/prerender.ts` writes it next to sitemap.xml.
 */
export function llmsTxt(): string {
  const sections = DOCS.map((section) => {
    const pages = section.groups
      .flatMap((group) => group.pages)
      .map(
        (page) => `- [${page.title}](${SITE}docs/${page.dir}/${page.slug}): ${page.description}`,
      );
    return `## ${section.title}\n\n${section.description}\n\n${pages.join('\n')}`;
  });
  return `${SUMMARY}\n\n${sections.join('\n\n')}\n`;
}
