import type { ServerResponse } from 'node:http';
import { BadRequestException, type OnModuleInit } from '@nestjs/common';
import type { HttpAdapterHost, ModuleRef } from '@nestjs/core';
import {
  BadRequestError,
  type NodeRequest,
  createNodeHandler,
} from '@push-based/angular-stream-node';
import type { AngularStreamModuleOptions } from './options';
import { globalPrefix, isUnderPrefix } from './prefix';

type Next = (error?: unknown) => void;

/**
 * Adds the render route to the HTTP adapter once the controllers' routes are
 * registered (`onModuleInit` runs after them, and before Nest's 404 and error
 * handlers), so a controller always answers first and a page only renders for
 * a request no controller took.
 */
export class AngularStreamRenderer implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly moduleRef: ModuleRef,
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

    const handler = createNodeHandler(this.options);
    const prefix = globalPrefix(this.moduleRef);
    // Middleware, not a route: it passes methods other than GET and HEAD on,
    // and errors before the response has started, to Nest's own handlers.
    adapter.use((req: NodeRequest, res: ServerResponse, next: Next) => {
      // Under the global prefix, a request no controller took is Nest's 404.
      if (prefix !== null && isUnderPrefix(req.originalUrl ?? req.url ?? '/', prefix)) {
        next();
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
