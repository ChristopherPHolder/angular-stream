import type { DynamicModule, Provider } from '@nestjs/common';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import {
  ANGULAR_STREAM_OPTIONS,
  ASYNC_OPTIONS_TYPE,
  type AngularStreamModuleOptions,
  ConfigurableModuleClass,
  OPTIONS_TYPE,
} from './options';
import { AngularStreamRenderer } from './renderer';

// A factory provider: the package is published without decorators, so nothing
// depends on how the app compiles them or on `emitDecoratorMetadata`.
const RENDERER: Provider = {
  provide: AngularStreamRenderer,
  useFactory: (
    adapterHost: HttpAdapterHost,
    config: ApplicationConfig,
    options: AngularStreamModuleOptions,
  ) => new AngularStreamRenderer(adapterHost, config, options),
  inject: [HttpAdapterHost, ApplicationConfig, ANGULAR_STREAM_OPTIONS],
};

function withRenderer(module: DynamicModule): DynamicModule {
  return { ...module, providers: [...(module.providers ?? []), RENDERER] };
}

/**
 * Streams the Angular application from a Nest app on `@nestjs/platform-express`.
 *
 * Every `GET` and `HEAD` that nothing else answers, neither a controller nor
 * middleware another module adds when the app initializes, is rendered as a
 * page, except under the global prefix (`app.setGlobalPrefix('api')`), which
 * stays the API's: an unknown `/api/...` gets Nest's 404. With `staticDir`,
 * files in the browser build are served first. A missing file under
 * `/assets/` is a 404, not a page.
 *
 * Pages aren't controller routes, so guards, interceptors and pipes don't run
 * for them, and nothing of Nest's buffers or rewrites a response that has
 * started. An error before the response starts (a bad `Host` is a 400) goes to
 * Nest's exception filters; one after it cuts the connection, as the Node
 * adapter does.
 */
export class AngularStreamModule extends ConfigurableModuleClass {
  static override forRoot(options: typeof OPTIONS_TYPE): DynamicModule {
    return withRenderer(super.forRoot(options));
  }

  static override forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
    return withRenderer(super.forRootAsync(options));
  }
}
