import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

// `BootstrapContext`, spelled so that it compiles on every Angular version the
// fixture runs on: the type isn't exported by all of them.
type BootstrapContext = Parameters<typeof bootstrapApplication>[2];

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;

export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
