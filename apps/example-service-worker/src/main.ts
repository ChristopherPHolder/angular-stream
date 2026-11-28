import { bootstrapApplication } from '@angular/platform-browser';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { appConfig } from './app/app.config';

bootstrapApplication(ExamplePage, appConfig).catch((error) => console.error(error));

// The first visit is served as it is; from the next navigation on, the worker renders the page.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error) => console.error(error));
}
