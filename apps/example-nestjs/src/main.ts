import { bootstrapApplication } from '@angular/platform-browser';
import { ExamplePage } from '@angular-ssr-stream/stream-example';
import { appConfig } from './app/app.config';

bootstrapApplication(ExamplePage, appConfig).catch((error) => console.error(error));
