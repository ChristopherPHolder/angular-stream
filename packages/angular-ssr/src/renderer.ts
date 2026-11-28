import { PlatformLocation } from '@angular/common';
import {
  type ApplicationRef,
  LOCALE_ID,
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  type StaticProvider,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  type StreamingBootstrap,
  renderStreamingAngular,
} from '@push-based/angular-ssr-stream-core/server';

/** One server-rendered route, as `withStreaming()` hands it over. */
export interface StreamingRouteRender {
  /** `main.server.ts`'s default export. */
  bootstrap: StreamingBootstrap;
  /** `index.server.html`, after `@angular/ssr`'s HTML transforms. */
  document: string;
  request: Request;
  /** The URL to render: the request's, without a trailing `index.html`. */
  url: URL;
  requestContext?: unknown;
  /** Status and headers from the server route; the app may change them. */
  responseInit: ResponseInit & { headers: Headers };
  locale?: string;
  /** `@angular/ssr`'s critical CSS inlining, applied to the shell. */
  transformDocument?: (document: string) => string | Promise<string>;
}

/**
 * Renders one server-rendered route as a stream. `withStreaming()` calls it,
 * so it has to come from the server bundle the application is in: export it
 * from `src/main.server.ts`.
 *
 * ```ts
 * export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
 * ```
 *
 * The Angular CLI bundles `server.ts` and `main.server.ts` separately, each
 * with its own copy of Angular. The application runs on `main.server.ts`'s, so
 * that is the one it has to be rendered with.
 *
 * Resolves to `null` when the router never finished a navigation, as
 * `@angular/ssr` does: the request isn't the app's to answer.
 */
export async function streamingRenderer(route: StreamingRouteRender): Promise<Response | null> {
  const { request, url, responseInit, locale } = route;
  const platformProviders: StaticProvider[] = [
    { provide: REQUEST, useValue: request },
    { provide: REQUEST_CONTEXT, useValue: route.requestContext },
    { provide: RESPONSE_INIT, useValue: responseInit },
  ];
  if (locale !== undefined) {
    platformProviders.push({ provide: LOCALE_ID, useValue: locale });
  }

  let navigationFailed = false;
  const response = await renderStreamingAngular({
    bootstrap: route.bootstrap,
    document: route.document,
    url: url.href,
    platformProviders,
    responseInit,
    signal: request.signal,
    transformDocument: route.transformDocument,
    beforeCommit: (applicationRef) => {
      const result = redirectIfNavigated(applicationRef, url, responseInit);
      if (result === null) {
        navigationFailed = true;
        // Any response stops the render; this one is never sent.
        return new Response(null, { status: 404 });
      }
      return result;
    },
  });

  return navigationFailed ? null : response;
}

/**
 * What `@angular/ssr` does after a render: when the router ended up somewhere
 * other than the requested URL, a guard or a redirect sent it there, and the
 * browser should go there too. `null` when no navigation succeeded.
 */
function redirectIfNavigated(
  applicationRef: ApplicationRef,
  url: URL,
  responseInit: ResponseInit & { headers: Headers },
): Response | undefined | null {
  const injector = applicationRef.injector;
  if (injector.get(ActivatedRoute, null) === null) {
    return undefined;
  }

  const router = injector.get(Router);
  // A signal since Angular 21, a property before.
  const lastNavigation: unknown = router.lastSuccessfulNavigation;
  const navigation =
    typeof lastNavigation === 'function' ? (lastNavigation as () => unknown)() : lastNavigation;
  if (navigation === null || navigation === undefined) {
    return null;
  }

  const { pathname, search } = injector.get(PlatformLocation);
  const normalize = (path: string): string => router.serializeUrl(router.parseUrl(path));
  if (normalize(pathname + search) === normalize(url.pathname + url.search)) {
    return undefined;
  }

  const status = responseInit.status ?? 0;
  const headers = new Headers(responseInit.headers);
  headers.set('Location', pathname + search);
  return new Response(null, { status: status >= 300 && status < 400 ? status : 302, headers });
}
