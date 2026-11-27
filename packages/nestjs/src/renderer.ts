import type { ServerResponse } from 'node:http';
import {
  BadRequestException,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import type { AbstractHttpAdapter, ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import {
  BadRequestError,
  type NodeRequest,
  type StaticHandler,
  createNodeHandler,
  createStaticHandler,
} from '@push-based/angular-stream-node';
import type { AngularStreamModuleOptions } from './options';
import { globalPrefix, isUnderPrefix } from './prefix';

type Next = (error?: unknown) => void;

/**
 * Adds the render route to the HTTP adapter last: right before Nest's 404 and
 * error handlers, which `app.init()` adds once every module's `onModuleInit`
 * has run. Controllers, and whatever other modules add in their own
 * `onModuleInit` (`ServeStaticModule`, `GraphQLModule`), answer first,
 * whatever order Nest initializes the modules in, and a page only renders for
 * a request none of them took.
 */
export class AngularStreamRenderer implements OnModuleInit, OnApplicationBootstrap {
  private registered = false;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ApplicationConfig,
    private readonly options: AngularStreamModuleOptions,
  ) {}

  onModuleInit(): void {
    const adapter = this.adapterHost.httpAdapter;
    // An application context (`NestFactory.createApplicationContext()`) has no HTTP server.
    if (adapter === undefined) {
      return;
    }
    const type = adapter.getType();
    if (type !== 'express') {
      throw new Error(
        `[angular-stream] AngularStreamModule renders pages on @nestjs/platform-express; this application runs on '${type}'.`,
      );
    }

    // Nest adds its 404 handler with `setNotFoundHandler()`, once, after the
    // `onModuleInit` hooks: the render route goes in just before it.
    const setNotFoundHandler = adapter.setNotFoundHandler.bind(adapter);
    adapter.setNotFoundHandler = (...args: Parameters<typeof setNotFoundHandler>) => {
      adapter.setNotFoundHandler = setNotFoundHandler;
      this.register(adapter);
      return setNotFoundHandler(...args);
    };
  }

  onApplicationBootstrap(): void {
    // Only if Nest never called `setNotFoundHandler()`: pages then come after
    // whatever it added instead, rather than not at all.
    const adapter = this.adapterHost.httpAdapter;
    if (adapter !== undefined && !this.registered) {
      this.register(adapter);
    }
  }

  private register(adapter: AbstractHttpAdapter): void {
    this.registered = true;
    const { staticDir } = this.options;
    const handler = createNodeHandler(this.options);
    const serveStatic: StaticHandler =
      staticDir === undefined ? async () => false : createStaticHandler(staticDir);
    const prefix = globalPrefix(this.config);

    // Middleware, not a route: it passes methods other than GET and HEAD on,
    // and errors before the response has started, to Nest's own handlers.
    adapter.use((req: NodeRequest, res: ServerResponse, next: Next) => {
      const target = req.originalUrl ?? req.url ?? '/';
      // Under the global prefix, a request no controller took is Nest's 404.
      if (prefix !== null && isUnderPrefix(target, prefix)) {
        next();
        return;
      }
      // Vite's hashed build output. A file that isn't there, such as an old
      // chunk after a deploy, is a 404 rather than a page.
      if (isUnderPrefix(target, '/assets')) {
        serveStatic(req, res).then((served) => {
          if (!served) {
            next(new NotFoundException(`Cannot ${req.method} ${target}`));
          }
        }, next);
        return;
      }
      handler(req, res, (error?: unknown) => {
        // Nest maps an error to its status only when it is an HttpException
        // (or http-errors'); anything else is a 500.
        next(
          error instanceof BadRequestError
            ? new BadRequestException(error.message, { cause: error })
            : error,
        );
      });
    });
  }
}
