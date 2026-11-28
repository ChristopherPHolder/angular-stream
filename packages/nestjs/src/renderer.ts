import type { OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import type { AbstractHttpAdapter, ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { addExpressRenderer } from './express';
import type { addFastifyRenderer } from './fastify';
import type { AngularStreamModuleOptions } from './options';
import { globalPrefix } from './prefix';

/** The `getType()` of the HTTP adapters the module renders pages on. */
const PLATFORMS = ['express', 'fastify'];

/**
 * Adds the render route to the HTTP adapter last: right before Nest's 404 and
 * error handlers, which `app.init()` adds once every module's `onModuleInit`
 * has run. Controllers, and whatever other modules add in their own
 * `onModuleInit` (`ServeStaticModule`, `GraphQLModule`), answer first,
 * whatever order Nest initializes the modules in, and a page only renders for
 * a request none of them took.
 *
 * On Fastify a module can't add a catch-all route of its own (`ServeStaticModule`
 * does, and the app fails to start): Fastify refuses duplicate routes.
 *
 * On `@nestjs/platform-express`, that order is what puts the render route
 * after the others. On `@nestjs/platform-fastify`, the most specific route
 * answers wherever it was added, and adding the route last keeps it after
 * the plugins the app registered, `@fastify/compress` among them.
 */
export class AngularStreamRenderer implements OnModuleInit, OnApplicationBootstrap {
  private registered = false;
  /** Loaded on Fastify only, so an Express app needs no Fastify packages. */
  private addFastify: typeof addFastifyRenderer | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ApplicationConfig,
    private readonly options: AngularStreamModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const adapter = this.adapterHost.httpAdapter;
    // An application context (`NestFactory.createApplicationContext()`) has no HTTP server.
    if (adapter === undefined) {
      return;
    }
    const type = adapter.getType();
    if (!PLATFORMS.includes(type)) {
      throw new Error(
        `[angular-ssr-stream] AngularStreamModule renders pages on @nestjs/platform-express or @nestjs/platform-fastify; this application runs on '${type}'.`,
      );
    }

    if (type === 'fastify') {
      // Nest awaits this hook before it adds its 404 handler, so the wrap below still comes first.
      this.addFastify = await import('./fastify').then(
        (module) => module.addFastifyRenderer,
        (error: unknown) => {
          throw new Error(
            '[angular-ssr-stream] On @nestjs/platform-fastify, AngularStreamModule needs @push-based/angular-ssr-stream-fastify: npm install @push-based/angular-ssr-stream-fastify@next',
            { cause: error },
          );
        },
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
    const prefix = globalPrefix(this.config);
    if (adapter.getType() === 'fastify' && this.addFastify !== undefined) {
      this.addFastify(adapter.getInstance<FastifyInstance>(), this.options, prefix);
    } else {
      addExpressRenderer(adapter, this.options, prefix);
    }
  }
}
