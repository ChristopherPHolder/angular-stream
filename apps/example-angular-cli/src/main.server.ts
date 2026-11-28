import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;

// Lets withStreaming() in server.ts render with this bundle's copy of Angular.
export { streamingRenderer } from '@push-based/angular-ssr-stream-angular-ssr/renderer';
